import {bachsPaymentMetadata} from '@/utils/bachs';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {WalletError, requestKey} from '@/services/walletLedger';
import {purchaseCoinsWithBachs} from '@/services/v1/coins';
import {bachsConfigured, bachsApiOrigin, bachsRequest, bachsCheckoutUrl, isBachsCheckoutId} from '@/utils/bachs';
import {allowedOrigins} from '@/config';
import { markVerifiedPayment } from '@/services/walletLedger/verifiedPayment';
import { subscriptionPrice } from '@/services/walletLedger/pricing';
import { cents, moneyNumber } from '@/services/walletLedger';
import { flutterwaveApiUrl, flutterwaveSecretKey } from "@/config";
import prisma from "@/db";
import {
  FlutterwaveAppSubPurchase,
  FlutterwaveCoinPurchase,
  FlutterwaveConfig,
  FlutterwaveTxnType,
  PlanTypeEnum,
} from "@/types";
import { flwAPI } from "@/utils/flutterwave";
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";
import axios from "axios";
import {logServiceError,logServiceTrace} from '@/logger/events';


export const generateFlutterwavePaymentLink = async (
  config: FlutterwaveConfig
) => {
  try {
    const response = await axios.post(flutterwaveApiUrl, config, {
      headers: {
        Authorization: `Bearer ${flutterwaveSecretKey}`,
        "Content-Type": "application/json",
      },
    });
    return { data: response.data.data.link, status: 200 };
  } catch (error: any) {
    logServiceError("v1/payments/index", "generateFlutterwavePaymentLink", error);

    const status = error?.status ?? 500;
    let message = error?.message;
    if (error?.response?.data) {
      message = error?.response?.data?.message ?? message;
    }
    return { status, data: message };
  }
};

const coinsResponse = (txnData: any) => {
  const obj: FlutterwaveCoinPurchase = {
    id: String(txnData?.meta?.id),
    amount: Number(txnData?.meta?.amount),
    bonus: Number(txnData?.meta?.bonus),
    txnRef: String(txnData?.tx_ref),
    userId: String(txnData?.meta?.userId),
    gateway: TxnGatewayEnum.FLUTTERWAVE,
    source: TxnSourceEnum.FIAT,
    currency: String(txnData?.meta?.currency) as TxnCurrencyEnum,
    coin: {
      id: String(txnData?.meta?.id),
      name: String(txnData?.meta?.name),
      amount: Number(txnData?.meta?.amount),
      price: Number(txnData?.meta?.price),
      bonus: Number(txnData?.meta?.bonus),
      isActive: Boolean(txnData?.meta?.isActive),
    },
    meta: {
      userId: String(txnData?.meta?.userId),
      currency: String(txnData?.meta?.currency),
      gateway: txnData?.meta?.gateway as TxnGatewayEnum,
      source: txnData?.meta?.source as TxnSourceEnum,
      type: String(txnData?.meta?.type) as FlutterwaveTxnType,
      txn: {
        txnRef: String(txnData?.tx_ref),
        txnId: String(txnData.id),
        amount: Number(txnData?.amount),
        currency: String(txnData?.meta?.currency),
      },
      customer: txnData?.customer,
    },
  };
  return obj;
};

const subscriptionResponse = (txnData: any) => {
  const obj: FlutterwaveAppSubPurchase = {
    planId: String(txnData?.meta?.planId),
    amount: Number(txnData?.meta?.amount),
    gateway: txnData?.meta?.gateway as TxnGatewayEnum,
    source: txnData?.meta?.source as TxnSourceEnum,
    currency: String(txnData?.meta?.currency) as TxnCurrencyEnum,
    isRecurring: txnData?.meta?.isRecurring === true || txnData?.meta?.isRecurring === 'true',
    planType: String(txnData?.meta?.planType) as PlanTypeEnum,
    planName: String(txnData?.meta?.planName),

    meta: {
      type: String(txnData?.meta?.type) as FlutterwaveTxnType,
      planId: String(txnData?.meta?.planId),
      price: Number(txnData?.meta?.price),
      discount: Number(txnData?.meta?.discount),
      tierId: txnData?.meta?.tierId,
      amount: Number(txnData?.meta?.amount),
      planType: String(txnData?.meta?.planType) as PlanTypeEnum,
      userId: String(txnData?.meta?.userId),
      currency: String(txnData?.meta?.currency),
      gateway: txnData?.meta?.gateway as TxnGatewayEnum,
      source: txnData?.meta?.source as TxnSourceEnum,
      txnRef: String(txnData?.tx_ref),
      txnId: String(txnData.id),
      customer: txnData?.customer,
    },
  };
  return obj;
};

