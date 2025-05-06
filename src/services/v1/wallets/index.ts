import {
  CryptoName,
  Prisma,
  RewardTypeEnum,
  TaskStatus,
  Transaction,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
  Wallet,
} from "@prisma/client";
import { BonusTypeEnum, User } from "@/types";
import prisma from "@/db";
import redisClient from "@/redis";
import { getRedisHashKey } from "../games";
import {
  generateUniqueRef,
  getCurrent_ton_usd_rate,
  getTONRate,
  getWithrawalTxnFee,
} from "@/utils";
import {
  syncPrismaSenderRecipientWalletToRedis,
  syncPrismaUserWalletToRedis,
  syncRedisSenderRecipientWalletToPrisma,
  syncRedisUserWalletToPrisma,
} from "../../helper";
import { withdrawTestTonCoins, withdrawTonCoins } from "../../ton";

export const saveUserWalletAddress = async (
  { address, name }: { address: string; name: CryptoName },
  user: User
) => {
  try {
    console.log(`saveUserWalletAddress address`, address, name);
    const count = await prisma.walletAddress.count({
      where: { userId: user.id },
    });
    const isPrimary = count === 0;
    console.log(
      `saveUserWalletAddress user`,
      user,
      "count ",
      count,
      "isPrimary ",
      isPrimary
    );
    const check = await prisma.walletAddress.findFirst({
      where: { userId: user.id, name },
    });
    if (!check) {
      const result = await prisma.walletAddress.create({
        data: { address, userId: user.id, name, isPrimary },
      });
      return { data: result, status: 200 };
    }
    const { metadata, ...rest } = check;
    const _metadata = [
      ...metadata,
      { ...rest, date: new Date().toISOString() },
    ] as Prisma.JsonArray[];
    const result = await prisma.walletAddress.update({
      data: { address, metadata: _metadata },
      where: { userId: user.id },
    });

    return { data: result, status: 200 };
  } catch (error) {
    console.log(error);
    return {
      data: "Error: Failed to save wallet address, please try again",
      status: 500,
    };
  }
};

export const getUserCoinsWallet = async (id: string) => {
  try {
    const result = await prisma.wallet.findFirst({ where: { userId: id } });
    if (!result) return { data: "Wallet not founc", status: 404 };
    return { data: result, status: 200 };
  } catch (error) {
    return {
      data: "Error: Failed to find wallet details, please try again",
      status: 500,
    };
  }
};

export const transferCoins = async ({
  senderId,
  recipientId,
  amount,
}: {
  senderId: string;
  recipientId: string;
  amount: number;
}) => {
  try {
    const txnFee = 0.5 * amount;
    const txnAmount = amount + txnFee;
    // sync both the sender and the recipient wallet
    const syncResult = await syncRedisSenderRecipientWalletToPrisma(
      senderId,
      recipientId
    );

    if (syncResult.isError) return { status: 500, message: syncResult.message };

    // get from and to user
    const [sender, recipient] = await prisma.$transaction([
      prisma.user.findFirst({
        where: { id: senderId },
        include: { wallet: true },
      }),
      prisma.user.findFirst({
        where: { id: recipientId },
        include: { wallet: true },
      }),
    ]);
    // check if from user and wallet exists
    if (!sender || !sender.wallet)
      return { status: 404, message: "Sender does not exist " };
    // check if to user and wallet exists
    if (!recipient || !recipient.wallet)
      return { status: 404, message: "Recipient does not exist" };
    // check min transfer
    if (amount < 100)
      return { status: 400, message: "Minimun transfer amount is 100 coins" };
    // check from wallet balance
    if (sender?.wallet?.amount < amount)
      return { status: 400, message: "Insufficient balance" };
    // check the wallet balance will cover the transaction fee
    if (sender?.wallet?.amount < txnAmount)
      return {
        status: 400,
        message: "Insufficient balance to cover transaction fees",
      };
    // temporarily lock the sender and recipient wallet until this txn is processed
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: senderId },
        data: { isLocked: true },
      }),
      prisma.wallet.update({
        where: { userId: recipientId },
        data: { isLocked: true },
      }),
    ]);
    // debit sender and credit recipient
    const txnRef = generateUniqueRef();
    const [senderWallet, recipientWallet] = await prisma.$transaction([
      // debit sender
      prisma.wallet.update({
        where: { userId: senderId },
        data: { isLocked: false, amount: { decrement: txnAmount } },
      }),
      // credit recipient
      prisma.wallet.update({
        where: { userId: recipientId },
        data: { isLocked: false, amount: { increment: amount } },
      }),
      // save sender transaction
      prisma.transaction.create({
        data: {
          amount: txnAmount,
          currency: TxnCurrencyEnum.COINS,
          category: TxnCategoryEnum.COIN_TRANSFER,
          description: `Transfer of ${amount} ${TxnCurrencyEnum.COINS} to ${recipient.name} successful`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.COINS,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: senderId,
          senderId: senderId,
          recipientId: recipientId,
          walletId: sender?.wallet.id,
          metadata: {
            item: { amount, txnAmount, txnFee },
            currency: TxnCurrencyEnum.COINS,
          },
        },
      }),
      // save recipient transaction
      prisma.transaction.create({
        data: {
          amount: amount,
          currency: TxnCurrencyEnum.COINS,
          category: TxnCategoryEnum.COIN_RECEIVED,
          description: `You received ${amount} ${TxnCurrencyEnum.COINS} from ${sender.name} in your wallet`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.COINS,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: recipientId,
          senderId: senderId,
          recipientId: recipientId,
          walletId: recipient?.wallet.id,
          metadata: {
            item: { amount, txnAmount, txnFee },
            currency: TxnCurrencyEnum.COINS,
          },
        },
      }),
    ]);

    // update redis user wallet
    if (syncResult.data) {
      syncPrismaSenderRecipientWalletToRedis({
        ...syncResult.data,
        senderWallet,
        recipientWallet,
      });
    }
    // send notification to recipient
    // use socket.io or server sent events

    // return result
    return { data: "Transfer successful", status: 200 };
  } catch (error) {
    return {
      data: "Error: Failed to execute transfer, please try again",
      status: 500,
    };
  }
};

