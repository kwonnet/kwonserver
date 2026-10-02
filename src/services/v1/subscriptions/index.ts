import { paymentMethodSchema } from "@/schema/payment";
import prisma from "@/db";
import { generateUniqueRef } from "@/utils";
import {
  BillingCycleEnum,
  Subscription,
  SubStatusEnum,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
  UserTypeEnum,
} from "@prisma/client";
import { syncPrismaUserWalletToRedis } from "../../helper";
import { syncUserRedisWalletToPrisma } from "../games";

import { addSubscriptionCronJob, removeSubscriptionCronJob } from "@/cron/utils";

export const getPlans = async () => {
  try {
    const data = await prisma.subscriptionPlan.findMany({
      include: { features: true },
    });
    
    const isFound = data.length > 0;

    return { data: isFound ? data : "Not found", status: isFound ? 200 : 404 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const purchaseAppSubscriptionWithWallet = async (
  item: {
    planId: string;
    amount: number;
    currency: TxnCurrencyEnum;
    planType: BillingCycleEnum;
    isRecurring: boolean;
    meta?: { [key: string]: any };
  },
  userId: string
) => {
  try {
    // get user
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user) return { data: "User not found", status: 400 };
    // get plan package
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: item.planId },
    });

    if (!plan) return { data: "Error: Invalid subscription plan", status: 400 };
    // sync user redis and prisma wallet
    await syncUserRedisWalletToPrisma(user.id);
    // get user wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });

    if (!wallet) return { data: "Cannot retrieve user wallet", status: 400 };

    if (wallet.isLocked)
      return {
        data: "User wallet is temporary locked at the moment",
        status: 400,
      };

    if (wallet.credit < item.amount)
      return {
        data: "Insufficient balance to pay for this subscription plan, please try another one!",
        status: 400,
      };
    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await prisma.$transaction(async (tx) => {
      // debit user wallet credit
      const userWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: true,
          credit: { decrement: item.amount },
        },
      });
      // disable current active subscription
      await tx.subscription.updateMany({
        where: { userId: user.id, status: "ACTIVE" },
        data: { status: "PAUSED" },
      });
      // disable all primary
      await tx.subscription.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });
      // get subscription
      const currentSub = await prisma.subscription.findFirst({
        where: { userId: user.id, planId: item.planId },
      });
      let subscription: Subscription | undefined = undefined;
      // check if user has an active subscription and the plan is different
      if (!currentSub) {
        // create new subscription
        const startDate = new Date();
        const date = new Date();
        const endDate =
          item.planType === BillingCycleEnum.MONTHLY
            ? new Date(date.setUTCMonth(date.getUTCMonth() + 1))
            : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
        subscription = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: item.planId,
            billingCycle: item.planType,
            isRecurring: item.isRecurring,
            startDate,
            endDate,
            status: "ACTIVE",
            isPrimary: true,
            ...(item?.meta?.tierId && { meta: { tierId: item.meta?.tierId } }),
          },
        });
      } else {
        // update existing subscription
        const startDate = new Date();
        const date = new Date();
        const endDate =
          item.planType === BillingCycleEnum.MONTHLY
            ? new Date(date.setMonth(date.getUTCMonth() + 1))
            : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
        // metadata
        const metadata = currentSub.metadata.concat([
          {
            id: currentSub.id,
            billingCycle: currentSub.billingCycle,
            planId: currentSub.planId,
            startDate: currentSub.startDate,
            endDate: currentSub.endDate,
            status: currentSub.status,
            isPrimary: currentSub.isPrimary,
            tierId: item.meta?.tierId,
            meta: currentSub.meta,
          },
        ]);
        // update existing subscription
        subscription = await tx.subscription.update({
          where: { id: currentSub.id },
          data: {
            planId: item.planId,
            billingCycle: item.planType,
            isRecurring: item.isRecurring,
            startDate,
            endDate,
            status: "ACTIVE",
            isPrimary: true,
            metadata,
            ...(item?.meta?.tierId && { meta: { tierId: item.meta?.tierId } }),
          },
        });
      }
      // save debit transaction record
      await tx.transaction.create({
        data: {
          amount: item.amount,
          currency: item.currency,
          subPlanId: item.planId,
          subscriptionId: subscription?.id,
          category: TxnCategoryEnum.APP_SUBSCRIPTION,
          description: `Charged ${item.amount} ${item.currency} from your wallet credit for ${item.planType} ${plan.name} subscription plan.`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.CREDIT,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: user.id,
          senderId: user.id,
          walletId: wallet.id,
          metadata: { ...item.meta },
        },
      });
      // update user meta objec
      await tx.user.update({
        where: { id: user.id },
        data: {
          meta: {
            status: "ACTIVE",
            type: "PRO",
            color:
              user.userType === UserTypeEnum.GOVERNMENT
                ? "grey"
                : user.userType === UserTypeEnum.BUSINESS
                ? "gold"
                : "blue",
          },
        },
      });
      // unlock user wallet credit
      await tx.wallet.update({
        where: { userId: user.id },
        data: { isLocked: false },
      });
      // return
      return { wallet: userWallet, subscription };
    });
    // add subscription to cron job
    if (result.subscription.isRecurring) {
      addSubscriptionCronJob(result.subscription.id);
    }
    else{
      removeSubscriptionCronJob({userId: user.id, subId: result.subscription.id})
    }
    
    // sync prisma wallet to redis
    syncPrismaUserWalletToRedis(user.id, result.wallet);
    return { data: item, status: 200 };
  } catch (error: any) {
    return {
      data: "Error: Failed to process transaction, please contact support",
      status: 500,
    };
  }
};

