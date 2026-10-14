import type {BachsPaymentMetadata} from '@/utils/bachs';
import { cachedCatalogRead } from "@/store";
import { cents, moneyNumber, requestKey, WalletError, walletFailure, walletOperation } from '@/services/walletLedger';
import { verifiedPaymentId } from '@/services/walletLedger/verifiedPayment';
import { paymentMethodSchema } from "@/schema/payment";
import { FlutterwaveCoinPurchase, User } from "@/types";
import prisma from "@/db";

import {
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
} from "@prisma/client";
import {
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "../../helper";
import { generateUniqueRef } from "@/utils";
import logger from "@/logger";
import {logServiceError} from '@/logger/events';

export const getCoinPackages = async () => {
  return cachedCatalogRead("coin-packages", 60000, async () => {
    try {
      const packages = await prisma.coinPackage.findMany();
      return {
        data: {
          packages,
          addresses: [],
        },
        status: 200,
      };
    } catch (error) {
    logServiceError("v1/coins/index", "getCoinPackages", error);

      return { data: "Error: Failed to fetch packages", status: 500 };
    }
  });
};

export const saveTxnLog = async (item: {
  id: string;
  currency: TxnCurrencyEnum;
  meta: { from?: string; to?: string; hash?: string; amount: number, [key: string]: any };
},
user: User) => {
  try {
    const result = await prisma.transactionLogs.create({ data: { userId: user.id, coinPackageId: item.id, meta: { currency: item.currency, coinId: item.id, ...item.meta}  }})
    return { data: result, status: 200 };
  } catch (error: any) {
    logServiceError("v1/coins/index", "saveTxnLog", error);

    return { data: `Error occurred: ${error?.message}`, status: 500 };
  }
};

export const purchaseCoinsWithWallet = async (_item:unknown,_user:unknown) => {
  return {status:400,data:'Coin packages require an external payment',message:'Coin packages require an external payment'};
};


// A gateway/source enum and client-supplied transaction reference are not proof of payment.
export const purchaseCoinsWithToken = async (_item: any, _user: User) => ({
  status: 400, data: 'Use the server-verified payment callback to settle external purchases',
});

export const purchaseCoinsWithFlutterwave = async (item: FlutterwaveCoinPurchase) => {
  if (![TxnCurrencyEnum.USD, TxnCurrencyEnum.NGN].includes(item.currency as any)) return { status: 400, data: 'Unsupported payment currency' };
  try {
    const providerId = verifiedPaymentId(item);
    if (!providerId) throw new WalletError('Payment has not been verified');
    return await walletOperation('flutterwave', providerId, { userId: item.userId, packageId: item.id }, [item.userId], async tx => {
      // Preserve replay protection for transactions settled before operation receipts existed.
      const prior = await tx.transaction.findFirst({ where: { exTxnRef: item.txnRef, gateway: TxnGatewayEnum.FLUTTERWAVE, status: TxnStatusEnum.COMPLETED } });
      if (prior) return { status: 200, data: 'Payment already settled' };
      const coin = await tx.coinPackage.findUniqueOrThrow({ where: { id: item.id } });
      const amount = cents(coin.amount), bonus = cents(item.currency === TxnCurrencyEnum.NGN ? coin.ngnBonus : coin.bonus, true);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: item.userId } });
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { coins: { increment: amount / 100 }, bonus: { increment: bonus / 100 } } });
      const common = { userId: item.userId, walletId: wallet.id, coinPackageId: coin.id, txnRef: generateUniqueRef(), exTxnRef: item.txnRef,
        category: TxnCategoryEnum.COIN_PURCHASE, gateway: TxnGatewayEnum.FLUTTERWAVE, source: TxnSourceEnum.FIAT,
        status: TxnStatusEnum.COMPLETED, metadata: { providerId, coins: amount / 100, bonus: bonus / 100 } };
      await tx.transaction.create({ data: { ...common, amount: item.meta.txn.amount, currency: item.currency, type: TxnTypeEnum.DEBIT, description: 'Verified external payment' } });
      await tx.transaction.create({ data: { ...common, amount: (amount + bonus) / 100, currency: TxnCurrencyEnum.COINS, source: bonus ? TxnSourceEnum.COINS_BONUS : TxnSourceEnum.COINS, type: TxnTypeEnum.CREDIT, description: 'Verified coin package credited' } });
      return { status: 200, data: updated };
    });
  } catch (error) {
    logServiceError("v1/coins/index", "purchaseCoinsWithFlutterwave", error);
 return walletFailure(error); }
};

export async function purchaseCoinsWithBachs(item: {orderId: string; userId: string; checkoutId: string; paymentId: string; paymentMetadata?: BachsPaymentMetadata}) {
  if (verifiedPaymentId(item) !== item.paymentId) throw new WalletError('Payment has not been verified');
  // One provider payment can credit only one order, even across checkout IDs.
  return await walletOperation('bachs', item.paymentId, {orderId:item.orderId,userId:item.userId,checkoutId:item.checkoutId}, [item.userId], async tx => {
    const order = await tx.bachsCheckout.findUniqueOrThrow({where:{id:item.orderId}});
    if (order.userId !== item.userId || order.checkoutId !== item.checkoutId) throw new WalletError('Payment recipient mismatch');
    if (order.status === 'PAID') return {status:'paid',orderId:order.id};
    const credited = await tx.transaction.findFirst({where:{gateway:'BACHS',category:'COIN_PURCHASE',type:'CREDIT',metadata:{path:['providerId'],equals:item.paymentId}},select:{id:true}});
    if (credited) throw new WalletError('This Bachs payment has already credited a purchase',409);
    const wallet = await tx.wallet.findUniqueOrThrow({where:{userId:order.userId}});
    if (wallet.isLocked) throw new WalletError('Wallet is locked', 409);
    // Commit the balance, ledger entries and paid status together.
    await tx.wallet.update({where:{id:wallet.id},data:{coins:{increment:order.coins},bonus:{increment:order.bonus}}});
    const common = {userId:order.userId,walletId:wallet.id,coinPackageId:order.packageId,txnRef:generateUniqueRef(),exTxnRef:item.checkoutId,
      category:TxnCategoryEnum.COIN_PURCHASE,gateway:TxnGatewayEnum.BACHS,source:TxnSourceEnum.FIAT,status:TxnStatusEnum.COMPLETED,
      metadata:{...item.paymentMetadata,providerId:item.paymentId,orderId:order.id,coins:moneyNumber(order.coins),bonus:moneyNumber(order.bonus)}};
    await tx.transaction.create({data:{...common,amount:order.amount,currency:order.currency,type:TxnTypeEnum.DEBIT,description:'Verified Bachs payment'}});
    await tx.transaction.create({data:{...common,amount:order.coins.add(order.bonus),currency:TxnCurrencyEnum.COINS,source:order.bonus.gt(0)?TxnSourceEnum.COINS_BONUS:TxnSourceEnum.COINS,type:TxnTypeEnum.CREDIT,description:'Coin package and bonus credited'}});
    await tx.bachsCheckout.update({where:{id:order.id},data:{status:'PAID',paidAt:new Date()}});
    return {status:'paid',orderId:order.id};
  });
}