export const withdrawCoins = async ({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) => {
  try {
    const txnFee = getWithrawalTxnFee(amount);
    const txnAmount = amount + txnFee;
    // sync both the sender and the recipient wallet
    const syncResult = await syncRedisUserWalletToPrisma(userId);
    if (syncResult.isError) return { status: 500, data: syncResult.message };
    // get from and to user
    const user = await prisma.user.findFirst({
      where: { id: userId },
      include: { wallet: true },
    });
    // check if from user and wallet exists
    if (!user || !user.wallet)
      return { status: 404, data: "User does not exist " };
    // check min transfer
    if (amount < 100)
      return { status: 400, data: "Minimun withdrawal amount is 100 TZX" };
    // check from wallet balance
    if (user?.wallet?.credit < amount)
      return { status: 400, data: "Insufficient balance" };
    // check the wallet balance will cover the transaction fee
    if (user?.wallet?.credit < txnAmount)
      return {
        status: 400,
        data: "Insufficient balance to cover transaction fees",
      };
    // get user crypto address
    const walletAddress = await prisma.walletAddress.findFirst({
      where: { userId },
    });
    if (!walletAddress)
      return {
        status: 400,
        data: "Crypto wallet address not found, please link your TON wallet and try again",
      };
    const recipientAddress = walletAddress.address;
    // get TON equivalent
    const curr_ton_rate = await getCurrent_ton_usd_rate();
    if (!curr_ton_rate)
      return {
        data: "Error getting TON current rate, please try again",
        status: 402,
      };
    const tonTxnAmount = getTONRate(curr_ton_rate, amount, true);
    // temporarily lock the sender and recipient wallet until this txn is processed
    await prisma.wallet.update({ where: { userId }, data: { isLocked: true } });
    // debit sender and credit recipient
    const txnRef = generateUniqueRef();
    const [userWallet, txn] = await prisma.$transaction([
      // debit user
      prisma.wallet.update({
        where: { userId },
        data: { credit: { decrement: txnAmount } },
      }),
      // save sender transaction
      prisma.transaction.create({
        data: {
          amount: txnAmount,
          currency: TxnCurrencyEnum.TZX,
          category: TxnCategoryEnum.COIN_WITHDRAWAL,
          description: `Withdrawal request of ${txnAmount} ${TxnCurrencyEnum.TZX} in ${tonTxnAmount} ${TxnCurrencyEnum.TON} initiated`,
          gateway: TxnGatewayEnum.WALLET,
          source: TxnSourceEnum.CREDIT,
          type: TxnTypeEnum.DEBIT,
          status: TxnStatusEnum.PROCESSING,
          txnRef,
          userId,
          senderId: userId,
          walletId: user?.wallet.id,
          metadata: {
            item: {
              amount,
              txnAmount,
              txnFee,
              address: recipientAddress,
              curr_ton_rate,
              tonTxnAmount,
              userId,
            },
            currency: TxnCurrencyEnum.TZX,
          },
        },
      }),
    ]);
    // initiate TON transaction
    // const result = await withdrawTonCoins(recipientAddress, tonTxnAmount, txnRef)
    const result = await withdrawTestTonCoins(
      recipientAddress,
      tonTxnAmount,
      txnRef
    );
    // const result = await withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 0.01, txnRef )
    // check if failed and refund transaction
    if (result.isError) {
      await prisma.$transaction([
        // refund wallet transaction
        prisma.wallet.update({
          where: { userId },
          data: { credit: { increment: txnAmount }, isLocked: false },
        }),
        // update transaction
        prisma.transaction.update({
          where: { id: txn.id },
          data: {
            status: TxnStatusEnum.REFUNDED,
            description: txn.description.replace(
              "initiated",
              "failed & refunded"
            ),
          },
        }),
      ]);
      return { status: 500, data: result.message };
    }
    // update wallet if success
    await prisma.$transaction([
      // refund wallet transaction
      prisma.wallet.update({ where: { userId }, data: { isLocked: false } }),
      // update transaction
      prisma.transaction.update({
        where: { id: txn.id },
        data: {
          status: TxnStatusEnum.COMPLETED,
          description: txn.description.replace("initiated", "successful"),
        },
      }),
    ]);
    // sync user prisma wallet to redis
    syncPrismaUserWalletToRedis(userId, userWallet);
    // return result
    return { data: "Withdrawal successful", status: 200 };
  } catch (error) {
    // await prisma.wallet.update({ where: { userId }, data: { isLocked: false}})
    return {
      data: "Error: Failed to execute transfer, please try again later",
      status: 500,
    };
  }
};

export const fundCoins = async (
  { userId, amount, bonus }: { userId: string; amount: number; bonus: number },
  currUser: User
) => {
  try {
    // sync both the sender and the recipient wallet
    const syncResult = await syncRedisUserWalletToPrisma(userId);
    if (syncResult.isError) return { status: 500, message: syncResult.message };
    // get from and to user
    const user = await prisma.user.findFirst({
      where: { id: userId },
      include: { wallet: true },
    });
    // check if from user and wallet exists
    if (!user || !user.wallet)
      return { status: 404, message: "User does not exist " };
    // execute transaction
    const desc =
      amount > 0 && bonus > 0
        ? `You received ${amount} ${TxnCurrencyEnum.COINS} &  bonus of ${bonus} ${TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`
        : amount > 0
        ? `You received ${amount} ${TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`
        : `You received bonus of ${bonus} ${TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`;
    // update wallet
    const txnRef = generateUniqueRef();
    const [userWallet] = await prisma.$transaction([
      // debit user
      prisma.wallet.update({
        where: { userId },
        data: { amount: { increment: amount }, bonus: { increment: bonus } },
      }),
      // save sender transaction
      prisma.transaction.create({
        data: {
          amount,
          currency: TxnCurrencyEnum.COINS,
          category: TxnCategoryEnum.COIN_RECEIVED,
          description: desc,
          gateway: TxnGatewayEnum.VIRTUAL,
          source: TxnSourceEnum.VIRTUAL,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId,
          senderId: currUser.id,
          recipientId: userId,
          metadata: {
            item: { amount, bonus, recipient: userId, senderId: currUser.id },
            currency: TxnCurrencyEnum.COINS,
          },
        },
      }),
    ]);
    // sync user prisma wallet to redis
    syncPrismaUserWalletToRedis(userId, userWallet);
    // return response
    return { status: 200, data: "Funding successful" };
  } catch (error) {
    return {
      data: "Error: Failed to execute transfer, please try again",
      status: 500,
    };
  }
};

export const getTxnHistory = async ({
  userId,
  page,
  limit,
}: {
  userId: string;
  page: number;
  limit: number;
}) => {
  try {
    //1496FD5
    const skip = (page - 1) * limit;

    const result = await prisma.transaction.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
    });
    if (result.length === 0)
      return { status: 404, data: "No transaction history" };
    // return response
    return { status: 200, data: result };
  } catch (error) {
    return {
      data: "Error: Failed to execute transfer, please try again",
      status: 500,
    };
  }
};