export const verifyFlutterwavePayment = async (arg: {
  status: string;
  tx_ref: string | number;
  transaction_id: string | number;
  [key: string]: any;
}) => {
  try {
    const txn = await flwAPI.Transaction.verify({ id: arg.transaction_id });
    const txnData = txn.data;
    const isSuccess =
      txnData.status === "successful" && String(txnData.tx_ref) === String(arg.tx_ref) && String(txnData.id) === String(arg.transaction_id);
    if (!isSuccess)
      return {
        status: 400,
        message:
          "Verification failed as this transaction wasn't successful. But if you think this is a mistake, please contact support!",
        data: null,
      };
    const currency = String(txnData.currency);
    if (!['USD', 'NGN'].includes(currency) || !txnData.meta?.userId) throw new Error('Invalid payment currency or recipient');
    let expected: number;
    let payload: FlutterwaveCoinPurchase | FlutterwaveAppSubPurchase;
    if (txnData.meta.type === FlutterwaveTxnType.COIN_PACKAGE) {
      const coin = await prisma.coinPackage.findUniqueOrThrow({ where: { id: String(txnData.meta.id) } });
      expected = moneyNumber(currency === 'NGN' ? coin.ngnPrice : coin.price);
      txnData.meta = { ...txnData.meta, ...coin, userId: txnData.meta.userId, currency, type: FlutterwaveTxnType.COIN_PACKAGE };
      payload = coinsResponse(txnData);
    } else if (txnData.meta.type === FlutterwaveTxnType.APP_SUBSCRIPTION) {
      const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: String(txnData.meta.planId) } });
      expected = subscriptionPrice(plan, txnData.meta.planType, currency, txnData.meta.tierId);
      txnData.meta = { ...txnData.meta, amount: expected, price: expected, planName: plan.name, currency,
        gateway: TxnGatewayEnum.FLUTTERWAVE, source: TxnSourceEnum.FIAT };
      payload = subscriptionResponse(txnData);
    } else throw new Error('Unsupported payment purpose');
    if (cents(Number(txnData.amount)) < cents(expected)) throw new Error('Payment amount is insufficient');
    return { status: 200, message: 'success', data: markVerifiedPayment(payload, String(txnData.id)) };

  } catch (error: any) {
    logServiceError("v1/payments/index", "verifyFlutterwavePayment", error);

    const status = error?.status ?? 500;
    let message: string = error?.message;
    if (error?.response?.data) {
      message = error?.response?.data?.message ?? message;
    }
    return { status, message, data: null };
  }
};


export const syncFlwSubscriptionPlans = async () => {
  const {enqueueSubscriptionSync}=await import('@/services/v1/subscriptions');
  return {status:202,data:await enqueueSubscriptionSync()};
};

