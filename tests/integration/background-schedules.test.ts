import { expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { recurringJobs, registerRecurringJobs } from '@/cron/recurring/registry';
it('upserts recurring schedules without duplicating them on replica startup', async () => {
  const queue = new Queue('integration-background-schedules', { connection: { host: '127.0.0.1', port: 16379 } });
  const defaultJobs = recurringJobs.filter(job => job.pattern && !('optIn' in job));
  const allScheduledJobs = recurringJobs.filter(job => job.pattern);
  try {
    await queue.setGlobalConcurrency(1);
    await registerRecurringJobs(queue, {}); await registerRecurringJobs(queue, {});
    expect(await queue.getJobSchedulersCount()).toBe(defaultJobs.length);
    const schedules = await queue.getJobSchedulers();
    expect(schedules.map(schedule => schedule.key).sort()).toEqual(defaultJobs.map(job => job.name).sort());
    expect(new Set(schedules.map(schedule => schedule.key)).size).toBe(defaultJobs.length);
    expect(schedules.map(schedule => schedule.key)).toContain('reconcile_coin_withdrawals');
    expect(schedules.map(schedule => schedule.key)).toContain('infer_pending_post_topics');
    expect((await queue.getJobSchedulers()).map(schedule => schedule.key)).toContain('reconcile_purchase_refunds');
    await registerRecurringJobs(queue, { ENABLE_CLICKHOUSE_SYNC: 'true' });
    await registerRecurringJobs(queue, { ENABLE_CLICKHOUSE_SYNC: 'true' });
    expect(await queue.getJobSchedulersCount()).toBe(allScheduledJobs.length);
    await registerRecurringJobs(queue, {}); expect(await queue.getJobSchedulersCount()).toBe(defaultJobs.length);
    expect((await queue.getJobSchedulers()).map(schedule => schedule.key)).not.toContain('sync_users_interactions_clickhouse');
  } finally { await queue.obliterate({ force: true }); await queue.close(); }
});
