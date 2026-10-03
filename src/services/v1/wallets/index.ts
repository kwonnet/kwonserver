import { RewardTypeEnum, TaskStatus, TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum } from '@prisma/client';
import { BonusTypeEnum, User } from '@/types';
import prisma from '@/db';
import { randomUUID } from 'crypto';
import { cents, requestKey, WalletError, walletFailure, walletOperation } from '@/services/walletLedger';

const creditRecord = (userId: string, amount: number, category: TxnCategoryEnum) => ({
  userId, recipientId: userId, amount, category, txnRef: randomUUID(), currency: TxnCurrencyEnum.COINS,
  gateway: TxnGatewayEnum.VIRTUAL, source: TxnSourceEnum.VIRTUAL, type: TxnTypeEnum.CREDIT,
  status: TxnStatusEnum.COMPLETED, description: 'Wallet reward',
});
export const getUserCoinsWallet = async (userId: string) => {
  try { const data = await prisma.wallet.findUnique({ where: { userId } });
    return { status: data ? 200 : 404, data: data ?? 'Wallet not found' };
  } catch (error) { return walletFailure(error); }
};
export const transferCoins = async (arg: { senderId: string; recipientId: string; amount: number; idempotencyKey?: string }) => {
  try {
    const amount = cents(arg.amount);
    if (amount < 10000) throw new WalletError('Minimum transfer amount is 100 coins');
    if (arg.senderId === arg.recipientId) throw new WalletError('Cannot transfer to yourself');
    const fee = Math.round(amount * 0.5), debit = amount + fee; // Preserve existing 50% fee policy.
    return await walletOperation(`transfer:${arg.senderId}`, requestKey(arg.idempotencyKey),
      { recipientId: arg.recipientId, amount }, [arg.senderId, arg.recipientId], async tx => {
        const sender = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.senderId } });
        const recipient = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.recipientId } });
        if (sender.isLocked || recipient.isLocked) throw new WalletError('Wallet is locked');
        if (cents(sender.coins, true) < debit) throw new WalletError('Insufficient balance including transaction fee');
        await tx.wallet.update({ where: { id: sender.id }, data: { coins: (cents(sender.coins, true) - debit) / 100 } });
        await tx.wallet.update({ where: { id: recipient.id }, data: { coins: { increment: amount / 100 } } });
        const txnRef = randomUUID();
        const common = { txnRef, senderId: arg.senderId, recipientId: arg.recipientId, currency: TxnCurrencyEnum.COINS,
          gateway: TxnGatewayEnum.WALLET, source: TxnSourceEnum.COINS, status: TxnStatusEnum.COMPLETED,
          metadata: { amount: amount / 100, txnFee: fee / 100, txnAmount: debit / 100 } };
        await tx.transaction.create({ data: { ...common, userId: arg.senderId, walletId: sender.id,
          amount: debit / 100, category: TxnCategoryEnum.COIN_TRANSFER, type: TxnTypeEnum.DEBIT, description: 'Coin transfer including fee' } });
        await tx.transaction.create({ data: { ...common, userId: arg.recipientId, walletId: recipient.id,
          amount: amount / 100, category: TxnCategoryEnum.COIN_RECEIVED, type: TxnTypeEnum.CREDIT, description: 'Coins received' } });
        return { status: 200, data: 'Transfer successful' };
      });
  } catch (error) { return walletFailure(error); }
};
export const fundCoins = async (arg: { userId: string; amount: number; bonus: number; idempotencyKey?: string }, currUser: User & { role?: string }) => {
  if (!['ADMIN', 'SUPER'].includes(currUser.role ?? '')) return { status: 403, data: 'Only administrators can fund wallets' };
  try {
    const amount = cents(arg.amount, true), bonus = cents(arg.bonus, true);
    if (!amount && !bonus) throw new WalletError('Amount or bonus must be positive');
    return await walletOperation(`fund:${currUser.id}`, requestKey(arg.idempotencyKey),
      { userId: arg.userId, amount, bonus }, [arg.userId], async tx => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.userId } });
        if (wallet.isLocked) throw new WalletError('Wallet is locked');
        await tx.wallet.update({ where: { id: wallet.id }, data: { coins: { increment: amount / 100 }, bonus: { increment: bonus / 100 } } });
        await tx.transaction.create({ data: { ...creditRecord(arg.userId, (amount + bonus) / 100, TxnCategoryEnum.COIN_RECEIVED),
          walletId: wallet.id, senderId: currUser.id, source: amount && bonus ? TxnSourceEnum.COINS_BONUS : amount ? TxnSourceEnum.COINS : TxnSourceEnum.BONUS, metadata: { coins: amount / 100, bonus: bonus / 100 } } });
        return { status: 200, data: 'Funding successful' };
      });
  } catch (error) { return walletFailure(error); }
};
export const getTxnHistory = async ({ userId, page, limit }: { userId: string; page: number; limit: number }) => {
  try {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new WalletError('Invalid pagination');
    const data = await prisma.transaction.findMany({ where: { userId }, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return { status: data.length ? 200 : 404, data: data.length ? data : 'No transaction history' };
  } catch (error) { return walletFailure(error); }
};
export const updateWalletBonus = async (arg: { userId: string; amount: number; type: BonusTypeEnum; isTask: boolean; date: string; meta?: any }) => {
  try {
    if (arg.isTask || ![BonusTypeEnum.BONUS, BonusTypeEnum.ADS].includes(arg.type)) throw new WalletError('Invalid reward type');
    const amount = cents(arg.amount);
    if (amount > 1000) throw new WalletError('Bonus amount is illegal');
    // Client-provided dates must never control eligibility.
    return await walletOperation(`bonus:${arg.userId}`, undefined, {}, [arg.userId], async tx => {
      const field = arg.type === BonusTypeEnum.BONUS ? 'dailyBonusDate' : 'adsBonusDate';
      const settings = await tx.userTaskSettings.findUnique({ where: { userId: arg.userId } });
      const now = new Date();
      if (settings?.[field] && settings[field] > now) throw new WalletError('User already rewarded today');
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.userId } });
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      await tx.wallet.update({ where: { id: wallet.id }, data: { bonus: { increment: amount / 100 } } });
      await tx.transaction.create({ data: { ...creditRecord(arg.userId, amount / 100, TxnCategoryEnum.DAILY_BONUS), walletId: wallet.id, source: TxnSourceEnum.BONUS, metadata: { bonus: amount / 100, type: arg.type } } });
      await tx.userTaskSettings.upsert({ where: { userId: arg.userId }, create: { userId: arg.userId, [field]: next }, update: { [field]: next } });
      return { status: 200, data: 'Success' };
    });
  } catch (error) { return walletFailure(error); }
};
export const rewardDailyTask = async ({ id: taskId, code, userId }: { id: string; code?: string; userId: string }) => {
  try {
    return await walletOperation(`task:${userId}`, taskId, { taskId }, [userId], async tx => {
      const task = await tx.task.findUnique({ where: { id: taskId }, include: { performedBy: { where: { userId } } } });
      if (!task) throw new WalletError('Task not found', 404);
      if (task.performedBy.length) throw new WalletError('You have already performed this task', 422);
      if (task.code && task.code !== code) throw new WalletError('Invalid code provided', 422);
      const reward = cents(task.reward);
      const field = task.rewardType === RewardTypeEnum.CREDIT ? 'credit' : task.rewardType === RewardTypeEnum.COINS ? 'coins' : 'bonus';
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      await tx.wallet.update({ where: { id: wallet.id }, data: { [field]: { increment: reward / 100 } } });
      await tx.transaction.create({ data: { ...creditRecord(userId, reward / 100, TxnCategoryEnum.APP_TASK), walletId: wallet.id,
        source: field === 'credit' ? TxnSourceEnum.CREDIT : field === 'coins' ? TxnSourceEnum.COINS : TxnSourceEnum.BONUS,
        currency: field === 'credit' ? TxnCurrencyEnum.TZX : TxnCurrencyEnum.COINS, taskId, metadata: { rewardType: task.rewardType } } });
      await tx.userTask.create({ data: { userId, taskId, status: TaskStatus.COMPLETED } });
      return { status: 200, data: 'Success' };
    });
  } catch (error) { return walletFailure(error); }
};
