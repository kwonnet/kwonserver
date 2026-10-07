import { cachedCatalogRead } from "@/store";
import logger from '@/logger';
import { lockWallets, walletOperation, WalletError, cents, requestKey } from '@/services/walletLedger';
import { subscriptionPrice, nextBillingDate } from '@/services/walletLedger/pricing';
import { verifiedPaymentId } from '@/services/walletLedger/verifiedPayment';
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
import {logServiceError} from '@/logger/events';

export const getPlans = async () => {
  return cachedCatalogRead("subscription-plans", 60000, async () => {
    try {
      const data = await prisma.subscriptionPlan.findMany({
        include: { features: true },
      });

      const isFound = data.length > 0;

      return { data: isFound ? data : "Not found", status: isFound ? 200 : 404 };
    } catch (error) {
    logServiceError("v1/subscriptions/index", "getPlans", error);

      return { data: "Error occurred, please try again", status: 500 };
    }
  });
};

export const purchaseAppSubscriptionWithWallet = async (
  item: {
    planId: string;
    amount: number;
    currency: TxnCurrencyEnum;
    planType: BillingCycleEnum;
    isRecurring: boolean;
    meta?: { [key: string]: any };
    idempotencyKey?: string;
  },
  userId: string
) => {
  try {
    if (item.currency !== 'TZX') throw new WalletError('Wallet subscriptions require TZX');
    // get user
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user) return { data: "User not found", status: 400 };
    // get plan package
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: item.planId },
    });

    if (!plan) return { data: "Error: Invalid subscription plan", status: 400 };
    item = { ...item, amount: subscriptionPrice(plan, item.planType, 'TZX', item.meta?.tierId) };

    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await walletOperation(`subscription:${user.id}`, requestKey(item.idempotencyKey), { planId: item.planId, cycle: item.planType, tierId: item.meta?.tierId ?? null, isRecurring: item.isRecurring }, [user.id], async (tx) => {
      const fresh = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      if (fresh.isLocked || cents(fresh.credit, true) < cents(item.amount)) throw new WalletError('Wallet locked or insufficient balance');
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
      const currentSub = await tx.subscription.findFirst({
        where: { userId: user.id, planId: item.planId },
      });
      let subscription: Subscription | undefined = undefined;
      // check if user has an active subscription and the plan is different
      if (!currentSub) {
        // create new subscription
        const startDate = new Date();
        const date = new Date();
        const endDate = nextBillingDate(date, item.planType);
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
        const endDate = nextBillingDate(date, item.planType);
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
          walletId: fresh.id,
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
      await addSubscriptionCronJob(result.subscription.id).catch((serviceError) => { logServiceError("v1/subscriptions/index", "purchaseAppSubscriptionWithWallet", serviceError); return logger.error('Subscription scheduling failed; recurring sweep will retry'); });
    }
    else{
      await removeSubscriptionCronJob({userId: user.id, subId: result.subscription.id}).catch((serviceError) => { logServiceError("v1/subscriptions/index", "purchaseAppSubscriptionWithWallet", serviceError); return logger.error('Subscription job cleanup failed'); })
    }

    // sync prisma wallet to redis
    await syncPrismaUserWalletToRedis(user.id, result.wallet);
    return { data: item, status: 200 };
  } catch (error: any) {
    logServiceError("v1/subscriptions/index", "purchaseAppSubscriptionWithWallet", error);

    if (error instanceof WalletError) return { data: error.message, status: error.status };
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
            gateway: TxnGatewayEnum.WALLET, status: TxnStatusEnum.COMPLETED,
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
    if (!currentSub.isRecurring || !currentSub.isPrimary || !['ACTIVE', 'PAYMENT_ERROR'].includes(currentSub.status) || currentSub.endDate > new Date()) {
      return { isError: false, status: 200, message: 'Subscription is not due for renewal' };
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

    if (cents(wallet.credit, true) < cents(subTxn.amount))
      return {
        message: "App subscription renewal error, insufficient balance!",
        status: 400,
        isError: true,
      };
    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await walletOperation(`renewal:${subId}`, currentSub.endDate.toISOString(), { subId }, [user.id], async (tx) => {
      const fresh = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      if (fresh.isLocked || cents(fresh.credit, true) < cents(subTxn.amount)) throw new WalletError('Wallet locked or insufficient balance');
      const due = await tx.subscription.findUniqueOrThrow({ where: { id: subId } });
      if (!due.isRecurring || !due.isPrimary || !['ACTIVE', 'PAYMENT_ERROR'].includes(due.status) || due.endDate.getTime() !== currentSub.endDate.getTime()) throw new WalletError('Subscription changed during renewal');
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
      const endDate = nextBillingDate(date, currentSub.billingCycle);
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
    await syncPrismaUserWalletToRedis(user.id, result.wallet);
    return {
      message: "App subscription renewed successfully",
      status: 200,
      isError: false,
    };
  } catch (error: any) {
    logServiceError("v1/subscriptions/index", "renewAppSubscriptionWithWallet", error);

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
  const providerId = verifiedPaymentId(item);
  if (!providerId || item.meta?.userId !== userId) return { data: 'Payment has not been verified', status: 400 };
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
    const result = await walletOperation('flutterwave', providerId, { userId, planId: item.planId }, [user.id], async (tx) => {
      const previous = await tx.transaction.findFirst({ where: { exTxnRef: item.meta?.txnRef, gateway: TxnGatewayEnum.FLUTTERWAVE } });
      if (previous) {
        const subscription = previous.subscriptionId ? await tx.subscription.findUnique({ where: { id: previous.subscriptionId } }) : null;
        if (!subscription) throw new WalletError('Payment already settled for another purchase');
        return { subscription };
      }
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
      const currentSub = await tx.subscription.findFirst({
        where: { userId: user.id, planId: item.planId },
      });
      let subscription: Subscription | undefined = undefined;
      // check if user has an active subscription and the plan is different
      if (!currentSub) {
        // create new subscription
        const startDate = new Date();
        const date = new Date();
        const endDate = nextBillingDate(date, item.planType);
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
        const endDate = nextBillingDate(date, item.planType);
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
    await removeSubscriptionCronJob({userId: user.id, subId: result.subscription.id}).catch((serviceError) => { logServiceError("v1/subscriptions/index", "purchaseAppSubscription", serviceError); return logger.error('Subscription job cleanup failed'); })
    return { data: item, status: 200 };
  } catch (error: any) {
    logServiceError("v1/subscriptions/index", "purchaseAppSubscription", error);

    if (error instanceof WalletError) return { data: error.message, status: error.status };
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

    const result = await prisma.$transaction(async tx => {
      await lockWallets(tx, [user.id]);
      const updated = await tx.subscription.update({ where: { id: arg.subId, userId: user.id }, data: { status: arg.status, isRecurring: false } });
      await tx.user.update({ where: { id: user.id }, data: { meta: {
        color, status: user.accountVerified ? 'ACTIVE' : 'INACTIVE', type: 'LEGACY',
      } } });
      return updated;
    });
    // remove subscription cron job if subscription is cancelled
    await removeSubscriptionCronJob({userId: user.id, subId: arg.subId}).catch((serviceError) => { logServiceError("v1/subscriptions/index", "cancelAppSubscription", serviceError); return logger.error('Subscription cleanup failed'); })
    return { data: result, status: 200 };
  } catch (error) {
    logServiceError("v1/subscriptions/index", "cancelAppSubscription", error);

    return {
      data: "Error: Failed to process request, please try again later",
      status: 500,
    };
  }
};