export async function createBachsCoinCheckout(user: import('@/types/user').SessionUser, args: {packageId:string;currency:'USD'|'NGN';key:string;origin:string}) {
  if (!bachsConfigured()) throw new WalletError('Bachs payments are not configured',503);
  const origin = new URL(args.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.origin !== args.origin ||
    !(origin.hostname === 'kwonnet.com' || origin.hostname.endsWith('.kwonnet.com') || allowedOrigins.includes(origin.origin))) throw new WalletError('Invalid checkout return origin');
  // Reuse one order for retries by the same buyer and environment.
  const key = requestKey(args.key);
  const id = createHash('sha256').update(`bachs:${bachsApiOrigin()}:${user.id}:${key}`).digest('hex');
  let order = await prisma.bachsCheckout.findUnique({where:{id}});
  if (!order) {
    const coin = await prisma.coinPackage.findUnique({where:{id:args.packageId}});
    if (!coin?.isActive || (coin.endDate && coin.endDate <= new Date())) throw new WalletError('This coin package is unavailable',404);
    const amount = args.currency === 'NGN' ? coin.ngnPrice : coin.price;
    const bonus = args.currency === 'NGN' ? coin.ngnBonus : coin.bonus;
    cents(amount); cents(coin.amount); cents(bonus,true);
    // Snapshot catalog pricing and coin quantities before contacting Bachs.
    const request = {pricing:{currency:args.currency,amount:amount.toFixed(2)},
      // USD pricing can be collected in the buyer's local currency or crypto.
      ...(args.currency === 'NGN' ? {billing_currency:args.currency} : {}),
      ...(user.email ? {customer:{email:user.email,...(user.name?.trim()?{name:user.name.trim()}:{})}} : {}),
      // Overlay events handle completion; omit hosted-page return redirects.
      reference:id,metadata:{order_id:id,purpose:'COIN_PACKAGE',origin:origin.origin}};
    order = await prisma.bachsCheckout.upsert({where:{id},update:{},create:{id,userId:user.id,packageId:coin.id,environment:bachsApiOrigin(),currency:args.currency,amount,coins:coin.amount,bonus,request}});
  }
  const savedRequest = order.request as {metadata?:{origin?:string};success_url?:string};
  // Preserve retries for older hosted sessions as well as new overlay sessions.
  const savedOrigin = savedRequest.metadata?.origin ?? (savedRequest.success_url ? new URL(savedRequest.success_url).origin : undefined);
  if (order.packageId !== args.packageId || order.currency !== args.currency || savedOrigin !== origin.origin) throw new WalletError('Idempotency key already used for another checkout',409);
  if (order.status !== 'PENDING') throw new WalletError('This checkout is already closed. Start a new purchase.',409);
  if (order.checkoutId && order.checkoutUrl) return {orderId:order.id,checkoutId:order.checkoutId,checkoutUrl:order.checkoutUrl};
  if (Date.now()-order.createdAt.getTime() > 23*60*60*1000) throw new WalletError('Checkout creation needs reconciliation. Contact support with the order ID.',409);
  // Send the saved request with Bachs' idempotency key.
  const result = await bachsRequest('/checkout-sessions',order.request as object,id);
  if (!isBachsCheckoutId(result?.checkout_id)) throw new WalletError('Bachs did not return a checkout identifier',503);
  const checkoutUrl = bachsCheckoutUrl(result.checkout_url);
  await prisma.bachsCheckout.update({where:{id},data:{checkoutId:result.checkout_id,checkoutUrl}});
  return {orderId:id,checkoutId:result.checkout_id,checkoutUrl};
}

export async function getBachsCheckoutStatus(orderId:string,userId:string) {
  const order = await prisma.bachsCheckout.findUnique({where:{id:orderId}});
  if (!order || order.environment !== bachsApiOrigin() || order.userId !== userId) throw new WalletError('Checkout not found',404);
  return {orderId:order.id,status:order.status.toLowerCase(),packageId:order.packageId};
}

