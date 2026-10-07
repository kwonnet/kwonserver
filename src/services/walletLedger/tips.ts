import prisma from '@/db';
import { cents, walletOperation } from './index';
import {logServiceError} from '@/logger/events';

// Historical pending tips are deliberately excluded until reconciled.
export async function settleTip(id: string, userId: string) {
  return walletOperation('tip-settlement', id, { id, userId }, [userId], async tx => {
    const tip = await tx.rewardTip.findUniqueOrThrow({ where: { id }, include: { transaction: true } });
    const meta = tip.transaction.metadata as Record<string, unknown> | null;
    if (tip.userId !== userId || tip.status !== 'PENDING' || tip.availableAt > new Date() ||
      tip.transaction.status !== 'PENDING' || meta?.settlementVersion !== 1) throw new Error('Tip is not eligible for settlement');
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (wallet.isLocked || wallet.id !== tip.walletId || tip.transaction.walletId !== wallet.id || cents(tip.transaction.amount, true) !== cents(tip.amount, true)) throw new Error('Tip wallet is locked or inconsistent');
    const amount = cents(tip.amount, true);
    await tx.wallet.update({ where: { id: wallet.id }, data: { credit: { increment: amount / 100 } } });
    await tx.transaction.update({ where: { id: tip.txnId }, data: { status: 'COMPLETED' } });
    await tx.rewardTip.update({ where: { id }, data: { status: 'SETTLED', settledAt: new Date() } });
    return { id, amount: amount / 100 };
  });
}
export async function settleDueTips() {
  const tips = await prisma.rewardTip.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() },
    transaction: { status: 'PENDING', metadata: { path: ['settlementVersion'], equals: 1 } } },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }], take: 100 });
  const errors: unknown[] = [];
  for (const tip of tips) { try { await settleTip(tip.id, tip.userId); } catch (error) {
    logServiceError("walletLedger/tips", "settleDueTips", error);
 errors.push(error); } }
  if (errors.length) throw new Error(`${errors.length} tip settlements failed; pending records retained`);
}
