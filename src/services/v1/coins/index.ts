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

export const getCoinPackages = async () => {
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
  item: { id: string; currency: TxnCurrencyEnum, meta?: { [key:string]: any } },
  user: User
) => {
  try {
    // get coin package
    const coin = await prisma.coinPackage.findUnique({
      where: { id: item.id },
    });

    if (!coin) return { data: "Error: Invalid coin package", status: 400 };
    // sync user redis wallet to prisma
    await syncRedisUserWalletToPrisma(user.id);
    // get user wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });

    if (!wallet) return { data: "Cannot retrieve user wallet", status: 400 };

    if (wallet.isLocked)
      return { data: "User wallet not available at the moment", status: 400 };

    if (wallet.credit < coin.price)
      return {
        data: "Insufficient balance to pay for this package, please try another one!",
        status: 400,
      };
    // temporarily lock user wallet until this txn is processed
    await prisma.wallet.update({
      where: { userId: user.id },
      data: { isLocked: true },
    });
    // debit user wallet credit and credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef();
    const [updatedWallet] = await prisma.$transaction([
      // debit wallet credit & credit wallet amount
      prisma.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: false,
          credit: { decrement: coin.price },
          coins: { increment: coin.amount },
          bonus: { increment: coin.bonus },
        },
      }),
      // save debit transaction record
      prisma.transaction.create({
        data: {
          amount: coin.price,
          currency: item.currency,
          coinPackageId: coin.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Charged ${coin.price} ${item.currency} from your wallet credit for the purchase of ${coin.name} coin package ~ ${coin.amount} coins ${
            coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""
          }.`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.CREDIT,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: user.id,
          senderId: user.id,
          walletId: wallet.id,
          metadata: { item: coin, meta: item.meta },
        },
      }),
      // save credit transaction
      prisma.transaction.create({
        data: {
          amount: coin.amount,
          currency: TxnCurrencyEnum.COINS,
          coinPackageId: coin.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Purchased ${coin.name} coin package ~ ${coin.amount} coins ${
            coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""
          } for ${coin.price} ${item.currency } using your wallet credit.`,
          gateway: TxnGatewayEnum.VIRTUAL,
          source: TxnSourceEnum.CREDIT,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: user.id,
          recipientId: user.id,
          walletId: wallet.id,
          metadata: { item: coin, meta: { currency: item.currency } },
        },
      }),
    ]);
    // update redis user wallet
    // sync redis user wallet
    syncPrismaUserWalletToRedis(user.id, updatedWallet);
    return { data: updatedWallet, status: 200 };
  } catch (error: any) {
    return {
      data: "Error: Failed to process transaction, please contact support",
      status: 500,
    };
  }
};

export const purchaseCoinsWithToken = async (
  item: {
    id: string;
    currency: TxnCurrencyEnum;
    gateway: TxnGatewayEnum;
    source: TxnSourceEnum;
    meta: { txnRef?: string; from?: string; to?: string; hash?: string; amount: number, [key: string]: any };
  },
  user: User
) => {
  if (!paymentMethodSchema.safeParse(item).success) {
    return { data: "Unsupported payment method", status: 400 };
  }
  try {
    // get coin package
    const coin = await prisma.coinPackage.findUnique({
      where: { id: item.id },
    });
    // return error if not found
    if (!coin) return { data: "Error: Invalid coin package", status: 400 };
    // get user wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });
    if (!wallet) return { data: "Cannot retrieve user wallet", status: 400 };
    // sync user redis wallet to prisma
    await syncRedisUserWalletToPrisma(user.id);
    // temporarily lock user wallet until this txn is processed
    await prisma.wallet.update({
      where: { userId: user.id },
      data: { isLocked: true },
    });
    // credit user wallet amount and save transaction records
    const txnRef =  generateUniqueRef();
    const [updatedWallet] = await prisma.$transaction([
      // debit wallet credit & credit wallet amount
      prisma.wallet.update({
        where: { userId: user.id },
        data: {
          isLocked: false,
          coins: { increment: coin.amount },
          bonus: { increment: coin.bonus },
        },
      }),
      // save debit transaction record
      prisma.transaction.create({
        data: {
          amount: item.meta.amount,
          currency: item.currency,
          coinPackageId: coin.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Charged ${ item.meta.amount } ${item.currency} for the purchase of ${coin.name} coin package ~ ${coin.amount} coins ${
            coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""
          }.`,
          gateway: item.gateway,
          source: item.source,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          exTxnRef: item?.meta?.txnRef,
          userId: user.id,
          senderId: user.id,
          walletId: wallet.id,
          metadata: { item: coin, meta: item.meta },
        },
      }),
      // save credit transaction
      prisma.transaction.create({
        data: {
          amount: coin.amount,
          currency: TxnCurrencyEnum.COINS,
          coinPackageId: coin.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Purchased ${coin.name} coin package ~ ${coin.amount} coins ${
            coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""
          } for ${ item.meta.amount } ${item.currency}.`,
          gateway: item.gateway,
          source: item.source,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          exTxnRef: item?.meta?.txnRef,
          userId: user.id,
          recipientId: user.id,
          walletId: wallet.id,
          metadata: { item: coin, meta: item.meta },
        },
      }),
    ]);
    // sync redis user wallet
    syncPrismaUserWalletToRedis(user.id, updatedWallet);
    return { data: updatedWallet, status: 200 };
  } catch (error: any) {
    // unlock wallet
    await prisma.wallet.update({
      where: { userId: user.id },
      data: { isLocked: true },
    });
    return {
      data: "Error: Failed to process transaction, please contact support",
      status: 500,
    };
  }
};