export const renewAppSubscriptionWithWallet = async (subId: string) => {
  // const isTest = true
  // if(isTest){
  //   return {
  //     isError: true,
  //     message: "App subscription renewal error, subscription record not found",
  //     status: 404,
  //   };
  // }
  try {
    const currentSub = await prisma.subscription.findUnique({
      where: { id: subId },
      include: {
        user: true,
        plan: true,
        transactions: {
          where: {
            subscriptionId: subId,
            category: TxnCategoryEnum.APP_SUBSCRIPTION,
            currency: TxnCurrencyEnum.TZX,
          },
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });
    if (!currentSub) {
      return {
        isError: true,
        message:
          "App subscription renewal error, subscription record not found",
        status: 404,
      };
    }
    // get the latest transaction detail
    const subTxn = currentSub.transactions[0];
    if (!subTxn) {
      return {
        isError: true,
        message:
          "App subscription renewal error, previous transaction record not found",
        status: 404,
      };
    }
    // get plan package
    const plan = currentSub.plan;
    // get user
    const user = currentSub.user;
    // sync user redis and prisma wallet
    await syncUserRedisWalletToPrisma(user.id);
    // get user wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });

    if (!wallet) {
      return {
        message: "App subscription renewal error, cannot retrieve user wallet",
        status: 404,
        isError: true,
      };
    }

    if (wallet.credit < subTxn.amount)
      return {
        message: "App subscription renewal error, insufficient balance!",
        status: 400,
        isError: true,
      };
    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await prisma.$transaction(async (tx) => {
      // debit user wallet credit
      const userWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: true,
          credit: { decrement: subTxn.amount },
        },
      });
      // disable current active subscription
      await tx.subscription.updateMany({
        where: { userId: user.id, status: "ACTIVE" },
        data: { status: "PAUSED" },
      });
      // disable all primary
      await tx.subscription.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });

      // update existing subscription
      const startDate = new Date();
      const date = new Date();
      const endDate =
        currentSub.billingCycle === BillingCycleEnum.MONTHLY
          ? new Date(date.setMonth(date.getUTCMonth() + 1))
          : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
      // metadata
      const currentSubMeta = currentSub?.meta as { [key: string]: any };
      const metadata = currentSub.metadata.concat([
        {
          id: currentSub.id,
          billingCycle: currentSub.billingCycle,
          planId: currentSub.planId,
          startDate: currentSub.startDate,
          endDate: currentSub.endDate,
          status: currentSub.status,
          isPrimary: currentSub.isPrimary,
          tierId: currentSubMeta?.tierId,
          meta: currentSub.meta,
        },
      ]);
      // update existing subscription
      const updatedSub = await tx.subscription.update({
        where: { id: currentSub.id },
        data: {
          planId: currentSub.planId,
          billingCycle: currentSub.billingCycle,
          isRecurring: currentSub.isRecurring,
          startDate,
          endDate,
          status: "ACTIVE",
          isPrimary: true,
          metadata,
          meta: currentSub.meta,
        },
      });
      const tier = plan.tier.find((t) => t.id === currentSubMeta?.tierId);
      const planName = tier ? `${plan.name} ~ ${tier.name}` : plan.name;
      // save debit transaction record
      await tx.transaction.create({
        data: {
          amount: subTxn.amount,
          currency: subTxn.currency,
          subPlanId: currentSub.planId,
          subscriptionId: currentSub?.id,
          category: TxnCategoryEnum.APP_SUBSCRIPTION,
          description: `Renewed ${currentSub.billingCycle} ${planName} subscription plan for ${subTxn.amount} ${subTxn.currency}.`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.CREDIT,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: user.id,
          recipientId: user.id,
          walletId: wallet.id,
          metadata: subTxn.metadata,
        },
      });
      // update user meta objec
      await tx.user.update({
        where: { id: user.id },
        data: {
          meta: {
            status: "ACTIVE",
            type: "PRO",
            color:
              user.userType === UserTypeEnum.GOVERNMENT
                ? "grey"
                : user.userType === UserTypeEnum.BUSINESS
                ? "gold"
                : "blue",
          },
        },
      });
      // unlock user wallet credit
      await tx.wallet.update({
        where: { userId: user.id },
        data: { isLocked: false },
      });

      return { wallet: userWallet, sub: updatedSub };
    });
    // sync prisma wallet to redis
    syncPrismaUserWalletToRedis(user.id, result.wallet);
    return {
      message: "App subscription renewed successfully",
      status: 200,
      isError: false,
    };
  } catch (error: any) {
    return {
      message:
        "App subscription renewal failed, ensure you have sufficient wallet balance.",
      status: 500,
      isError: true,
    };
  }
};