export const updateWalletBonus = async (arg: {
  userId: string;
  amount: number;
  type: BonusTypeEnum;
  isTask: boolean;
  date: string;
  meta?: any;
}) => {
  try {
    // sync both the sender and the recipient wallet
    const syncResult = await syncRedisUserWalletToPrisma(arg.userId);
    if (syncResult.isError) return { status: 500, message: syncResult.message };
    // get from and to user
    const user = await prisma.user.findFirst({
      where: { id: arg.userId },
      include: { wallet: true },
    });
    // check if from user and wallet exists
    if (!user || !user.wallet)
      return { status: 404, message: "User does not exist " };
    // execute transaction
    const desc = arg.isTask
      ? `Rewarded ${arg.amount} bonus ${TxnCurrencyEnum.COINS} for performing app task`
      : `Rewarded ${arg.amount} bonus ${TxnCurrencyEnum.COINS} ${arg.type === BonusTypeEnum.BONUS ? "as daily bonus" : "for watching ads" } `;
    // update wallet
    const txnRef = generateUniqueRef();
    const date = new Date(arg.date) ?? new Date()
    const [userWallet] = await prisma.$transaction([
      
      // credit user
      prisma.wallet.update({
        where: { userId: arg.userId },
        data: { bonus: { increment: arg.amount } },
      }),
      // save sender transaction
      prisma.transaction.create({
        data: {
          amount: arg.amount,
          currency: TxnCurrencyEnum.COINS,
          category: arg.isTask
            ? TxnCategoryEnum.APP_TASK
            : TxnCategoryEnum.DAILY_BONUS,
          description: desc,
          gateway: TxnGatewayEnum.VIRTUAL,
          source: TxnSourceEnum.VIRTUAL,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId: arg.userId,
          recipientId: arg.userId,
          metadata: {
            item: {
              amount: 0,
              bonus: arg.amount,
              recipient: arg.userId,
              ...(arg.meta && { item: arg.meta }),
            },
            currency: TxnCurrencyEnum.COINS,
          },
        },
      }),

      // update task timer
      prisma.userTaskSettings.upsert({
        where: { userId: arg.userId},
        update: { ...(arg.type === BonusTypeEnum.BONUS ? { dailyBonusDate: date} : { adsBonusDate: date}) },
        create: { userId: arg.userId,...(arg.type === BonusTypeEnum.BONUS? { dailyBonusDate: date} : { adsBonusDate: date}) },
      }),
    ]);
    // sync user prisma wallet to redis
    syncPrismaUserWalletToRedis(arg.userId, userWallet);
    // return response
    return { status: 200, data: "Success" };
  } catch (error) {
    return {
      data: "Error: Failed to execute transfer, please try again",
      status: 500,
    };
  }
};

