import prisma from '@/db';
import logger from '@/logger';
import {PromisePool} from '@supercharge/promise-pool';
import {deliverNotification} from '@/services/v1/notifications';

/** Device delivery is independent of wallet processing and uses existing row leases. */
export async function deliverMonthlyRewardBatch(batchId: string) {
  const delivery = await prisma.monthlyRewardDelivery.findUnique({where: {id: batchId}});
  if (!delivery || delivery.status === 'COMPLETED') return;
  try {
    const receipt = await prisma.walletOperation.findUniqueOrThrow({where: {id: batchId}});
    const ids = (receipt.result as {notificationIds?: unknown}).notificationIds;
    if (receipt.scope !== 'monthly-reward-batch' || !Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== 'string')) {
      throw new Error('Invalid monthly reward notification receipt');
    }
    // Mark recipients without any eligible devices in one query, rather than
    // issuing several individual queries for every unsubscribed player.
    await prisma.notification.updateMany({where: {id: {in: ids}, pushSentAt: null,
      recipient: {pushNotifications: {none: {OR: [{sessionId: null}, {session: {
        revokedAt: null, expiresAt: {gt: new Date()},
      }}]}}}}, data: {pushSentAt: new Date()}});
    const due = await prisma.notification.findMany({where: {id: {in: ids}, pushSentAt: null,
      pushAttempts: {lt: 5}, nextPushAttemptAt: {lte: new Date()}}, select: {id: true}});
    const {errors} = await PromisePool.for(due).withConcurrency(4).process(async n => { await deliverNotification(n.id); });
    if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
    const pending = await prisma.notification.findFirst({where: {id: {in: ids}, pushSentAt: null, pushAttempts: {lt: 5}},
      orderBy: {nextPushAttemptAt: 'asc'}, select: {nextPushAttemptAt: true}});
    await prisma.monthlyRewardDelivery.update({where: {id: batchId}, data: {
      status: pending ? 'PENDING' : 'COMPLETED', lastError: null,
      nextAttemptAt: pending ? new Date(Math.max(Date.now() + 60000, pending.nextPushAttemptAt.getTime())) : new Date(),
    }});
  } catch (error) {
    logger.error({event: 'monthly_reward_notification_failed', batchId, error}, 'Monthly reward notification batch failed');
    await prisma.monthlyRewardDelivery.update({where: {id: batchId}, data: {
      lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Notification batch failed',
      nextAttemptAt: new Date(Date.now() + 60000),
    }});
    throw error;
  }
}