export const purchaseAppSubscription = async (
  item: {
    planId: string;
    amount: number;
    currency: TxnCurrencyEnum;
    planType: BillingCycleEnum;
    source: TxnSourceEnum;
    gateway: TxnGatewayEnum;
    isRecurring: boolean;
    planName: string;
    meta?: { [key: string]: any };
  },
  userId: string
) => {
  if (!paymentMethodSchema.safeParse(item).success) {
    return { data: "Unsupported payment method", status: 400 };
  }
  try {
    // get user
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user) return { data: "User not found", status: 400 };
    // get plan package
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: item.planId },
    });

    if (!plan) return { data: "Error: Invalid subscription plan", status: 400 };
    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();
    const result = await prisma.$transaction(async (tx) => {
      // disable current active subscription
      await tx.subscription.updateMany({
        where: { userId: user.id, status: "ACTIVE" },
        data: { status: "PAUSED" },
      });
      // disable all primary
      await tx.subscription.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });
      // get subscription
      const currentSub = await prisma.subscription.findFirst({
        where: { userId: user.id, planId: item.planId },
      });
      let subscription: Subscription | undefined = undefined;
      // check if user has an active subscription and the plan is different
      if (!currentSub) {
        // create new subscription
        const startDate = new Date();
        const date = new Date();
        const endDate =
          item.planType === BillingCycleEnum.MONTHLY
            ? new Date(date.setMonth(date.getUTCMonth() + 1))
            : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
        // create new subscription
        subscription = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: item.planId,
            billingCycle: item.planType,
            isRecurring: item.isRecurring,
            startDate,
            endDate,
            status: "ACTIVE",
            isPrimary: true,
            ...(item?.meta?.tierId && { meta: { tierId: item.meta?.tierId } }),
          },
        });
      } else {
        const startDate = new Date();
        const date = new Date();
        const endDate =
          item.planType === BillingCycleEnum.MONTHLY
            ? new Date(date.setMonth(date.getUTCMonth() + 1))
            : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
        // update meta
        const metadata = currentSub.metadata.concat([
          {
            id: currentSub.id,
            billingCycle: currentSub.billingCycle,
            planId: currentSub.planId,
            startDate: currentSub.startDate,
            endDate: currentSub.endDate,
            status: currentSub.status,
            isPrimary: currentSub.isPrimary,
            tierId: item.meta?.tierId,
            meta: currentSub.meta,
          },
        ]);
        // update existing subscription
        subscription = await tx.subscription.update({
          where: { id: currentSub.id },
          data: {
            planId: item.planId,
            billingCycle: item.planType,
            isRecurring: item.isRecurring,
            startDate,
            endDate,
            status: "ACTIVE",
            isPrimary: true,
            metadata,
            ...(item?.meta?.tierId && { meta: { tierId: item.meta?.tierId } }),
          },
        });
      }
      // save debit transaction record
      await tx.transaction.create({
        data: {
          amount: item.amount,
          currency: item.currency,
          subPlanId: item.planId,
          subscriptionId: subscription?.id,
          category: TxnCategoryEnum.APP_SUBSCRIPTION,
          description: `Purchased ${item.planType} ${item.planName} subscription plan for ${item.amount} ${item.currency}.`,
          gateway: item.gateway,
          source: item.source,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          exTxnRef: item?.meta?.txnRef,
          txnRef,
          userId: user.id,
          senderId: user.id,
          metadata: { ...item.meta },
        },
      });
      // update user meta objec
      await tx.user.update({
        where: { id: user.id },
        data: {
          meta: {
            status: "ACTIVE",
            type: "PRO",
            color:
              user.userType === UserTypeEnum.GOVERNMENT
                ? "grey"
                : user.userType === UserTypeEnum.BUSINESS
                ? "gold"
                : "blue",
          },
        },
      });
      return { subscription}
    });
    // remove subscription cron job if payment method has changed
    removeSubscriptionCronJob({userId: user.id, subId: result.subscription.id})
    return { data: item, status: 200 };
  } catch (error: any) {
    return {
      data: "Error: Failed to process transaction, please contact support",
      status: 500,
    };
  }
};

export const cancelAppSubscription = async (arg: {
  subId: string;
  status: SubStatusEnum;
  // HTTP callers must provide the authenticated owner; background expiry jobs omit it.
  userId?: string;
}) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { id: arg.subId, ...(arg.userId !== undefined && { userId: arg.userId }) },
      include: { user: true },
    });

    if (!sub) return { data: "Subscription not found", status: 404 };
    // get user
    if (!sub.user) return { data: "User not found", status: 404 };
    const user = sub.user;
    // get color
    const color =
      user.accountVerified && user.userType === UserTypeEnum.GOVERNMENT
        ? "grey"
        : user.accountVerified && user.userType === UserTypeEnum.BUSINESS
        ? "gold"
        : "blue";

    const result = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: arg.subId, userId: user.id },
        data: { status: arg.status },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          meta: {
            color,
            status: user.accountVerified ? "ACTIVE" : "INACTIVE",
            type: "LEGACY",
          },
        },
      }),
    ]);
    // remove subscription cron job if subscription is cancelled
    removeSubscriptionCronJob({userId: user.id, subId: arg.subId})
    return { data: result, status: 200 };
  } catch (error) {
    return {
      data: "Error: Failed to process request, please try again later",
      status: 500,
    };
  }
};
