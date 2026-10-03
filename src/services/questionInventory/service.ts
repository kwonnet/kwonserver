import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { inventoryConfig, InventoryConfig } from './config';
import { validateBatch } from './validation';

export class InventoryEmptyError extends Error {
  readonly code = 'QUIZ_INVENTORY_EMPTY';
  constructor(public categoryId: string) { super(`Question inventory unavailable for category ${categoryId}`); }
}
export class InventoryExhaustedError extends InventoryEmptyError {
  constructor(categoryId: string) { super(categoryId); this.name = 'InventoryExhaustedError'; }
}
export const generationJobId = (categoryId: string) => `quiz-generation-${createHash('sha256').update(categoryId).digest('hex')}`;
export const poolKey = (categoryId: string) => `quiz:category:${categoryId}:pool`;
export type GenerationJob = { categoryId: string; target: number };
type Log = { warn: (data: object, message: string) => void };

export class QuestionInventoryService {
  constructor(public db: PrismaClient, public redis: Redis, public queue: Queue<GenerationJob>,
    public config: InventoryConfig = inventoryConfig(), private log: Log = console) {}

  async category(categoryId: string) {
    const category = await this.db.gameCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error('Unknown quiz category');
    return category;
  }
  count(categoryId: string) { return this.db.quizQuestion.count({ where: { categoryId } }); }

  // Extension point: supply is diversity, not a counter decremented by deliveries.
  calculateTargetInventory(current: number, roomSeenCount = 0) {
    return Math.min(this.config.maxTarget, Math.max(
      current === 0 ? this.config.initialTarget : this.config.defaultTarget,
      roomSeenCount + this.config.low + 1));
  }

  async recordDemand(categoryId: string, roomId: string, seenCount: number) {
    const prefix = `quiz:category:${categoryId}:demand`;
    await this.redis.eval(`
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1] - ARGV[2])
      redis.call('EXPIRE', KEYS[1], ARGV[2])
      local peak = tonumber(redis.call('GET', KEYS[2]) or '0')
      if tonumber(ARGV[4]) >= peak then redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[2]) end
      local requests = redis.call('INCR', KEYS[3])
      if requests == 1 then redis.call('EXPIRE', KEYS[3], ARGV[2]) end
      return 1`, 3, prefix + ':rooms', prefix + ':peak', prefix + ':requests',
      Math.floor(Date.now() / 1000), this.config.demandWindowSeconds, roomId, seenCount);
  }

  async demand(categoryId: string) {
    const prefix = `quiz:category:${categoryId}:demand`;
    const [activeRooms, peak, requests] = await Promise.all([
      this.redis.zcount(prefix + ':rooms', Math.floor(Date.now() / 1000) - this.config.demandWindowSeconds, '+inf'),
      this.redis.get(prefix + ':peak'), this.redis.get(prefix + ':requests'),
    ]);
    return { activeRooms, peakRoomConsumption: Number(peak || 0), requests: Number(requests || 0) };
  }

  async inspect(categoryId: string, roomSeenCount = 0) {
    const current = await this.count(categoryId);
    let peak = roomSeenCount;
    try { peak = Math.max(peak, (await this.demand(categoryId)).peakRoomConsumption); }
    catch { this.log.warn({ categoryId }, 'Quiz demand metrics unavailable'); }
    const target = this.calculateTargetInventory(current, peak);
    const state = current === 0 ? 'EMPTY' : current <= this.config.critical ? 'CRITICAL' : current <= this.config.low ? 'LOW' : 'HEALTHY';
    const job = await this.queue.getJob(generationJobId(categoryId));
    const generationStatus = job ? await job.getState() : 'none';
    return { categoryId, current, target, needed: Math.max(0, target - current), state, generationStatus,
      failedReason: job?.failedReason ? 'Generation failed; inspect worker logs' : undefined };
  }

