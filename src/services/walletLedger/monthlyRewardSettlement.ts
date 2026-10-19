import {createHash, randomUUID} from 'node:crypto';
import {GameMode, GameMilestone, Prisma} from '@prisma/client';
import {walletOperation, cents, WalletError} from '@/services/walletLedger';
import {formatNumberWithCommas} from '@/utils/helpers';
import {getStringMonth} from '@/utils';

// Keep boundaries stable across deployments: committed batches are durable checkpoints.
export const MONTHLY_REWARD_BATCH_SIZE = 500;
type Player = {id: string; rank: number; score: number; rewardAmount: number};
type Input = {catId: string; categoryName: string; mode: GameMode; auditId: string;
  dateInfo: {year: number; month: number}; milestones: GameMilestone[]; players: Player[]};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const policy = 'monthly-90-v2';
export const monthlyRewardCursorId = (auditId: string) => hash(`monthly-reward-cursor:${auditId}`);

/** Bulk credits, per-user receipts and one audit increment commit or roll back together. */
export async function settleMonthlyRewardBatch(input: Input) {
  const {catId, categoryName, mode, auditId, dateInfo, milestones, players} = input;
  if (!players.length || players.length > MONTHLY_REWARD_BATCH_SIZE || new Set(players.map(p => p.id)).size !== players.length) {
    throw new Error('Invalid monthly reward batch');
  }
  for (const [index, player] of players.entries()) {
    cents(player.rewardAmount, true);
    if (!Number.isInteger(player.rank) || player.rank < 1 || !Number.isFinite(player.score) ||
      (index > 0 && player.rank !== players[index - 1].rank + 1)) throw new Error('Invalid monthly reward ranks');
  }
  const period = `${catId}:${mode}:${dateInfo.year}:${dateInfo.month}`;
  const awards = players.map(player => ({...player,
    idempotencyId: hash(`monthly-reward:${period}:${player.id}:COINS`),
    fingerprint: hash(JSON.stringify({playerId: player.id, rewardAmount: player.rewardAmount, policy})),
  }));
  return walletOperation('monthly-reward-batch', `${auditId}:${players[0].rank}:${players.at(-1)!.rank}`,
    {policy, awards: awards.map(p => [p.idempotencyId, p.fingerprint])}, [], async tx => {
      // Match the old single-award operation locks as well as its receipt format.
      // Sorted acquisition avoids deadlocks between overlapping batches.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(id, 0))::text
        FROM (SELECT unnest(${awards.map(p => p.idempotencyId)}::text[]) AS id ORDER BY id) operations`);
      const cursor = await tx.walletOperation.findUnique({where: {id: monthlyRewardCursorId(auditId)}});
      const next = (cursor?.result as {nextRank?: number})?.nextRank ?? 1;
      if (players[0].rank > next) throw new Error('Monthly reward batches must settle in rank order');
      // Honor per-user receipts from the previous implementation and partially paid months.
      const receipts = await tx.walletOperation.findMany({where: {id: {in: awards.map(p => p.idempotencyId)}}});
      const initialIds = new Set(receipts.map(r => r.id));
      const pending = awards.filter(p => !initialIds.has(p.idempotencyId));
      if (pending.length) {
        // One ordered locking query; game debits use these same wallet row locks.
        const wallets = await tx.$queryRaw<{id: string; user_id: string}[]>(Prisma.sql`
          SELECT id, user_id FROM "Wallet" WHERE user_id IN (${Prisma.join(pending.map(p => p.id))})
          ORDER BY user_id FOR UPDATE`);
        if (wallets.length !== pending.length) throw new WalletError('Wallet not found', 404);
      }
      const prior = new Map(receipts.map(r => [r.id, r]));
      for (const player of awards) {
        if (prior.has(player.idempotencyId) && prior.get(player.idempotencyId)!.fingerprint !== player.fingerprint) {
          throw new WalletError('Idempotency key already used for a different request', 409);
        }
      }
      const fresh = awards.filter(p => !prior.has(p.idempotencyId));
      const transactions: Prisma.TransactionCreateManyInput[] = [];
      const notifications: Prisma.NotificationCreateManyInput[] = [];
      const achievements: Prisma.GameAchievementCreateManyInput[] = [];
      const operationReceipts: Prisma.WalletOperationCreateManyInput[] = [];
      const notificationIds = receipts.flatMap(r => {
        const id = (r.result as {notificationId?: string})?.notificationId;
        return id ? [id] : [];
      });
      let totalMinor = 0, score = 0;
      for (const player of fresh) {
        let transactionId: string | null = null, notificationId: string | null = null;
        totalMinor += cents(player.rewardAmount, true); score += player.score;
        if (player.rewardAmount > 0) {
          transactionId = randomUUID(); notificationId = randomUUID();
          const txnRef = randomUUID();
          const milestone = milestones.find(m => m.milestone === player.rank);
          const description = milestone
            ? `Rewarded ${player.rewardAmount} COINS for achieving ${milestone.reason.replace(/_/g, ' ').toLowerCase()} under ${categoryName} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`
            : `Rewarded ${player.rewardAmount} COINS for ranking ${formatNumberWithCommas(player.rank)}th under ${categoryName} category in ${getStringMonth(dateInfo.month)} ${dateInfo.year}.`;
          const achievementId = milestone ? randomUUID() : null;
          if (milestone) achievements.push({id: achievementId!, reason: milestone.reason, playerId: player.id,
            catId, mode, amount: player.rewardAmount, rewardType: 'COINS', milestoneId: milestone.id,
            description, thumbnail: milestone.thumbnail, metadata: {txnRef, ...dateInfo}, txnId: transactionId});
          transactions.push({id: transactionId, userId: player.id, recipientId: player.id, amount: player.rewardAmount,
            gateway: 'WALLET', source: 'COINS', type: 'CREDIT', status: 'COMPLETED', currency: 'COINS',
            category: 'GAME_MONTHLY_REWARD', description, txnRef, achievementId,
            metadata: {...dateInfo, catId, mode, policy, auditId, rank: player.rank, score: player.score}});
          notifications.push({id: notificationId,
            sourceKey: `monthly-game-reward:${period}:${player.id}`, recipientId: player.id,
            type: 'NONE', action: 'NONE', title: 'Monthly game reward',
            message: `You earned ${formatNumberWithCommas(player.rewardAmount)} coins for ranking #${formatNumberWithCommas(player.rank)} in ${categoryName} (${mode === 'SINGLE' ? 'Single player' : 'Multiplayer'}) for ${getStringMonth(dateInfo.month)} ${dateInfo.year}. Your wallet has been credited.`,
            meta: {kind: 'monthly-game-reward', catId, categoryName, mode, ...dateInfo, rank: player.rank,
              amount: player.rewardAmount, currency: 'COINS', transactionId, auditId}});
          notificationIds.push(notificationId);
        }
        operationReceipts.push({id: player.idempotencyId, scope: 'monthly-reward', fingerprint: player.fingerprint,
          result: {auditId, transactionId, notificationId}});
      }
      const paid = fresh.filter(p => p.rewardAmount > 0);
      if (paid.length) {
        const wallets = await tx.$queryRaw<{id: string; user_id: string}[]>(Prisma.sql`
          UPDATE "Wallet" AS w SET coins = w.coins + v.amount, "updatedAt" = NOW()
          FROM (VALUES ${Prisma.join(paid.map(p => Prisma.sql`(${p.id}::text, ${new Prisma.Decimal(p.rewardAmount)}::numeric)`))}) AS v(user_id, amount)
          WHERE w.user_id = v.user_id RETURNING w.id, w.user_id`);
        const walletIds = new Map(wallets.map(w => [w.user_id, w.id]));
        for (const transaction of transactions) transaction.walletId = walletIds.get(transaction.userId!)!;
        await tx.transaction.createMany({data: transactions});
        if (achievements.length) await tx.gameAchievement.createMany({data: achievements});
        await tx.notification.createMany({data: notifications});
      }
      if (fresh.length) {
        await tx.walletOperation.createMany({data: operationReceipts});
        const amount = new Prisma.Decimal(totalMinor).div(100);
        await tx.gameMonthRewardStat.update({where: {id: auditId}, data: {
          processedParticipants: {increment: fresh.length}, coinsRewardParticipants: {increment: paid.length},
          coinsShareAmount: {increment: amount}, pendingAmount: {decrement: amount},
          unallocatedAmount: {decrement: amount}, balanceAfterPayout: {decrement: amount},
          rewardParticipantsScore: {increment: score}, coinsParticipantsScore: {increment: score},
        }});
      }
      // Each runner visits contiguous batches in rank order. Advance only after the
      // whole batch is paid (including old receipts), in the same transaction.
      const cursorId = monthlyRewardCursorId(auditId);
      const nextRank = players.at(-1)!.rank + 1;
      await tx.$executeRaw`INSERT INTO "WalletOperation" (id, scope, fingerprint, result, "createdAt")
        VALUES (${cursorId}, 'monthly-reward-cursor', ${policy}, ${JSON.stringify({nextRank})}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result
        WHERE ("WalletOperation".result->>'nextRank')::int < ${nextRank}`;
      return {processed: fresh.length, notificationIds};
    });
}
