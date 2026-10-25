import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma, SubscriptionCheckout, SubscriptionProviderPlan } from '@prisma/client';
import { bachsConfigured, bachsApiOrigin, bachsRequest, bachsCheckoutUrl } from '@/utils/bachs';
import { cachedCatalogRead } from "@/store";
import logger from '@/logger';
import { lockWallets, walletOperation, WalletError, cents, requestKey } from '@/services/walletLedger';
import { subscriptionPrice, subscriptionPricingCurrency, subscriptionPriceQuote, nextBillingDate } from '@/services/walletLedger/pricing';
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

import { addSubscriptionCronJob, removeSubscriptionCronJob } from "@/cron/utils";
import {logServiceError} from '@/logger/events';

export const getPlans = async () => {
  return cachedCatalogRead("subscription-plans", 60000, async () => {
    try {
      const data = await prisma.subscriptionPlan.findMany({
        include: { features: true, benefits:true },
      });

      const coinRate=(await prisma.chargeRate.findUniqueOrThrow({where:{id:'default'}})).price.toString();
      const priced=data.map(plan=>({...plan,coinRate}));
      const isFound = data.length > 0;

      return { data: isFound ? priced : "Not found", status: isFound ? 200 : 404 };
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
    quotedCoins?: number;
    pricingCurrency?: 'USD' | 'NGN';
  },
  userId: string
) => {
  try {
    if (item.currency !== 'COINS') throw new WalletError('Wallet subscriptions require coins');
    // get user
    const user = await prisma.user.findFirst({ where: { id: userId }, include: {country: true} });
    if (!user) return { data: "User not found", status: 400 };
    // get plan package
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: item.planId },
    });

    if (!plan) return { data: "Error: Invalid subscription plan", status: 400 };
    const rate=await prisma.chargeRate.findUniqueOrThrow({where:{id:'default'}});
    if (plan.accountType !== user.userType) throw new WalletError('This plan is not available for your account');
    const pricingCurrency = subscriptionPricingCurrency(user.country?.iso3, item.pricingCurrency);
    const local = pricingCurrency === 'NGN';
    item = { ...item, amount: subscriptionPrice(plan, item.planType, 'COINS', item.meta?.tierId, local ? rate.ngnPrice : rate.price, local ? 'NGN' : 'USD') };

    if(item.quotedCoins!==undefined && item.amount!==item.quotedCoins)throw new WalletError('The coin price changed. Refresh your quote before subscribing.',409);
    // debit user wallet coins and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await walletOperation(`subscription:${user.id}`, requestKey(item.idempotencyKey), { planId: item.planId, cycle: item.planType, tierId: item.meta?.tierId ?? null, isRecurring: item.isRecurring, ...(item.pricingCurrency ? {pricingCurrency} : {}) }, [user.id], async (tx) => {
      await assertNoPaidSubscription(user.id, tx);
      if(await tx.subscriptionCheckout.findFirst({where:{userId:user.id,status:{in:['PENDING','CREATING','OPEN','REVIEW']}}}))throw new WalletError('Finish your existing checkout before buying another subscription',409);
      const fresh = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      if (fresh.isLocked || cents(fresh.coins, true) < cents(item.amount)) throw new WalletError('Wallet locked or insufficient balance');
      // debit user wallet coins
      const userWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: true,
          coins: { decrement: item.amount },
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
            providerGateway: 'WALLET', renewalCoinAmount: item.amount, trialEndsAt: null,
            providerEnvironment:null,providerSubscriptionId:null,providerCustomerId:null,providerState:null,providerUpdatedAt:null,providerPlanId:null,renewalCancelledAt:null,
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
            providerGateway: 'WALLET', renewalCoinAmount: item.amount, trialEndsAt: null,
            providerEnvironment:null,providerSubscriptionId:null,providerCustomerId:null,providerState:null,providerUpdatedAt:null,providerPlanId:null,renewalCancelledAt:null,
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
          description: `Charged ${item.amount} ${item.currency} from your wallet coins for ${item.planType} ${plan.name} subscription plan.`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.COINS,
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
      // unlock user wallet coins
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
        user: {include: {country: true}},
        plan: true,
        transactions: {
          where: {
            subscriptionId: subId,
            category: TxnCategoryEnum.APP_SUBSCRIPTION,
            currency: TxnCurrencyEnum.COINS,
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
    if (currentSub.providerGateway && currentSub.providerGateway !== 'WALLET') throw new WalletError('This subscription is renewed by its payment provider');
    const subTxn = currentSub.transactions[0] ?? (currentSub.trialEndsAt && currentSub.renewalCoinAmount ? {amount:currentSub.renewalCoinAmount,currency:TxnCurrencyEnum.COINS,metadata:{}} : null);
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

    if (subTxn.currency !== 'COINS') return { isError: true, status: 400, message: 'Legacy wallet subscription has been retired' };
    if (cents(wallet.coins, true) < cents(subTxn.amount))
      return {
        message: "App subscription renewal error, insufficient balance!",
        status: 400,
        isError: true,
      };
    // debit user wallet coins and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();

    const result = await walletOperation(`renewal:${subId}`, currentSub.endDate.toISOString(), { subId }, [user.id], async (tx) => {
      const fresh = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      if (fresh.isLocked || cents(fresh.coins, true) < cents(subTxn.amount)) throw new WalletError('Wallet locked or insufficient balance');
      const due = await tx.subscription.findUniqueOrThrow({ where: { id: subId } });
      if (!due.isRecurring || !due.isPrimary || !['ACTIVE', 'PAYMENT_ERROR'].includes(due.status) || due.endDate.getTime() !== currentSub.endDate.getTime()) throw new WalletError('Subscription changed during renewal');
      // debit user wallet coins
      const userWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: true,
          coins: { decrement: subTxn.amount },
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
          trialEndsAt: null,
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
          source: TxnSourceEnum.COINS,
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
      // unlock user wallet coins
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
    // debit user wallet coins and credit user wallet amount and save transaction records
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
            providerGateway: 'FLUTTERWAVE', renewalCoinAmount:null, trialEndsAt:null,
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
            providerGateway: 'FLUTTERWAVE', renewalCoinAmount:null, trialEndsAt:null,
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
    if (arg.userId && sub.isRecurring && sub.providerGateway && sub.providerGateway !== 'WALLET') {
      await cancelProviderSubscription(sub);
    }
    // get color
    const color =
      user.accountVerifiedAt && user.userType === UserTypeEnum.GOVERNMENT
        ? "grey"
        : user.accountVerifiedAt && user.userType === UserTypeEnum.BUSINESS
        ? "gold"
        : "blue";

    const result = await prisma.$transaction(async tx => {
      await lockWallets(tx, [user.id]);
      const fresh=await tx.subscription.findUniqueOrThrow({where:{id:sub.id}});
      if(!arg.userId && arg.status==='EXPIRED' && (!fresh.isPrimary || fresh.endDate>new Date()))return fresh;
      const keepPaidAccess=arg.userId!==undefined && arg.status==='CANCELLED' && fresh.status==='ACTIVE' && fresh.endDate>new Date();
      const updated = await tx.subscription.update({ where: { id: arg.subId, userId: user.id }, data: { status: keepPaidAccess?'ACTIVE':arg.status, isRecurring: false, ...(arg.userId && sub.providerGateway && sub.providerGateway!=='WALLET'?{renewalCancelledAt:new Date()}:{}) } });
      if(!keepPaidAccess && fresh.isPrimary) await tx.user.update({ where: { id: user.id }, data: { meta: {
        color, status: user.accountVerifiedAt ? 'ACTIVE' : 'INACTIVE', type: 'LEGACY',
      } } });
      return updated;
    });
    if(!arg.userId && arg.status==='EXPIRED' && result.endDate>new Date())return {data:result,status:200};
    // remove subscription cron job if subscription is cancelled
    await removeSubscriptionCronJob({userId: user.id, subId: arg.subId}).catch((serviceError) => { logServiceError("v1/subscriptions/index", "cancelAppSubscription", serviceError); return logger.error('Subscription cleanup failed'); })
    return { data: result, status: 200 };
  } catch (error) {
    logServiceError("v1/subscriptions/index", "cancelAppSubscription", error);

    if(error instanceof WalletError)return {data:error.message,status:error.status};
    return {
      data: "Error: Failed to process request, please try again later",
      status: 500,
    };
  }
};

// Provider catalog entries are immutable price versions. Existing subscribers keep their terms.
type SubscriptionGateway = 'FLUTTERWAVE' | 'BACHS';
type CheckoutInput = {
  planId: string;
  tierId?: string;
  billingCycle: BillingCycleEnum;
  gateway: SubscriptionGateway | 'WALLET';
  recurring: boolean;
  offerId?: string;
  quotedCoins?: number;
  currency?: 'USD' | 'NGN';
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function subscriptionEnvironment(gateway: SubscriptionGateway) {
  if (gateway === 'BACHS')
    return `${bachsApiOrigin()}:${digest(process.env.BACHS_API_KEY).slice(0, 16)}`;
  const key = process.env.FLUTTERWAVE_SECK;
  if (!key) throw new WalletError('Flutterwave is not configured', 503);
  // Include the account key fingerprint: test/live and different merchants cannot share mappings.
  return `flutterwave:${key.includes('_TEST') ? 'test' : 'live'}:${digest(key).slice(0, 16)}`;
}
async function flutterwaveRequest(path: string, body?: object, method?: 'PUT') {
  if (!process.env.FLUTTERWAVE_SECK) throw new WalletError('Flutterwave is not configured', 503);
  const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECK}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new WalletError(
      'Flutterwave is temporarily unavailable. Please check this payment again.',
      503,
    );
  const result: any = await response.json();
  if (result.status !== 'success')
    throw new WalletError('Flutterwave could not confirm this request', 503);
  return result;
}
export function subscriptionCatalogSpec(
  plan: any,
  tierId: string,
  cycle: BillingCycleEnum,
  currency: 'USD' | 'NGN',
  gateway: SubscriptionGateway,
  trialDays = 0,
) {
  const amount = subscriptionPrice(plan, cycle, currency, tierId || undefined);
  const environment = subscriptionEnvironment(gateway);
  const id = digest([plan.id, tierId, cycle, currency, amount, gateway, environment, trialDays]);
  const name = `Kwonnet ${plan.name} ${tierId ? plan.tier.find((t: any) => t.id === tierId)?.name : ''} ${cycle} ${id.slice(0, 24)}`;
  const request =
    gateway === 'FLUTTERWAVE'
      ? { name, amount, currency, interval: cycle.toLowerCase() }
      : {
          name,
          price: { price_type: 'fixed', amount: amount.toFixed(2), currency },
          billing_cycle: { interval: cycle === 'MONTHLY' ? 'month' : 'year', frequency: 1 },
          ...(trialDays ? { trial_period: { interval: 'day', frequency: trialDays } } : {}),
          metadata: { kwonnet_binding: id },
        };
  return {
    id,
    planId: plan.id,
    tierId,
    billingCycle: cycle,
    currency,
    amount,
    gateway,
    environment,
    trialDays,
    request,
  };
}
async function syncProviderPlan(spec: ReturnType<typeof subscriptionCatalogSpec>) {
  let row = await prisma.subscriptionProviderPlan.upsert({
    where: { id: spec.id },
    create: spec,
    update: {},
  });
  if (row.remoteId) return row;
  const lease = await prisma.subscriptionProviderPlan.updateMany({
    where: { id: row.id, OR: [{ processingUntil: null }, { processingUntil: { lt: new Date() } }] },
    data: { processingUntil: new Date(Date.now() + 120000) },
  });
  if (!lease.count) throw new WalletError('Plan synchronization is in progress', 409);
  try {
    let remote: any;
    // A timeout may have happened AFTER the provider created a plan. Reconcile before retrying.
    if (row.state !== 'PENDING') {
      if (spec.gateway === 'FLUTTERWAVE') {
        for (let page = 1; page <= 100; page++) {
          const result = await flutterwaveRequest(`/payment-plans?page=${page}`);
          const list = Array.isArray(result.data) ? result.data : [];
          remote = list.find(
            (p: any) =>
              p.name === (spec.request as any).name &&
              p.currency === spec.currency &&
              Number(p.amount) === spec.amount &&
              p.interval?.toLowerCase() === spec.billingCycle.toLowerCase(),
          );
          if (remote || !list.length || page >= Number(result.meta?.page_info?.total_pages ?? 1))
            break;
          if (page === 100)
            throw new WalletError('Provider plan reconciliation requires operator review', 503);
        }
        // Unknown non-idempotent writes must never create a second plan automatically.
        if (!remote)
          throw new WalletError(
            'An earlier plan creation is unconfirmed; reconcile the provider catalog before retrying',
            503,
          );
      } else {
        let cursor = '';
        for (let page = 0; page < 100; page++) {
          const result = await bachsRequest(
            `/products?limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
          );
          remote = result.items?.find(
            (p: any) =>
              p.metadata?.kwonnet_binding === spec.id &&
              p.price?.currency === spec.currency &&
              Number(p.price.amount) === spec.amount,
          );
          if (remote || !result.pagination?.has_more) break;
          cursor = result.pagination.next_cursor;
          if (!cursor || page === 99)
            throw new WalletError('Bachs catalog reconciliation needs operator review', 503);
        }
        if (!remote && Date.now() - row.createdAt.getTime() > 23 * 3600000)
          throw new WalletError(
            'Bachs plan creation needs reconciliation after the idempotency window',
            503,
          );
      }
    }
    if (!remote) {
      await prisma.subscriptionProviderPlan.update({
        where: { id: row.id },
        data: { state: 'CREATING' },
      });
      const result =
        spec.gateway === 'FLUTTERWAVE'
          ? await flutterwaveRequest('/payment-plans', spec.request)
          : await bachsRequest('/products', spec.request, spec.id);
      remote = spec.gateway === 'FLUTTERWAVE' ? result.data : result;
    }
    if (!remote?.id || (spec.gateway === 'FLUTTERWAVE' && !/^[1-9]\d*$/.test(String(remote.id))))
      throw new WalletError('Provider returned no plan identifier', 503);
    return await prisma.subscriptionProviderPlan.update({
      where: { id: row.id },
      data: { remoteId: String(remote.id), state: 'READY', lastError: null, syncedAt: new Date() },
    });
  } catch (error) {
    logServiceError('v1/subscriptions/index', 'syncProviderPlan', error);
    await prisma.subscriptionProviderPlan.update({
      where: { id: row.id },
      data: { state: 'REVIEW', lastError: 'Provider plan synchronization could not be confirmed' },
    });
    throw error;
  } finally {
    await prisma.subscriptionProviderPlan.update({
      where: { id: row.id },
      data: { processingUntil: null },
    });
  }
}
export async function syncSubscriptionCatalog() {
  const plans = await prisma.subscriptionPlan.findMany();
  const offers = await prisma.subscriptionTrialOffer.findMany({
    where: { enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  let synced = 0,
    failed = 0;
  for (const plan of plans)
    for (const tierId of plan.tier.length ? plan.tier.map((t) => t.id) : [''])
      for (const cycle of [BillingCycleEnum.MONTHLY, BillingCycleEnum.YEARLY]) {
        for (const gateway of ['FLUTTERWAVE', 'BACHS'] as const) {
          if (gateway === 'FLUTTERWAVE' ? !process.env.FLUTTERWAVE_SECK : !bachsConfigured())
            continue;
          for (const currency of gateway === 'BACHS'
            ? (['USD'] as const)
            : (['USD', 'NGN'] as const)) {
            const days =
              gateway === 'BACHS'
                ? [
                    0,
                    ...new Set(
                      offers
                        .filter((o) => o.planId === plan.id && o.tierId === tierId)
                        .map((o) => o.days),
                    ),
                  ]
                : [0];
            for (const trialDays of days)
              try {
                await syncProviderPlan(
                  subscriptionCatalogSpec(plan, tierId, cycle, currency, gateway, trialDays),
                );
                synced++;
              } catch (error) {
                failed++;
                logServiceError('v1/subscriptions/index', 'syncSubscriptionCatalog', error);
              }
          }
        }
      }
  if (failed)
    throw new WalletError(
      `${failed} provider catalog entries need retry or review; ${synced} are ready`,
      503,
    );
  return { synced };
}
export async function enqueueSubscriptionSync() {
  const { subscriptionCatalogQueue } = await import('@/cron/jobs/queue');
  const job = await subscriptionCatalogQueue.add(
    'sync_subscription_catalog',
    {},
    {
      jobId: `subscription-catalog-${Math.floor(Date.now() / 60000)}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );
  return { jobId: job.id };
}
async function assertNoPaidSubscription(userId: string, db: any = prisma) {
  const active = await db.subscription.findFirst({
    where: {
      userId,
      isPrimary: true,
      status: { in: ['ACTIVE', 'PAYMENT_ERROR'] },
      OR: [
        { endDate: { gt: new Date() } },
        { providerGateway: { in: ['FLUTTERWAVE', 'BACHS'] }, isRecurring: true },
      ],
    },
  });
  if (
    active &&
    (active.endDate > new Date() ||
      (active.isRecurring && ['FLUTTERWAVE', 'BACHS'].includes(active.providerGateway)))
  )
    throw new WalletError(
      'Your current subscription is still active. Cancel renewal and wait until it ends before starting another plan.',
      409,
    );
}
async function subscriptionUser(userId: string, planId: string) {
  const [user, plan, rate] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { country: true } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
    prisma.chargeRate.findUniqueOrThrow({ where: { id: 'default' } }),
  ]);
  if (!user || !plan || plan.accountType !== user.userType)
    throw new WalletError('Plan unavailable for this account', 404);
  return { user, plan, rate };
}
async function eligibleTrial(user: any, input: CheckoutInput, db: any = prisma, replayId?: string) {
  if (!input.offerId) return null;
  const offer = await db.subscriptionTrialOffer.findUnique({ where: { id: input.offerId } });
  if (
    !offer?.enabled ||
    (offer.expiresAt && offer.expiresAt <= new Date()) ||
    offer.planId !== input.planId ||
    offer.tierId !== (input.tierId ?? '') ||
    !(offer.userId === user.id || (offer.countryIso3 && offer.countryIso3 === user.country?.iso3))
  )
    throw new WalletError('Trial offer is not available', 403);
  const used = await db.subscriptionTrialUse.findUnique({
    where: { offerId_userId: { offerId: offer.id, userId: user.id } },
  });
  if (used?.claimedAt && used.checkoutId !== replayId)
    throw new WalletError('This trial has already been used', 409);
  return offer;
}
export async function getSubscriptionCatalog(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { country: true },
  });
  const plans = await prisma.subscriptionPlan.findMany({
    where: { accountType: user.userType },
    include: { features: true, benefits: true },
  });
  const rate = await prisma.chargeRate.findUniqueOrThrow({ where: { id: 'default' } });
  const local = user.country?.iso3 === 'NGA';
  const offers = await prisma.subscriptionTrialOffer.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { OR: [{ userId }, { countryIso3: user.country?.iso3 ?? '__' }] },
      ],
      uses: { none: { userId, claimedAt: { not: null } } },
    },
  });
  const pending = await prisma.subscriptionCheckout.findFirst({
    where: { userId, status: { in: ['PENDING', 'CREATING', 'OPEN', 'REVIEW'] } },
    select: { id: true, checkoutUrl: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  const current = await prisma.subscription.findMany({
    where: { userId, isPrimary: true },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return {
    currencies: local ? ['NGN', 'USD'] : ['USD'],
    defaultCurrency: local ? 'NGN' : 'USD',
    plans: plans.map((plan) => ({
      ...plan,
      options: (plan.tier.length ? plan.tier.map((t) => t.id) : ['']).flatMap((tierId) =>
        [BillingCycleEnum.MONTHLY, BillingCycleEnum.YEARLY].map((billingCycle) => ({
          tierId,
          billingCycle,
          quotes: (local ? ['NGN', 'USD'] as const : ['USD'] as const).map(currency =>
            subscriptionPriceQuote(plan, billingCycle, currency, tierId || undefined, currency === 'NGN' ? rate.ngnPrice : rate.price)),
          amount: subscriptionPrice(plan, billingCycle, local ? 'NGN' : 'USD', tierId || undefined),
          currency: local ? 'NGN' : 'USD',
          usdAmount: subscriptionPrice(plan, billingCycle, 'USD', tierId || undefined),
          coins: subscriptionPrice(
            plan,
            billingCycle,
            'COINS',
            tierId || undefined,
            local ? rate.ngnPrice : rate.price,
            local ? 'NGN' : 'USD',
          ),
        })),
      ),
    })),
    offers,
    pending,
    current: current[0] ?? null,
    providers: {
      FLUTTERWAVE: !!process.env.FLUTTERWAVE_SECK && !!process.env.FLUTTERWAVE_SECRET_HASH,
      BACHS: bachsConfigured(),
      WALLET: true,
    },
  };
}
export async function createSubscriptionCheckout(
  userId: string,
  input: CheckoutInput,
  key: string,
): Promise<{ status: string; id?: string; url?: string; subscriptionId?: string | null }> {
  requestKey(key);
  const { user, plan } = await subscriptionUser(userId, input.planId);
  const currency = subscriptionPricingCurrency(user.country?.iso3, input.currency ?? (input.gateway === 'BACHS' ? 'USD' : undefined));
  if (input.gateway === 'BACHS' && currency !== 'USD')
    throw new WalletError('Bachs subscriptions use USD pricing. Select USD to continue.', 400);
  const offer = await eligibleTrial(
    user,
    input,
    prisma,
    input.gateway === 'BACHS' && input.recurring
      ? digest([userId, subscriptionEnvironment('BACHS'), key])
      : digest(['trial', userId, input.offerId, key, ...(input.currency ? [input.currency] : [])]),
  );
  if (offer && (!input.recurring || input.gateway === 'WALLET'))
    return startWalletTrial(user, input, key, offer);
  if (input.gateway === 'WALLET') {
    const result = await purchaseAppSubscriptionWithWallet(
      {
        planId: plan.id,
        amount: 0,
        currency: 'COINS',
        planType: input.billingCycle,
        isRecurring: input.recurring,
        meta: { tierId: input.tierId },
        idempotencyKey: key,
        quotedCoins: input.quotedCoins,
        pricingCurrency: input.currency,
      },
      userId,
    );
    if (result.status !== 200) throw new WalletError(String(result.data), result.status);
    return { status: 'COMPLETED' };
  }
  if (offer && input.gateway !== 'BACHS')
    throw new WalletError(
      'Use Bachs or wallet coins for trial renewal. Flutterwave requires an initial paid charge.',
      400,
    );
  if (input.gateway === 'BACHS' && !input.recurring)
    throw new WalletError(
      'Bachs subscriptions require renewal opt-in; choose wallet coins for a single period',
      400,
    );
  if (input.gateway === 'BACHS' ? !bachsConfigured() : !process.env.FLUTTERWAVE_SECRET_HASH)
    throw new WalletError('This payment provider is not configured', 503);
  const spec = subscriptionCatalogSpec(
    plan,
    input.tierId ?? '',
    input.billingCycle,
    currency,
    input.gateway,
    offer?.days ?? 0,
  );
  const binding = await prisma.subscriptionProviderPlan.findUnique({ where: { id: spec.id } });
  if (!binding?.remoteId || binding.state !== 'READY') {
    await enqueueSubscriptionSync();
    throw new WalletError('This plan is being synchronized. Please try again shortly.', 503);
  }
  const id = digest([userId, binding.environment, key]);
  const identity = digest([
    input.planId,
    input.tierId ?? '',
    input.billingCycle,
    input.gateway,
    input.recurring,
    input.offerId ?? null,
    ...(input.currency ? [currency] : []),
  ]);
  const returnUrl = new URL(
    '/subscribe',
    process.env.SUBSCRIPTION_APP_URL || 'https://kwonnet.com',
  );
  returnUrl.searchParams.set('checkout', id);
  const providerPayload =
    input.gateway === 'FLUTTERWAVE'
      ? {
          tx_ref: id,
          amount: spec.amount,
          currency,
          redirect_url: returnUrl.toString(),
          link_expiration: new Date(Date.now() + 3600000).toISOString(),
          customer: { email: user.email },
          ...(input.recurring
            ? { payment_plan: Number(binding.remoteId), payment_options: 'card' }
            : {}),
          meta: { subscription_checkout: id },
        }
      : {
          product_cart: [{ product_id: binding.remoteId, quantity: 1 }],
          customer: { email: user.email },
          billing_currency: currency,
          metadata: { subscription_checkout: id },
          success_url: returnUrl.toString(),
          cancel_url: returnUrl.toString(),
        };
  let checkout = await prisma.$transaction(async (tx) => {
    await lockWallets(tx, [userId]);
    const existing = await tx.subscriptionCheckout.findUnique({ where: { id } });
    if (existing) {
      if ((existing.request as any).identity !== identity)
        throw new WalletError('Reuse the checkout key only for the same selection', 409);
      return existing;
    }
    await assertNoPaidSubscription(userId, tx);
    const pending = await tx.subscriptionCheckout.findFirst({
      where: { userId, status: { in: ['PENDING', 'CREATING', 'OPEN', 'REVIEW'] } },
    });
    if (pending)
      throw new WalletError(
        'You already have an unfinished checkout. Resume or check it before starting another.',
        409,
      );
    if (offer)
      await tx.subscriptionTrialUse.create({
        data: { id: digest([offer.id, userId]), offerId: offer.id, userId, checkoutId: id },
      });
    return tx.subscriptionCheckout.create({
      data: {
        id,
        userId,
        planId: plan.id,
        tierId: input.tierId ?? '',
        billingCycle: input.billingCycle,
        currency,
        amount: spec.amount,
        gateway: input.gateway as SubscriptionGateway,
        environment: binding.environment,
        providerPlanId: binding.id,
        recurring: input.recurring,
        offerId: offer?.id,
        trialDays: offer?.days ?? 0,
        request: {
          identity,
          email: user.email,
          payload: JSON.parse(JSON.stringify(providerPayload)),
        },
      },
    });
  });
  return finishProviderCheckoutCreation(checkout);
}
async function finishProviderCheckoutCreation(checkout: SubscriptionCheckout) {
  const id = checkout.id;
  if (checkout.status === 'COMPLETED') return { id, status: checkout.status };
  if (checkout.status === 'EXPIRED')
    throw new WalletError('This checkout has expired. Choose your plan again.', 409);
  if (checkout.checkoutUrl)
    return { id: checkout.id, url: checkout.checkoutUrl, status: checkout.status };
  // Only the winner may issue a non-idempotent Flutterwave checkout request.
  const claimed = await prisma.subscriptionCheckout.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CREATING' },
  });
  if (!claimed.count)
    throw new WalletError(
      'Checkout creation is awaiting provider confirmation; use Check payment',
      409,
    );
  try {
    let response: any;
    if (checkout.gateway === 'FLUTTERWAVE') {
      response = await flutterwaveRequest('/payments', (checkout.request as any).payload);
      response = { checkout_url: response.data?.link };
    } else
      response = await bachsRequest('/checkout-sessions', (checkout.request as any).payload, id);
    checkout = await saveProviderCheckout(checkout, response);
    return { id, url: checkout.checkoutUrl!, status: checkout.status };
  } catch (error) {
    logServiceError('v1/subscriptions/index', 'createSubscriptionCheckout', error);
    await prisma.subscriptionCheckout.update({ where: { id }, data: { status: 'REVIEW' } });
    throw error;
  }
}
async function saveProviderCheckout(checkout: SubscriptionCheckout, response: any) {
  const url = bachsCheckoutUrl(response.checkout_url);
  if (checkout.gateway === 'BACHS' && !response.checkout_id)
    throw new WalletError('Provider checkout identifier is unavailable', 503);
  await prisma.subscriptionCheckout.update({
    where: { id: checkout.id },
    data: {
      checkoutId: response.checkout_id ? String(response.checkout_id) : null,
      checkoutUrl: url,
    },
  });
  // A subscription webhook may have completed settlement before link creation returned.
  await prisma.subscriptionCheckout.updateMany({
    where: { id: checkout.id, status: { in: ['PENDING', 'CREATING', 'REVIEW'] } },
    data: { status: 'OPEN' },
  });
  return prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
}
async function startWalletTrial(user: any, input: CheckoutInput, key: string, offer: any) {
  // Trials without renewal consent require no saved payment method.
  const { plan, rate } = await subscriptionUser(user.id, input.planId);
  const pricingCurrency = subscriptionPricingCurrency(user.country?.iso3, input.currency);
  const local = pricingCurrency === 'NGN';
  const coins = subscriptionPrice(
    plan,
    input.billingCycle,
    'COINS',
    input.tierId,
    local ? rate.ngnPrice : rate.price,
    local ? 'NGN' : 'USD',
  );
  if (input.recurring && input.quotedCoins !== undefined && coins !== input.quotedCoins)
    throw new WalletError(
      'The coin price changed. Refresh your quote before starting the trial.',
      409,
    );
  return prisma.$transaction(async (tx) => {
    await lockWallets(tx, [user.id]);
    const use = await tx.subscriptionTrialUse.findUnique({
      where: { offerId_userId: { offerId: offer.id, userId: user.id } },
    });
    if (use?.claimedAt) {
      if (use.checkoutId !== digest(['trial', user.id, input.offerId, key, ...(input.currency ? [input.currency] : [])]))
        throw new WalletError('This trial has already been used', 409);
      return { status: 'COMPLETED', subscriptionId: use.subscriptionId };
    }
    await assertNoPaidSubscription(user.id, tx);
    if (
      await tx.subscriptionCheckout.findFirst({
        where: { userId: user.id, status: { in: ['PENDING', 'CREATING', 'OPEN', 'REVIEW'] } },
      })
    )
      throw new WalletError('Finish your existing checkout before starting a trial', 409);
    if (use) throw new WalletError('This trial has an unfinished provider checkout', 409);
    await eligibleTrial(user, input, tx);
    const startDate = new Date(),
      endDate = new Date(startDate.getTime() + offer.days * 86400000);
    await tx.subscription.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
    const sub = await tx.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        billingCycle: input.billingCycle,
        isPrimary: true,
        isRecurring: input.recurring,
        startDate,
        endDate,
        trialEndsAt: endDate,
        providerGateway: 'WALLET',
        renewalCoinAmount: coins,
        meta: {
          tierId: input.tierId ?? '',
          trialOfferId: offer.id,
          renewalConsentAt: input.recurring ? startDate.toISOString() : null,
          renewalCoins: coins,
          pricingCurrency,
        },
      },
    });
    await tx.subscriptionTrialUse.create({
      data: {
        id: digest([offer.id, user.id]),
        offerId: offer.id,
        userId: user.id,
        checkoutId: digest(['trial', user.id, input.offerId, key, ...(input.currency ? [input.currency] : [])]),
        claimedAt: startDate,
        subscriptionId: sub.id,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        meta: {
          status: 'ACTIVE',
          type: 'PRO',
          color:
            user.userType === 'BUSINESS'
              ? 'gold'
              : user.userType === 'GOVERNMENT'
                ? 'grey'
                : 'blue',
        },
      },
    });
    return { status: 'COMPLETED', subscriptionId: sub.id };
  });
}
export async function createSubscriptionTrialOffer(
  adminId: string,
  input: {
    planId: string;
    tierId?: string;
    userId?: string;
    countryIso3?: string;
    days: number;
    expiresAt?: string;
  },
) {
  if (!!input.userId === !!input.countryIso3 || ![7, 14].includes(input.days))
    throw new WalletError('Choose one user or country and a 7- or 14-day trial');
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new WalletError('Plan not found', 404);
  subscriptionPrice(plan, 'MONTHLY', 'USD', input.tierId);
  if (input.userId && !(await prisma.user.findUnique({ where: { id: input.userId } })))
    throw new WalletError('User not found', 404);
  if (
    input.countryIso3 &&
    !(await prisma.country.findUnique({ where: { iso3: input.countryIso3 } }))
  )
    throw new WalletError('Country not found', 404);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
    throw new WalletError('Offer expiry must be in the future');
  const offer = await prisma.subscriptionTrialOffer.create({
    data: {
      planId: plan.id,
      tierId: input.tierId ?? '',
      userId: input.userId,
      countryIso3: input.countryIso3,
      days: input.days,
      expiresAt,
      createdBy: adminId,
    },
  });
  try {
    await enqueueSubscriptionSync();
  } catch (error) {
    logServiceError('v1/subscriptions/index', 'queueTrialCatalogSync', error);
  }
  return offer;
}
export async function subscriptionAdministration() {
  const [plans, offers, providerPlans] = await Promise.all([
    prisma.subscriptionPlan.findMany(),
    prisma.subscriptionTrialOffer.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.subscriptionProviderPlan.findMany({
      select: {
        id: true,
        planId: true,
        tierId: true,
        gateway: true,
        environment: true,
        billingCycle: true,
        currency: true,
        amount: true,
        trialDays: true,
        remoteId: true,
        state: true,
        lastError: true,
        syncedAt: true,
      },
    }),
  ]);
  return { plans, offers, providerPlans };
}
export async function disableSubscriptionTrialOffer(id: string) {
  return prisma.subscriptionTrialOffer.update({ where: { id }, data: { enabled: false } });
}