export const rewardDailyTask = async ({
  id: taskId,
  code,
  userId,
}: {
  id: string;
  code?: string | undefined;
  userId: string;
}) => {
  try {
    const result = await prisma.task.findFirst({
      where: { id: taskId },
      include: { performedBy: { where: { userId, taskId } } },
    });

    if (!result) return { data: "Not found", status: 404 };

    if (result.performedBy.length > 0) {
      return { data: "You have already performed this task", status: 422 };
    }
    if (result.code && result.code !== code) {
      return { data: "Invalid code provided", status: 422 };
    }
    // sync both the sender and the recipient wallet
    const syncResult = await syncRedisUserWalletToPrisma(userId);
    if (syncResult.isError) return { status: 500, data: syncResult.message };
    // get from and to user
    const user = await prisma.user.findFirst({
      where: { id: userId },
      include: { wallet: true },
    });
    // check if from user and wallet exists
    if (!user || !user.wallet)
      return { status: 404, data: "User does not exist " };
    // execute transaction
    const desc = `Rewarded ${result.reward} ${result.rewardType} for performing app task`;
    // update wallet
    const updateObj =
      result.rewardType === RewardTypeEnum.CREDIT
        ? { credit: { increment: result.reward } }
        : result.rewardType === RewardTypeEnum.COINS
        ? { amount: { increment: result.reward } }
        : { bonus: { increment: result.reward } };
    const txnRef = generateUniqueRef();
    const [userWallet] = await prisma.$transaction([
      // debit user
      prisma.wallet.update({ where: { userId }, data: updateObj }),
      // save sender transaction
      prisma.transaction.create({
        data: {
          amount: result.reward,
          currency:
            result.rewardType === RewardTypeEnum.CREDIT
              ? TxnCurrencyEnum.TZX
              : TxnCurrencyEnum.COINS,
          category: TxnCategoryEnum.APP_TASK,
          description: desc,
          gateway: TxnGatewayEnum.VIRTUAL,
          source: TxnSourceEnum.VIRTUAL,
          type: TxnTypeEnum.CREDIT,
          status: TxnStatusEnum.COMPLETED,
          txnRef,
          userId,
          recipientId: userId,
          taskId,
          metadata: {
            item: { amount: result.reward, rewardType: result.rewardType,  recipient: userId, taskId, code },
            currency: TxnCurrencyEnum.COINS,
          },
        },
      }),
      // create user task
      prisma.userTask.create({ data: { taskId, userId, status: TaskStatus.COMPLETED } }),
    ]);
    // sync user prisma wallet to redis
    syncPrismaUserWalletToRedis(userId, userWallet);
    // return response
    return { status: 200, data: "Success" };
  } catch (error) {
    return {
      data: "Error: Failed to execute transfer, please try again",
      status: 500,
    };
  }
};

// test app wallet
// withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 1, generateUniqueRef() )
// withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 0.5, generateUniqueRef() )
// Live app wallet
// withdrawTestTonCoins("UQDB7WxFFuZQ2LPMwoC7eSLWwLJ1pMZZ_sURxct8GAXEIuHt", 0.02, generateUniqueRef() )
