import { cachedCatalogRead } from "@/store";
import { cents, requestKey, WalletError, walletFailure, walletOperation } from '@/services/walletLedger';
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
    return { data: `Error occurred: ${error?.message}`, status: 500 };
  }
};

export const purchaseCoinsWithWallet = async (
  item: { id: string; currency: TxnCurrencyEnum; meta?: { [key: string]: any }; idempotencyKey?: string }, user: User
) => {
  try {
    if (item.currency !== TxnCurrencyEnum.TZX) throw new WalletError('Unsupported wallet currency');
    return await walletOperation(`coin-purchase:${user.id}`, requestKey(item.idempotencyKey),
      { packageId: item.id }, [user.id], async tx => {
        const coin = await tx.coinPackage.findUnique({ where: { id: item.id } });
        if (!coin || !coin.isActive || (coin.endDate && coin.endDate < new Date())) throw new WalletError('Coin package unavailable');
        const price = cents(coin.price), amount = cents(coin.amount), bonus = cents(coin.bonus, true);
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        if (wallet.isLocked) throw new WalletError('Wallet is locked');
        if (cents(wallet.credit, true) < price) throw new WalletError('Insufficient balance');
        const updated = await tx.wallet.update({ where: { id: wallet.id }, data: {
          credit: (cents(wallet.credit, true) - price) / 100,
          coins: { increment: amount / 100 }, bonus: { increment: bonus / 100 },
        } });
        const txnRef = generateUniqueRef();
        const common = { userId: user.id, walletId: wallet.id, coinPackageId: coin.id, txnRef,
          category: TxnCategoryEnum.COIN_PURCHASE, gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.CREDIT, status: TxnStatusEnum.COMPLETED, metadata: { coins: amount / 100, bonus: bonus / 100 } };
        await tx.transaction.create({ data: { ...common, amount: price / 100, currency: TxnCurrencyEnum.TZX,
          type: TxnTypeEnum.DEBIT, description: 'Coin package purchase' } });
        await tx.transaction.create({ data: { ...common, amount: (amount + bonus) / 100, currency: TxnCurrencyEnum.COINS,
          source: bonus ? TxnSourceEnum.COINS_BONUS : TxnSourceEnum.COINS, type: TxnTypeEnum.CREDIT, description: 'Coin package and bonus credited' } });
        return { status: 200, data: updated };
      });
  } catch (error) { return walletFailure(error); }
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
  } catch (error) { return walletFailure(error); }
};
