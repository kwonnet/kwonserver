import { beforeEach, expect, it, vi } from 'vitest';
import { recurringJobs, registerRecurringJobs, processRecurringJob } from '@/cron/recurring/registry';
const run = vi.hoisted(() => vi.fn());
vi.mock('@/cron/recurring/sync_redis_prisma_wallet', () => ({ run }));
beforeEach(() => { run.mockReset(); });
it('registers the sixteen active schedules with stable IDs and explicit timezone', async () => {
  const queue = { upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn() };
  await registerRecurringJobs(queue, {});
  expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(16);
  for (const [id, repeat, template] of queue.upsertJobScheduler.mock.calls) {
    expect(template.name).toBe(id); expect(repeat.tz).toBe('UTC'); expect(template.opts.attempts).toBe(1);
  }
  expect(queue.removeJobScheduler).toHaveBeenCalledWith('sync_users_interactions_clickhouse');
  expect(queue.removeJobScheduler).toHaveBeenCalledWith('sync_redis_prisma_player_game_month_stat');
});
it('schedules yearly rewards only in January', async () => {
  const annual = recurringJobs.filter(job => job.name.includes('of_the_year'));
  expect(annual).toHaveLength(3); expect(annual.every(job => job.pattern === '0 12 2 1 *')).toBe(true);
});
it('honors explicit ClickHouse enablement and timezone', async () => {
  const queue = { upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn() };
  await registerRecurringJobs(queue, { ENABLE_CLICKHOUSE_SYNC: 'true', JOBS_TIMEZONE: 'Africa/Lagos' });
  expect(queue.upsertJobScheduler).toHaveBeenCalledWith('sync_users_interactions_clickhouse', { pattern: '*/2 * * * *', tz: 'Africa/Lagos' }, expect.any(Object));
});
it('propagates scheduler failures instead of claiming startup succeeded', async () => {
  await expect(registerRecurringJobs({ upsertJobScheduler: vi.fn().mockRejectedValue(new Error('redis unavailable')), removeJobScheduler: vi.fn() }, {})).rejects.toThrow('redis unavailable');
});
it('dispatches the handler and propagates its failure to BullMQ', async () => {
  await processRecurringJob({ name: 'sync_redis_prisma_wallet' }); expect(run).toHaveBeenCalledOnce();
  run.mockRejectedValue(new Error('database failed'));
  await expect(processRecurringJob({ name: 'sync_redis_prisma_wallet' })).rejects.toThrow('database failed');
});
it('rejects unknown jobs', async () => { await expect(processRecurringJob({ name: 'unknown' })).rejects.toThrow('Unknown background job'); });
it('does not load the disabled ClickHouse handler', async () => {
  vi.stubEnv('ENABLE_CLICKHOUSE_SYNC', 'false');
  await expect(processRecurringJob({ name: 'sync_users_interactions_clickhouse' })).rejects.toThrow('disabled');
  vi.unstubAllEnvs();
});