export async function reconcileBachsCheckout(orderId:string,userId?:string,providerCheckoutId?:string) {
  let order = await prisma.bachsCheckout.findUnique({where:{id:orderId}});
  if (!order || order.environment !== bachsApiOrigin() || (userId && order.userId !== userId)) throw new WalletError('Checkout not found',404);
  if (order.status === 'PAID') return {orderId:order.id,status:'paid',packageId:order.packageId};
  const checkoutId = order.checkoutId ?? providerCheckoutId;
  if (!isBachsCheckoutId(checkoutId)) return {orderId:order.id,status:'pending',packageId:order.packageId};
  // Confirm payment with Bachs; a browser redirect is not proof of payment.
  const result = await bachsRequest(`/checkout-sessions/${encodeURIComponent(checkoutId)}`);
  if (result.checkout_id !== checkoutId || result.reference !== order.id || result.currency !== order.currency || bachsAmount(result.amount) !== cents(order.amount)) throw new WalletError('Bachs checkout verification mismatch',409);
  if (!order.checkoutId) order = await prisma.bachsCheckout.update({where:{id:order.id},data:{checkoutId}});
  if (['expired','cancelled'].includes(result.status)) {
    // Never overwrite a paid order if a delayed expiry races fulfillment.
    await prisma.bachsCheckout.updateMany({where:{id:order.id,status:'PENDING'},data:{status:result.status.toUpperCase()}});
    return await getBachsCheckoutStatus(order.id,order.userId);
  }
  if (result.status !== 'completed') return {orderId:order.id,status:'pending',packageId:order.packageId};
  // Checkout amount/currency are the catalog price; the charge may be in a
  // different collection currency. Never compare crypto units with fiat cents.
  const charge = result.charge;
  if (!charge || !['succeeded','overpaid','accepted'].includes(charge.status) || !isBachsCheckoutId(charge.payment_id) ||
      (charge.checkout_id != null && charge.checkout_id !== checkoutId)) throw new WalletError('Bachs payment has not been fully confirmed',409);
  let paymentMetadata = bachsPaymentMetadata({...charge,payment_method:charge.payment_method ?? result.payment_method});
  let payment = charge;
  if (paymentMetadata.isCrypto || charge.currency !== order.currency || charge.amount_paid == null) {
    payment = await bachsRequest(`/payments/${encodeURIComponent(charge.payment_id)}`);
    if (payment.payment_id !== charge.payment_id || (payment.checkout_id != null && payment.checkout_id !== checkoutId)) throw new WalletError('Bachs payment metadata verification mismatch',409);
    if ((charge.currency != null && payment.currency !== charge.currency) ||
        (charge.amount != null && !bachsCollectionAmount(payment.amount).eq(bachsCollectionAmount(charge.amount)))) throw new WalletError('Bachs payment has not been fully confirmed',409);
    paymentMetadata = bachsPaymentMetadata({...payment,payment_method:payment.payment_method ?? charge.payment_method ?? result.payment_method});
  }
  if (!['succeeded','overpaid','accepted'].includes(payment.status) || typeof payment.currency !== 'string' || !payment.currency) throw new WalletError('Bachs payment has not been fully confirmed',409);
  const expectedCollection = payment.amount != null ? bachsCollectionAmount(payment.amount)
    : payment.currency === order.currency ? new Prisma.Decimal(order.amount) : null;
  if (!expectedCollection || !expectedCollection.gt(0) ||
      (payment.currency === order.currency && !expectedCollection.eq(order.amount)) ||
      (payment.amount_paid != null && bachsCollectionAmount(payment.amount_paid).lt(expectedCollection)) ||
      (payment.amount_remaining != null && !bachsCollectionAmount(payment.amount_remaining).isZero()) ||
      (payment.status === 'accepted' && payment.amount_paid == null)) throw new WalletError('Bachs payment has not been fully confirmed',409);
  logServiceTrace('v1/payments/index','bachs.payment.verified','Bachs checkout and collection verified',{
    orderId:order.id,checkoutId,paymentId:charge.payment_id,priceCurrency:order.currency,priceAmount:order.amount.toString(),
    collectionCurrency:payment.currency,collectionAmount:expectedCollection.toString(),paymentMethod:paymentMetadata.paymentMethod,
  });
  await purchaseCoinsWithBachs(markVerifiedPayment({orderId:order.id,userId:order.userId,checkoutId,paymentId:charge.payment_id,paymentMetadata:{...paymentMetadata,collectionCurrency:payment.currency}},charge.payment_id));
  return {orderId:order.id,status:'paid',packageId:order.packageId};
}

function bachsAmount(value:unknown) {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) throw new WalletError('Invalid Bachs payment amount',409);
  return cents(new Prisma.Decimal(value),true);
}

function bachsCollectionAmount(value:unknown) {
  if (typeof value === 'string' && value.trim()) {
    try {
      const amount = new Prisma.Decimal(value);
      if (amount.isFinite() && !amount.isNegative()) return amount;
    } catch(error) { logServiceError('v1/payments/index','bachsCollectionAmount',error); }
  }
  throw new WalletError('Invalid Bachs payment amount',409);
}

export async function processBachsWebhook(event:any) {
  const {processSubscriptionWebhook}=await import('@/services/v1/subscriptions');
  if(await processSubscriptionWebhook('BACHS',event)) return;
  if (!['checkout.completed','collection.succeeded'].includes(event?.type)) return;
  const checkoutId = event?.data?.checkout_id;
  if (!isBachsCheckoutId(checkoutId)) return;
  const known = await prisma.bachsCheckout.findUnique({where:{checkoutId}});
  // A signed event can refer to other products sold through the same Bachs account.
  const reference = known?.id ?? event?.data?.reference ?? event?.data?.metadata?.order_id;
  if (typeof reference !== 'string' || !/^[a-f0-9]{64}$/.test(reference)) return;
  if (!known && !await prisma.bachsCheckout.findUnique({where:{id:reference}})) return;
  // Both success events use the same settlement path.
  const result = await reconcileBachsCheckout(reference,undefined,checkoutId);
  if (result.status !== 'paid') throw new WalletError('Payment confirmation is pending',503);
}
