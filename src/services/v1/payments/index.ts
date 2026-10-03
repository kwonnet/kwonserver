import { markVerifiedPayment } from '@/services/walletLedger/verifiedPayment';
import { subscriptionPrice } from '@/services/walletLedger/pricing';
import { cents, moneyNumber } from '@/services/walletLedger';
import { appName, flutterwaveApiUrl, flutterwaveSecretKey } from "@/config";
import prisma from "@/db";
import {
  FlutterwaveAppSubPurchase,
  FlutterwaveCoinPurchase,
  FlutterwaveConfig,
  FlutterwavePaymentPlanResponse,
  FlutterwaveTxnType,
  PlanTypeEnum,
  SubPaymentPlan,
} from "@/types";
import { flwAPI } from "@/utils/flutterwave";
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";
import axios from "axios";

const flwAxiosAPI = axios.create({
  baseURL: "https://api.flutterwave.com/v3",
  headers: {
    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECK}`,
  },
});


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
    const status = error?.status ?? 500;
    let message: string = error?.message;
    if (error?.response?.data) {
      message = error?.response?.data?.message ?? message;
    }
    return { status, message, data: null };
  }
};


const getSubscriptionsPlan = async () => {
  try {
    const plans = await prisma.subscriptionPlan.findMany();
    if (plans.length === 0) return { plans: [], flatPlans: [] };
    const paymentPlans = plans.flatMap((plan) => {
      const tiers =
        plan.tier.length > 0
          ? plan.tier
          : [{ id: null, name: "", price: plan.price }];
      return tiers.flatMap((tier) => [
        {
          planRef: `monthly_${plan.id}${tier.id ? `_${tier.id}` : ""}`,
          name: `${appName} Monthly ${plan.name}${
            tier.name ? ` ${tier.name}` : ""
          } Plan`,
          amount: moneyNumber(tier.price),
          interval: "Monthly",
          duration: 120, // 120 months or 10 years
          currency: TxnCurrencyEnum.USD,
          planId: plan.id,
          tierId: tier.id,
          flw: null,
        },
        {
          planRef: `yearly_${plan.id}${tier.id ? `_${tier.id}` : ""}`,
          name: `${appName} Yearly ${plan.name}${
            tier.name ? ` ${tier.name}` : ""
          } Plan`,
          amount: parseFloat(
            (moneyNumber(tier.price) * 12 * (1 - plan.discount)).toFixed(2)
          ),
          interval: "Yearly",
          duration: 10, // 10 years
          currency: TxnCurrencyEnum.USD,
          planId: plan.id,
          tierId: tier.id,
          flw: null,
        },
      ]);
    });
    return { plans, flatPlans: paymentPlans };
  } catch (error) {
    throw error;
  }
};



const createFlwPaymentPlans = async (flatMap: SubPaymentPlan[]) => {
  try {
    // Map each plan to a Promise that handles the API call
    const results = await Promise.all(
      flatMap.map(async (plan) => {
        try {
          const response = await flwAxiosAPI.post("/payment-plans", plan);
          // Add the 'flw' property to the plan with the response data
          return {
            ...plan,
            flw: response?.data?.data as FlutterwavePaymentPlanResponse,
          };
        } catch (error: any) {
          // Handle error for individual plan, adding failure response
          return { ...plan, flw: null };
        }
      })
    );
    const succeededItems = results.filter((plan) => plan.flw !== null);
    if (succeededItems.length !== flatMap.length) {
      await Promise.allSettled(
        succeededItems.map(async (plan) => {
          try {
            const response = await flwAxiosAPI.put(
              `payment-plans/${plan.flw.id}/cancel`, { id: plan.flw.id}
            );
            return response?.data?.data;
          } catch (error: any) {
            return null;
          }
        })
      );
      return [];
    }
    return succeededItems;
  } catch (error) {
    throw error;
  }
};

export const syncFlwSubscriptionPlans = async () => {
  try {
    const { plans, flatPlans } = await getSubscriptionsPlan();

    if (flatPlans.length === 0) {
        return { data: "App subscription payment plans not found", status: 404 }
    }

    const flwPlans = await createFlwPaymentPlans(flatPlans);

    if (flwPlans.length === 0) {
        return { data: "Error syncing app subscription payment plans to flutterwave", status: 402 }
    };

    const dbPlans = plans.map((plan) => {
      const flwData = flwPlans.filter((p) => p.planId === plan.id);
      return {
        ...plan,
        metadata: {
            ...(plan.metadata ? plan.metadata : {}),
          flw: flwData.map((item) => {
            return {
              flwId: item.flw?.id,
              flwToken: item.flw?.plan_token,
              flwCreatedAt: item.flw?.created_at,
              flwStatus: item.flw?.status,
              flwInterval: item.flw?.interval,
              flwCurrency: item.flw?.currency,
              flwAmount: item.flw?.amount,
              flwDuration: item.flw?.duration,
              tierId: item.tierId,
              id: item.planId,
              name: item.name,
              planRef: item.planRef,
            };
          }),
        },
      };
    });
    // update db payment plans
    const result = await prisma.$transaction(
      dbPlans.map((item) =>
        prisma.subscriptionPlan.update({
          where: { id: item.id },
          data: { metadata: item.metadata },
        })
      )
    );
    return { data: result, status: 200 };
  } catch (error: any) {
    return { data: "Sorry an error occurred, please try again later", status: 500 };
  }
};

