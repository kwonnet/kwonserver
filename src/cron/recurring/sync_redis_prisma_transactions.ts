import { createHash } from 'crypto';
import prisma from '@/db';
import redisClient from '@/redis';
import { Prisma } from '@prisma/client';
import { cents } from '@/services/walletLedger';

// Legacy ledger import only. Balances require separate reconciliation before cutover.
export async function syncRedisTxnsToPrisma(playerId: string) {
  const key = `user:${playerId}:transactions`;
  for (;;) {
    const records = await redisClient.zRangeWithScores(key, 0, '+inf', { BY: 'SCORE', LIMIT: { offset: 0, count: 200 } });
    if (!records.length) return;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      for (const record of records) {
        const item = JSON.parse(record.value);
        if (item.userId !== playerId || !item.txnRef || !Number.isFinite(new Date(item.createdAt).getTime())) throw new Error('Invalid legacy ledger record; retained for reconciliation');
        cents(item.amount, true);
        // Handles rows imported by the old worker as well as retries after Redis failures.
        const previous = await tx.transaction.findFirst({ where: { userId: playerId, txnRef: item.txnRef, type: item.type } });
        if (previous) {
          if (cents(previous.amount, true) !== cents(item.amount, true) || previous.source !== item.source || previous.currency !== item.currency || previous.category !== item.category || (item.walletId && previous.walletId !== item.walletId)) throw new Error('Conflicting legacy transaction; retained for reconciliation');
          continue;
        }
        const id = createHash('sha256').update(`${playerId}:${item.txnRef}:${item.type}`).digest('hex');
        await tx.transaction.create({ data: { ...item, id, createdAt: new Date(item.createdAt), metadata: item.metadata as Prisma.JsonObject } });
      }
    }, { timeout: 30000 });
    // Exact members, not score ranges: equal timestamps must never drop unprocessed rows.
    await redisClient.zRem(key, records.map(record => record.value));
  }
}
export async function run() {
  for await (const keys of redisClient.scanIterator({ MATCH: 'user:*:transactions', COUNT: 100 })) {
    for (const key of keys) await syncRedisTxnsToPrisma(key.split(':')[1]);
  }
}