export function verifyFlutterwaveSubscriptionSignature(signature: unknown) {
  const secret = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!secret || typeof signature !== 'string') return false;
  const left = Buffer.from(secret),
    right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
function providerDate(value: unknown) {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime()))
    throw new WalletError('Provider billing dates are unavailable', 503);
  return date;
}
export function assertSubscriptionPayment(
  checkout: Pick<SubscriptionCheckout, 'amount' | 'currency' | 'request' | 'id'>,
  payment: any,
) {
  if (
    payment.status !== 'successful' ||
    payment.currency !== checkout.currency ||
    !new Prisma.Decimal(payment.amount).equals(checkout.amount) ||
    payment.customer?.email?.toLowerCase() !== (checkout.request as any).email?.toLowerCase()
  )
    throw new WalletError('Subscription payment does not match the saved checkout', 409);
}
async function fulfillSubscription(
  checkout: SubscriptionCheckout,
  binding: SubscriptionProviderPlan,
  receipt: {
    id: string;
    subscriptionId?: string;
    customerId?: string;
    start: Date;
    end: Date;
    state: string;
    trial: boolean;
    recurring: boolean;
  },
) {
  if (receipt.end <= receipt.start) throw new WalletError('Invalid provider billing period', 409);
  return prisma.$transaction(async (tx) => {
    await lockWallets(tx, [checkout.userId]);
    const eventId = digest([checkout.gateway, checkout.environment, receipt.id]);
    const prior = await tx.subscriptionProviderEvent.findUnique({ where: { id: eventId } });
    if (prior) {
      const current = await tx.subscription.findUniqueOrThrow({
        where: { id: prior.subscriptionId },
      });
      if (
        current.providerSubscriptionId &&
        receipt.subscriptionId !== current.providerSubscriptionId
      )
        throw new WalletError('Provider subscription changed unexpectedly', 409);
      await tx.subscription.update({
        where: { id: current.id },
        data: {
          providerState: receipt.state,
          providerUpdatedAt: new Date(),
          isRecurring: receipt.recurring && !current.renewalCancelledAt,
        },
      });
      return;
    }
    const fresh = await tx.subscriptionCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
    let sub = fresh.subscriptionId
      ? await tx.subscription.findUniqueOrThrow({ where: { id: fresh.subscriptionId } })
      : null;
    if (!sub) await assertNoPaidSubscription(checkout.userId, tx);
    const now = new Date();
    // Never shorten a period on a replay or delayed event. Receipt uniqueness protects ledger effects.
    const advances = !sub || receipt.end > sub.endDate;
    const fields = {
      providerGateway: checkout.gateway,
      providerEnvironment: checkout.environment,
      providerPlanId: binding.id,
      providerSubscriptionId: receipt.subscriptionId,
      providerCustomerId: receipt.customerId,
      providerState: receipt.state,
      providerUpdatedAt: now,
    };
    if (!sub) {
      await tx.subscription.updateMany({
        where: { userId: checkout.userId },
        data: { isPrimary: false },
      });
      sub = await tx.subscription.create({
        data: {
          ...fields,
          userId: checkout.userId,
          planId: checkout.planId,
          billingCycle: checkout.billingCycle,
          isPrimary: true,
          isRecurring: receipt.recurring,
          status: 'ACTIVE',
          startDate: receipt.start,
          endDate: receipt.end,
          trialEndsAt: receipt.trial ? receipt.end : null,
          meta: {
            tierId: checkout.tierId,
            checkoutId: checkout.id,
            renewalConsentAt: checkout.recurring ? checkout.createdAt.toISOString() : null,
          },
        },
      });
    } else if (advances) {
      // A cancelled/superseded subscription must not silently displace a newly paid plan.
      if (sub.providerSubscriptionId && receipt.subscriptionId !== sub.providerSubscriptionId)
        throw new WalletError('Provider subscription changed unexpectedly', 409);
      if (!sub.isPrimary)
        throw new WalletError('Payment belongs to a superseded subscription and needs review', 409);
      sub = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          ...fields,
          isRecurring: receipt.recurring && !sub.renewalCancelledAt,
          status: 'ACTIVE',
          startDate: receipt.start,
          endDate: receipt.end,
          trialEndsAt: receipt.trial ? receipt.end : null,
        },
      });
    } else await tx.subscription.update({ where: { id: sub.id }, data: fields });
    await tx.subscriptionProviderEvent.create({
      data: {
        id: eventId,
        gateway: checkout.gateway,
        environment: checkout.environment,
        paymentId: receipt.id,
        subscriptionId: sub.id,
        amount: receipt.trial ? 0 : checkout.amount,
        currency: checkout.currency,
      },
    });
    if (!receipt.trial)
      await tx.transaction.create({
        data: {
          userId: checkout.userId,
          recipientId: checkout.userId,
          subscriptionId: sub.id,
          subPlanId: checkout.planId,
          amount: checkout.amount,
          currency: checkout.currency as TxnCurrencyEnum,
          gateway: checkout.gateway,
          source: 'FIAT',
          category: 'APP_SUBSCRIPTION',
          type: 'DEBIT',
          status: 'COMPLETED',
          txnRef: eventId,
          exTxnRef: receipt.id,
          description: `${checkout.billingCycle} subscription`,
          metadata: {
            providerSubscriptionId: receipt.subscriptionId ?? null,
            checkoutId: checkout.id,
          },
        },
      });
    if (checkout.offerId)
      await tx.subscriptionTrialUse.update({
        where: { offerId_userId: { offerId: checkout.offerId, userId: checkout.userId } },
        data: { claimedAt: now, subscriptionId: sub.id },
      });
    await tx.subscriptionCheckout.update({
      where: { id: checkout.id },
      data: { subscriptionId: sub.id, status: 'COMPLETED' },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: checkout.userId } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        meta: {
          status: 'ACTIVE',
          type: 'PRO',
          color:
            user.userType === 'BUSINESS'
              ? 'gold'
              : user.userType === 'GOVERNMENT'
                ? 'grey'
                : 'blue',
        },
      },
    });
  });
}
export async function reconcileFlutterwaveSubscriptionPayment(
  id: string,
  expectedCheckoutId?: string,
) {
  if (!/^\d+$/.test(id)) throw new WalletError('Invalid payment identifier');
  const environment = subscriptionEnvironment('FLUTTERWAVE');
  const prior = await prisma.subscriptionProviderEvent.findUnique({
    where: { id: digest(['FLUTTERWAVE', environment, id]) },
  });
  if (prior) {
    if (
      expectedCheckoutId &&
      !(await prisma.subscriptionCheckout.findFirst({
        where: { id: expectedCheckoutId, subscriptionId: prior.subscriptionId },
      }))
    )
      throw new WalletError('Payment belongs to another checkout', 403);
    return true;
  }
  const payment = (await flutterwaveRequest(`/transactions/${encodeURIComponent(id)}/verify`)).data;
  let checkout = await prisma.subscriptionCheckout.findFirst({
    where: { gateway: 'FLUTTERWAVE', environment, id: payment.tx_ref },
  });
  let remote: any;
  if (!checkout) {
    const result = await flutterwaveRequest(
      `/subscriptions?transaction_id=${encodeURIComponent(id)}`,
    );
    const candidates = Array.isArray(result.data) ? result.data : [];
    for (const item of candidates) {
      const sub = await prisma.subscription.findFirst({
        where: {
          providerGateway: 'FLUTTERWAVE',
          providerEnvironment: environment,
          providerSubscriptionId: String(item.id),
        },
      });
      if (sub) {
        checkout = await prisma.subscriptionCheckout.findFirst({
          where: { subscriptionId: sub.id, gateway: 'FLUTTERWAVE', environment },
        });
        remote = item;
        break;
      }
    }
  }
  if (!checkout) return false; // Another product on the merchant account.
  if (expectedCheckoutId && expectedCheckoutId !== checkout.id)
    throw new WalletError('Payment belongs to another checkout', 403);
  if (String(payment.id) !== id)
    throw new WalletError('Provider returned a different payment', 409);
  assertSubscriptionPayment(checkout, payment);
  const binding = await prisma.subscriptionProviderPlan.findUniqueOrThrow({
    where: { id: checkout.providerPlanId },
  });
  if (checkout.recurring && !remote) {
    const result = await flutterwaveRequest(
      `/subscriptions?transaction_id=${encodeURIComponent(id)}&plan=${encodeURIComponent(binding.remoteId!)}&email=${encodeURIComponent((checkout.request as any).email)}`,
    );
    remote = (Array.isArray(result.data) ? result.data : []).find(
      (s: any) =>
        String(s.plan?.id ?? s.plan) === binding.remoteId &&
        s.customer?.email?.toLowerCase() === (checkout.request as any).email.toLowerCase(),
    );
    if (!remote?.id)
      throw new WalletError('Payment received; waiting for the provider subscription record', 503);
  }
  const start = providerDate(payment.created_at),
    end = nextBillingDate(start, checkout.billingCycle);
  await fulfillSubscription(checkout, binding, {
    id,
    subscriptionId: remote ? String(remote.id) : undefined,
    customerId: payment.customer?.id ? String(payment.customer.id) : undefined,
    start,
    end,
    state: 'active',
    trial: false,
    recurring: checkout.recurring && remote?.status === 'active',
  });
  return true;
}
async function reconcileBachsSubscription(providerId: string, expectedCheckoutId?: string) {
  const remote = await bachsRequest(`/subscriptions/${encodeURIComponent(providerId)}`);
  if (String(remote.id) !== providerId)
    throw new WalletError('Provider returned a different subscription', 409);
  const environment = subscriptionEnvironment('BACHS');
  const reference = remote.metadata?.subscription_checkout;
  const checkout = await prisma.subscriptionCheckout.findFirst({
    where: {
      gateway: 'BACHS',
      environment,
      ...(typeof reference === 'string'
        ? { id: reference }
        : {
            subscriptionId:
              (
                await prisma.subscription.findFirst({
                  where: {
                    providerGateway: 'BACHS',
                    providerEnvironment: environment,
                    providerSubscriptionId: providerId,
                  },
                })
              )?.id ?? '__',
          }),
    },
  });
  if (!checkout) return false;
  if (expectedCheckoutId && checkout.id !== expectedCheckoutId)
    throw new WalletError('Subscription belongs to another checkout', 403);
  const binding = await prisma.subscriptionProviderPlan.findUniqueOrThrow({
    where: { id: checkout.providerPlanId },
  });
  const customer =
    typeof remote.customer === 'string'
      ? await bachsRequest(`/customers/${encodeURIComponent(remote.customer)}`)
      : remote.customer;
  const customerId = String(customer?.id ?? customer?.customer_id ?? '');
  if (!customerId) throw new WalletError('Provider customer identifier is unavailable', 503);
  const current = checkout.subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: checkout.subscriptionId } })
    : null;
  const customerMatches = current?.providerCustomerId
    ? current.providerCustomerId === customerId
    : customer?.email?.toLowerCase() === (checkout.request as any).email.toLowerCase();
  const productId =
    remote.items?.[0]?.product?.id ??
    remote.items?.[0]?.product_id ??
    remote.product?.id ??
    remote.product_id;
  if (
    !customerMatches ||
    productId !== binding.remoteId ||
    remote.currency !== checkout.currency ||
    !new Prisma.Decimal(remote.amount).equals(checkout.amount)
  )
    throw new WalletError('Bachs subscription does not match the saved checkout', 409);
  if (
    remote.billing_cycle?.interval !== (checkout.billingCycle === 'MONTHLY' ? 'month' : 'year') ||
    remote.billing_cycle?.frequency !== 1
  )
    throw new WalletError('Bachs billing cycle does not match the checkout', 409);
  if (['active', 'trialing'].includes(remote.status)) {
    if (remote.status === 'trialing' && !checkout.offerId)
      throw new WalletError('Unexpected provider trial', 409);
    const start = providerDate(remote.current_period_start),
      end = providerDate(remote.current_period_end);
    const maximumDays =
      remote.status === 'trialing'
        ? checkout.trialDays
        : checkout.billingCycle === 'MONTHLY'
          ? 32
          : 366;
    if (
      end.getTime() - start.getTime() > maximumDays * 86400000 ||
      (remote.status === 'trialing' && providerDate(remote.trial_end).getTime() !== end.getTime())
    )
      throw new WalletError('Provider billing period does not match the checkout', 409);
    await fulfillSubscription(checkout, binding, {
      id: `${providerId}:${start.toISOString()}:${remote.status}`,
      subscriptionId: providerId,
      customerId,
      start,
      end,
      state: remote.status,
      trial: remote.status === 'trialing',
      recurring: !remote.cancel_at_period_end,
    });
  } else if (checkout.subscriptionId) {
    // Do not grant access for past_due/unpaid. Previously paid access remains bounded by endDate.
    await prisma.subscription.update({
      where: { id: checkout.subscriptionId },
      data: {
        providerState: remote.status,
        providerUpdatedAt: new Date(),
        ...(['unpaid', 'paused'].includes(remote.status) ? { status: 'PAUSED' as const } : {}),
        ...(['canceled', 'cancelled', 'unpaid', 'paused'].includes(remote.status)
          ? { isRecurring: false }
          : {}),
      },
    });
  }
  return true;
}
async function expireSubscriptionCheckout(checkout: SubscriptionCheckout) {
  await prisma.$transaction(async (tx) => {
    await lockWallets(tx, [checkout.userId]);
    const fresh = await tx.subscriptionCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
    if (fresh.status === 'COMPLETED') return;
    await tx.subscriptionCheckout.update({
      where: { id: checkout.id },
      data: { status: 'EXPIRED' },
    });
    if (checkout.offerId)
      await tx.subscriptionTrialUse.deleteMany({
        where: { checkoutId: checkout.id, claimedAt: null },
      });
  });
}
export async function getSubscriptionCheckoutStatus(
  userId: string,
  id: string,
  paymentId?: string,
) {
  let checkout = await prisma.subscriptionCheckout.findFirst({ where: { id, userId } });
  if (!checkout) throw new WalletError('Checkout not found', 404);
  if (checkout.environment !== subscriptionEnvironment(checkout.gateway as SubscriptionGateway))
    throw new WalletError('This checkout belongs to a different provider account', 409);
  if (checkout.status === 'PENDING' && (checkout.request as any).payload) {
    await finishProviderCheckoutCreation(checkout);
    checkout = await prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id } });
  }
  if (
    checkout.gateway === 'BACHS' &&
    !checkout.checkoutId &&
    ['CREATING', 'REVIEW'].includes(checkout.status) &&
    Date.now() - checkout.updatedAt.getTime() > 30000 &&
    Date.now() - checkout.createdAt.getTime() < 23 * 3600000 &&
    (checkout.request as any).payload
  ) {
    const recovered = await bachsRequest(
      '/checkout-sessions',
      (checkout.request as any).payload,
      checkout.id,
    );
    if (!recovered.checkout_id)
      throw new WalletError('Provider checkout confirmation is pending', 503);
    checkout = await saveProviderCheckout(checkout, recovered);
  }
  if (checkout.gateway === 'FLUTTERWAVE') {
    if (paymentId) await reconcileFlutterwaveSubscriptionPayment(paymentId, id);
    else if (checkout.status !== 'COMPLETED') {
      const result = await flutterwaveRequest(
        `/transactions?tx_ref=${encodeURIComponent(id)}&from=${checkout.createdAt.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`,
      );
      for (const payment of Array.isArray(result.data) ? result.data : [])
        if (payment.tx_ref === id && payment.status === 'successful')
          await reconcileFlutterwaveSubscriptionPayment(String(payment.id), id);
    }
    const expiresAt = (checkout.request as any).payload?.link_expiration;
    if (
      !paymentId &&
      checkout.status !== 'COMPLETED' &&
      expiresAt &&
      Date.now() > providerDate(expiresAt).getTime() + 86400000
    )
      await expireSubscriptionCheckout(checkout);
  } else if (checkout.checkoutId) {
    const remote = await bachsRequest(
      `/checkout-sessions/${encodeURIComponent(checkout.checkoutId)}`,
    );
    if (['expired', 'cancelled'].includes(remote.status)) {
      await expireSubscriptionCheckout(checkout);
    }
    const subscriptionId =
      typeof remote.subscription === 'string'
        ? remote.subscription
        : (remote.subscription?.id ??
          remote.subscription_id ??
          remote.recurring?.subscription_id ??
          remote.recurring?.id);
    if (subscriptionId) await reconcileBachsSubscription(String(subscriptionId), id);
    else if (remote.status === 'completed') {
      const customerId = remote.customer?.customer_id ?? remote.customer?.id;
      if (customerId) {
        for (let page = 0; page < 20; page++) {
          const listed = await bachsRequest(
            `/subscriptions?customer_id=${encodeURIComponent(customerId)}&limit=100&offset=${page * 100}`,
          );
          const match = listed.items?.find((s: any) => s.metadata?.subscription_checkout === id);
          if (match) {
            await reconcileBachsSubscription(String(match.id), id);
            break;
          }
          if (!listed.pagination?.has_more) break;
        }
      }
    }
  }
  checkout = await prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id } });
  return {
    id,
    status: checkout.status,
    subscriptionId: checkout.subscriptionId,
    url: checkout.checkoutUrl,
  };
}
export async function processSubscriptionWebhook(gateway: SubscriptionGateway, event: any) {
  if (gateway === 'FLUTTERWAVE') {
    if (event?.event === 'charge.completed' && event.data?.id)
      return reconcileFlutterwaveSubscriptionPayment(String(event.data.id));
    if (event?.event === 'subscription.cancelled') {
      // Re-query the matching persisted subscription; a cancellation event carries no unique subscription ID.
      const rows = await prisma.subscription.findMany({
        where: {
          providerGateway: 'FLUTTERWAVE',
          providerEnvironment: subscriptionEnvironment('FLUTTERWAVE'),
          isRecurring: true,
          user: { email: event.data?.customer?.email ?? '__' },
        },
      });
      for (const sub of rows) await refreshProviderSubscription(sub);
      return true;
    }
    return false;
  }
  if (event?.type?.startsWith('customer.subscription.') && event.data?.id)
    return reconcileBachsSubscription(String(event.data.id));
  if (event?.type?.startsWith('invoice.')) {
    const id =
      typeof event.data?.subscription === 'string'
        ? event.data.subscription
        : (event.data?.subscription?.id ?? event.data?.subscription_id);
    if (id) return reconcileBachsSubscription(String(id));
  }
  if (event?.type === 'checkout.completed') {
    const ref = event.data?.metadata?.subscription_checkout;
    const checkout =
      typeof ref === 'string'
        ? await prisma.subscriptionCheckout.findUnique({ where: { id: ref } })
        : await prisma.subscriptionCheckout.findFirst({
            where: {
              gateway: 'BACHS',
              checkoutId: event.data?.checkout_id ?? event.data?.id ?? '__',
            },
          });
    if (checkout) {
      const providerId = event.data?.checkout_id ?? event.data?.id;
      if (!checkout.checkoutId && typeof providerId === 'string')
        await prisma.subscriptionCheckout.update({
          where: { id: checkout.id },
          data: { checkoutId: providerId },
        });
      await getSubscriptionCheckoutStatus(checkout.userId, checkout.id);
      return true;
    }
  }
  return false;
}
async function refreshProviderSubscription(sub: Subscription) {
  if (!sub.providerSubscriptionId || !sub.providerGateway || sub.providerGateway === 'WALLET')
    return;
  if (
    sub.providerEnvironment !== subscriptionEnvironment(sub.providerGateway as SubscriptionGateway)
  )
    return;
  if (sub.providerGateway === 'BACHS') {
    await reconcileBachsSubscription(sub.providerSubscriptionId);
    return;
  }
  const binding = await prisma.subscriptionProviderPlan.findUniqueOrThrow({
    where: { id: sub.providerPlanId! },
  });
  const checkout = await prisma.subscriptionCheckout.findFirstOrThrow({
    where: { subscriptionId: sub.id },
  });
  const result = await flutterwaveRequest(
    `/subscriptions?email=${encodeURIComponent((checkout.request as any).email)}&plan=${binding.remoteId}`,
  );
  let remote = (Array.isArray(result.data) ? result.data : []).find(
    (r: any) => String(r.id) === sub.providerSubscriptionId,
  );
  if (!remote) {
    const cancelled = await flutterwaveRequest(
      `/subscriptions?email=${encodeURIComponent((checkout.request as any).email)}&plan=${binding.remoteId}&status=cancelled`,
    );
    remote = (Array.isArray(cancelled.data) ? cancelled.data : []).find(
      (r: any) => String(r.id) === sub.providerSubscriptionId,
    );
  }
  if (remote)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        ...(remote.status !== 'active' ? { isRecurring: false } : {}),
        providerState: remote.status,
        providerUpdatedAt: new Date(),
      },
    });
}
async function cancelProviderSubscription(sub: Subscription) {
  if (!sub.providerSubscriptionId)
    throw new WalletError(
      'Provider subscription confirmation is pending. Check payment before cancelling.',
      409,
    );
  if (
    sub.providerEnvironment !== subscriptionEnvironment(sub.providerGateway as SubscriptionGateway)
  )
    throw new WalletError('Cancellation requires the original provider account', 409);
  if (sub.providerGateway === 'FLUTTERWAVE') {
    const checkout = await prisma.subscriptionCheckout.findFirstOrThrow({
      where: { subscriptionId: sub.id },
    });
    const binding = await prisma.subscriptionProviderPlan.findUniqueOrThrow({
      where: { id: sub.providerPlanId! },
    });
    const cancelled = await flutterwaveRequest(
      `/subscriptions?email=${encodeURIComponent((checkout.request as any).email)}&plan=${binding.remoteId}&status=cancelled`,
    );
    if (
      !(Array.isArray(cancelled.data) ? cancelled.data : []).some(
        (item: any) => String(item.id) === sub.providerSubscriptionId,
      )
    )
      await flutterwaveRequest(
        `/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}/cancel`,
        undefined,
        'PUT',
      );
  } else if (sub.providerGateway === 'BACHS') {
    const remote = await bachsRequest(
      `/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}`,
    );
    if (!remote.cancel_at_period_end && !['canceled', 'cancelled'].includes(remote.status))
      await bachsRequest(
        `/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}`,
        { cancel_at_period_end: true },
        digest(['cancel', sub.id]),
        'DELETE',
      );
  }
}
export async function reconcileSubscriptionPayments() {
  const expired = await prisma.subscription.findMany({
    where: { isPrimary: true, isRecurring: false, status: 'ACTIVE', endDate: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const sub of expired) await cancelAppSubscription({ subId: sub.id, status: 'EXPIRED' });
  // Bounded pages prevent one unavailable provider or account from starving the worker.
  let cursor: string | undefined;
  do {
    const rows = await prisma.subscriptionCheckout.findMany({
      where: {
        status: { in: ['PENDING', 'OPEN', 'REVIEW', 'CREATING'] },
        createdAt: { gt: new Date(Date.now() - 30 * 86400000) },
      },
      orderBy: { id: 'asc' },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows)
      try {
        await getSubscriptionCheckoutStatus(row.userId, row.id);
      } catch (error) {
        logServiceError('v1/subscriptions/index', 'reconcileSubscriptionCheckout', error);
      }
    cursor = rows.length === 100 ? rows[99].id : undefined;
  } while (cursor);
  const subs = await prisma.subscription.findMany({
    where: {
      providerGateway: { in: ['BACHS', 'FLUTTERWAVE'] },
      isPrimary: true,
      isRecurring: true,
      providerSubscriptionId: { not: null },
      OR: [
        { providerUpdatedAt: null },
        { providerUpdatedAt: { lt: new Date(Date.now() - 300000) } },
      ],
    },
    orderBy: { providerUpdatedAt: { sort: 'asc', nulls: 'first' } },
    take: 20,
  });
  for (const sub of subs)
    try {
      await refreshProviderSubscription(sub);
    } catch (error) {
      logServiceError('v1/subscriptions/index', 'refreshProviderSubscription', error);
    } finally {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { providerUpdatedAt: new Date() },
      });
    }
  // Recover missed Flutterwave charge webhooks. Every candidate is verified again by ID.
  if (process.env.FLUTTERWAVE_SECK)
    for (let page = 1; page <= 20; page++) {
      const result = await flutterwaveRequest(
        `/transactions?status=successful&from=${new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&page=${page}`,
      );
      for (const row of Array.isArray(result.data) ? result.data : [])
        try {
          // Listing fields are routing hints only; the matching charge is still verified by ID.
          const known = await prisma.subscriptionCheckout.findFirst({
            where: {
              gateway: 'FLUTTERWAVE',
              environment: subscriptionEnvironment('FLUTTERWAVE'),
              OR: [
                { id: String(row.tx_ref ?? '__') },
                ...(row.customer?.email
                  ? [
                      {
                        recurring: true,
                        request: { path: ['email'], equals: String(row.customer.email) },
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true },
          });
          if (known) await reconcileFlutterwaveSubscriptionPayment(String(row.id));
        } catch (error) {
          logServiceError('v1/subscriptions/index', 'recoverSubscriptionPayment', error);
        }
      if (page >= Number(result.meta?.page_info?.total_pages ?? 1)) break;
    }
}