export const purchaseCoinsWithFlutterwave = async (item: FlutterwaveCoinPurchase,) => {
  if (!paymentMethodSchema.safeParse(item).success) {
    return { data: "Unsupported payment method", status: 400 };
  }
  try {
    console.log("PurchaseCoinsWithFlutterwave ", item)
    const userId = item.userId
    // check if user exists
    const userExists = await prisma.user.findFirst({where: { id: userId}})
    if(!userExists) return { data: "User not found", status: 404}
    // check coin package exists
    const coinExists = await prisma.coinPackage.findUnique({
      where: { id: item.id },
    });
    // return error if not found
    if (!coinExists) return { data: "Error: Invalid coin package", status: 400 };
    // get user wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId },
    });
    if (!wallet) return { data: "Cannot retrieve user wallet", status: 400 };
    // sync user redis wallet to prisma
    await syncRedisUserWalletToPrisma(userId);
    // temporarily lock user wallet until this txn is processed
    await prisma.wallet.update({
      where: { userId },
      data: { isLocked: true },
    });
    // credit user wallet amount and save transaction records
    const txnRef = generateUniqueRef()
    const [updatedWallet] = await prisma.$transaction([
      // debit wallet credit & credit wallet amount
      prisma.wallet.update({
        where: { userId },
        data: {
          isLocked: false,
          coins: { increment: item.coin.amount },
          bonus: { increment: item.coin.bonus },
        },
      }),
      // save DEBIT transaction
      prisma.transaction.create({
        data: {
          amount: item.meta.txn.amount ,
          currency: item.meta.currency as TxnCurrencyEnum,
          coinPackageId: item.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Charged ${ item.meta.txn.amount } ${item.meta.currency} for the purchase of ${item.coin.name} coin package ~ ${item.coin.amount} coins ${
            item.coin.bonus > 0 ? `+ ${item.coin.bonus} bonus` : ""
          }.`,
          gateway: item.gateway,
          source: item.source,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          exTxnRef: item.txnRef,
          userId,
          recipientId: userId,
          walletId: wallet.id,
          metadata: { item: item.coin, meta: item.meta },
        },
      }),
      // save credit transaction
      prisma.transaction.create({
        data: {
          amount: item.coin.amount,
          currency: TxnCurrencyEnum.COINS,
          coinPackageId: item.coin.id,
          category: TxnCategoryEnum.COIN_PURCHASE,
          description: `Purchased ${item.coin.name} coin package ~ ${item.coin.amount} coins ${
            item.coin.bonus > 0 ? `+ ${item.coin.bonus} bonus` : ""
          } for ${ item.meta.txn.amount } ${item.currency}.`,
          gateway: item.gateway,
          source: item.source,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          exTxnRef: item?.txnRef,
          userId: item.userId,
          recipientId: item.userId,
          walletId: wallet.id,
          metadata: { item: item.coin, meta: item.meta },
        },
      }),
    ]);
    // sync redis user wallet
    syncPrismaUserWalletToRedis(userId, updatedWallet);
    return { data: updatedWallet, status: 200 };
  } catch (error: any) {
       // unlock user wallet
       await prisma.wallet.update({
        where: { userId: item.userId },
        data: { isLocked: false },
      });
    return {
      data: "Error: Failed to process transaction, please contact support",
      status: 500,
    };
  }
};
