import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import prisma from '@/db';
import logger from '@/logger';
import redis from '@/redis';
import {walletOperation, WalletError} from './index';
import {prepareMilestonePlan, MilestonePlan} from './milestoneRewardPlan';
import {rewardHash} from './milestoneRewardQueue';
import {enqueueNotificationDeliveries} from '@/services/v1/notifications';

async function settle(id: string) {
  return walletOperation('game-milestone-batch', id, {taskId: id, version: 1}, [], async tx => {
    await tx.$queryRaw`SELECT id FROM "GameMilestoneRewardTask" WHERE id=${id} FOR UPDATE`;
    const task = await tx.gameMilestoneRewardTask.findUniqueOrThrow({where: {id}});
    if (task.status === 'COMPLETED') return {notificationIds: task.notificationIds};
    const plan = task.plan as unknown as MilestonePlan;
    if (plan?.version !== 1 || !Array.isArray(plan.awards) || plan.awards.length > 3 ||
      new Set(plan.awards.map(a => a.playerId)).size !== plan.awards.length) throw new Error('Invalid milestone reward plan');
    const awards = plan.awards.map(a => ({...a, receiptId: rewardHash(`${a.legacyScope}:${a.legacyKey}`),
      fingerprint: rewardHash(JSON.stringify({recipient: a.playerId}))}));
    // Honor legacy receipts and locks during rolling upgrades; batch/job IDs alone
    // cannot protect against an old reward routine running on another replica.
    if (awards.length) await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(id,0))::text
      FROM (SELECT unnest(${awards.map(a => a.receiptId)}::text[]) AS id ORDER BY id) operations`);
    const receipts = await tx.walletOperation.findMany({where: {id: {in: awards.map(a => a.receiptId)}}});
    const prior = new Map(receipts.map(r => [r.id, r]));
    for (const award of awards) if (prior.has(award.receiptId) && prior.get(award.receiptId)!.fingerprint !== award.fingerprint) {
      throw new WalletError('Legacy reward receipt conflicts with this recipient', 409);
    }
    const fresh = awards.filter(a => !prior.has(a.receiptId));
    const wallets = fresh.length ? await tx.$queryRaw<{id: string; user_id: string}[]>(Prisma.sql`
      SELECT id,user_id FROM "Wallet" WHERE user_id IN (${Prisma.join(fresh.map(a => a.playerId))}) ORDER BY user_id FOR UPDATE`) : [];
    if (wallets.length !== fresh.length) throw new WalletError('Wallet not found', 404);
    const walletIds = new Map(wallets.map(w => [w.user_id, w.id]));
    if (fresh.length) await tx.$executeRaw(Prisma.sql`
      UPDATE "Wallet" w SET coins=w.coins+v.coins, bonus=w.bonus+v.bonus, "updatedAt"=NOW()
      FROM (VALUES ${Prisma.join(fresh.map(a => Prisma.sql`(${a.playerId}::text,
        ${new Prisma.Decimal(a.rewardType === 'COINS' ? a.amount : 0)}::numeric,
        ${new Prisma.Decimal(a.rewardType === 'BONUS' ? a.amount : 0)}::numeric)`))}) v(user_id,coins,bonus)
      WHERE w.user_id=v.user_id`);
    const transactions: Prisma.TransactionCreateManyInput[] = [];
    const achievements: Prisma.GameAchievementCreateManyInput[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    const operations: Prisma.WalletOperationCreateManyInput[] = [];
    let coinsPaid = new Prisma.Decimal(0), bonusPaid = new Prisma.Decimal(0);
    for (const award of fresh) {
      const transactionId = randomUUID(), achievementId = randomUUID(), notificationId = randomUUID(), txnRef = randomUUID();
      const metadata = {taskId: id, kind: task.kind, scopeId: task.scopeId, mode: task.mode,
        year: task.year, week: task.week, rank: award.rank, score: award.score};
      transactions.push({id: transactionId, txnRef, userId: award.playerId, recipientId: award.playerId,
        walletId: walletIds.get(award.playerId), amount: award.amount, currency: 'COINS', source: award.rewardType,
        category: task.kind === 'WEEK' ? 'GAME_WEEKLY_REWARD' : 'GAME_YEARLY_REWARD',
        gateway: 'WALLET', type: 'CREDIT', status: 'COMPLETED', achievementId, description: award.description, metadata});
      achievements.push({id: achievementId, txnId: transactionId, playerId: award.playerId,
        catId: task.kind === 'WEEK' || task.kind === 'YEAR' ? task.scopeId : null,
        mode: task.mode, milestoneId: award.milestoneId, amount: award.amount, reason: award.reason,
        rewardType: award.rewardType, thumbnail: award.thumbnail, description: award.description, metadata: {...metadata, txnRef}});
      notifications.push({id: notificationId, sourceKey: `game-milestone:${id}:${award.playerId}`, recipientId: award.playerId,
        title: 'Game achievement reward', message: `${award.description} Your wallet has been credited.`,
        type: 'NONE', action: 'NONE', meta: {...metadata, kind: 'game-milestone-reward', rewardKind: task.kind,
          amount: award.amount, rewardType: award.rewardType, transactionId}});
      operations.push({id: award.receiptId, scope: award.legacyScope, fingerprint: award.fingerprint,
        result: {achievement: {id: achievementId, amount: award.amount}, transactionId, notificationId}});
      if (award.rewardType === 'COINS') coinsPaid = coinsPaid.add(award.amount);
      else bonusPaid = bonusPaid.add(award.amount);
    }
    if (fresh.length) {
      await tx.transaction.createMany({data: transactions});
      await tx.gameAchievement.createMany({data: achievements});
      await tx.notification.createMany({data: notifications});
      await tx.walletOperation.createMany({data: operations});
    }
    const notificationIds = notifications.map(n => n.id!);
    await tx.gameMilestoneRewardTask.update({where: {id}, data: {status: 'COMPLETED', completedAt: new Date(),
      processed: awards.length, previouslyPaid: receipts.length, coinsPaid, bonusPaid, notificationIds,
      cachePending: awards.length > 0, lastError: null}});
    return {notificationIds};
  });
}

export async function processMilestoneRewardTask(id: string) {
  let task = await prisma.gameMilestoneRewardTask.findUniqueOrThrow({where: {id}});
  try {
    if (task.status !== 'COMPLETED') {
      if (task.plan === null) {
        const plan = await prepareMilestonePlan(task);
        // A competing worker may freeze a plan first. Never replace that plan.
        await prisma.gameMilestoneRewardTask.updateMany({where: {id, plan: {equals: Prisma.DbNull}},
          data: {plan: plan as unknown as Prisma.InputJsonValue, startedAt: new Date()}});
      }
      await settle(id);
      task = await prisma.gameMilestoneRewardTask.findUniqueOrThrow({where: {id}});
    }
    // Notifications persist in the same transaction as money. The existing push
    // outbox watchdog recovers a queue outage; SSE reads these durable inbox rows.
    await enqueueNotificationDeliveries(task.notificationIds);
    if (task.cachePending) {
      const plan = task.plan as unknown as MilestonePlan;
      const keys = plan.awards.map(a => `user:${a.playerId}:wallet`);
      if (keys.length) await redis.del(keys);
      await prisma.gameMilestoneRewardTask.update({where: {id}, data: {cachePending: false, lastError: null}});
    }
  } catch (error) {
    logger.error({event: 'milestone_reward_failed', taskId: id, error}, 'Milestone reward processing failed');
    const lastError = error instanceof Error ? error.message.slice(0, 1000) : 'Milestone reward failed';
    await prisma.gameMilestoneRewardTask.updateMany({where: {id, status: {not: 'COMPLETED'}},
      data: {status: 'FAILED', failures: {increment: 1}, lastError, nextAttemptAt: new Date(Date.now() + 60000)}});
    await prisma.gameMilestoneRewardTask.updateMany({where: {id, status: 'COMPLETED', cachePending: true},
      data: {failures: {increment: 1}, lastError, nextAttemptAt: new Date(Date.now() + 60000)}});
    throw error;
  }
}