  async ensureInventory(categoryId: string, roomSeenCount = 0) {
    await this.category(categoryId);
    const current = await this.count(categoryId);
    let peak = roomSeenCount;
    try { peak = Math.max(peak, (await this.demand(categoryId)).peakRoomConsumption); }
    catch { this.log.warn({ categoryId }, 'Quiz demand metrics unavailable'); }
    const target = this.calculateTargetInventory(current, peak);
    const eligible = Math.max(0, current - peak);
    if (current >= target || (current > this.config.low && eligible > this.config.low)) return;
    const id = generationJobId(categoryId);
    const existing = await this.queue.getJob(id);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'failed') {
        if (['waiting', 'prioritized', 'delayed'].includes(state) && eligible <= this.config.critical) {
          await existing.changePriority({ priority: current === 0 ? 1 : 2 });
        }
        return existing;
      }
      if (Date.now() - (existing.finishedOn ?? Date.now()) < this.config.cooldownSeconds * 1000) return existing;
      // Concurrent removers may race; BullMQ's job ID still makes add atomic.
      try { await existing.remove(); } catch { return existing; }
    }
    return this.queue.add('replenish', { categoryId, target }, {
      jobId: id, priority: current === 0 ? 1 : eligible <= this.config.critical ? 2 : 5,
      attempts: this.config.attempts, backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true, removeOnFail: { age: this.config.cooldownSeconds * 2, count: 1000 },
    });
  }

  async rebuildCategoryInventory(categoryId: string) {
    await this.category(categoryId);
    // Additive rebuild avoids overwriting IDs inserted by a concurrent generation worker.
    // Redis contains only IDs; every candidate is verified against PostgreSQL.
    let cursor: string | undefined;
    for (;;) {
      const rows: { id: string }[] = await this.db.quizQuestion.findMany({ where: { categoryId },
        select: { id: true }, orderBy: { id: 'asc' }, take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) break;
      await this.redis.sadd(poolKey(categoryId), ...rows.map(q => q.id));
      await this.redis.expire(poolKey(categoryId), this.config.cacheSeconds);
      cursor = rows[rows.length - 1].id;
    }
    await this.redis.set(poolKey(categoryId) + ':ready', '1', 'EX', this.config.cacheSeconds);
  }

  async getCandidates(categoryId: string, excludedIds: string[] = []) {
    await this.category(categoryId);
    // Replenishment failure must not take existing PostgreSQL inventory offline.
    try { await this.ensureInventory(categoryId, excludedIds.length); }
    catch { this.log.warn({ categoryId }, 'Quiz replenishment unavailable; using stored questions'); }
    try {
      if (!await this.redis.exists(poolKey(categoryId)) || !await this.redis.exists(poolKey(categoryId) + ':ready')) await this.rebuildCategoryInventory(categoryId);
      const ids = await this.redis.srandmember(poolKey(categoryId), 40);
      const allowed = ids.filter(id => !excludedIds.includes(id));
      if (allowed.length) {
        const rows = await this.db.quizQuestion.findMany({ where: { categoryId, id: { in: allowed } } });
        if (rows.length) return rows;
      }
    } catch { this.log.warn({ categoryId }, 'Quiz cache unavailable; reading PostgreSQL'); }
    const where = { categoryId, id: { notIn: excludedIds } };
    const eligible = await this.db.quizQuestion.count({ where });
    if (!eligible) {
      if (await this.count(categoryId)) throw new InventoryExhaustedError(categoryId);
      throw new InventoryEmptyError(categoryId);
    }
    return this.db.quizQuestion.findMany({ where, orderBy: { id: 'asc' },
      skip: Math.floor(Math.random() * eligible), take: Math.min(40, eligible) });
  }

  async insertBatch(categoryId: string, batch: unknown[]) {
    await this.category(categoryId);
    const { valid, invalidCount, duplicateCount } = validateBatch(batch);
    // ON CONFLICT DO NOTHING: PostgreSQL, not the cache, is the final dedup authority.
    const inserted = valid.length ? await this.db.quizQuestion.createManyAndReturn({
      data: valid.map(q => ({ ...q, categoryId })), skipDuplicates: true, select: { id: true },
    }) : [];
    if (inserted.length) {
      try {
        await this.redis.sadd(poolKey(categoryId), ...inserted.map(q => q.id));
        await this.redis.expire(poolKey(categoryId), this.config.cacheSeconds);
      } catch { this.log.warn({ categoryId }, 'Quiz questions saved; cache will rebuild on demand'); }
    }
    return { generatedCount: batch.length, invalidCount,
      duplicateCount: duplicateCount + valid.length - inserted.length, insertedCount: inserted.length };
  }
}
