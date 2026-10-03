import { expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { registerRecurringJobs } from '@/cron/recurring/registry';
it('upserts recurring schedules without duplicating them on replica startup', async () => {
  const queue = new Queue('integration-background-schedules', { connection: { host: '127.0.0.1', port: 16379 } });
  try {
    await queue.setGlobalConcurrency(1);
    await registerRecurringJobs(queue, {}); await registerRecurringJobs(queue, {});
    expect(await queue.getJobSchedulersCount()).toBe(11);
    await registerRecurringJobs(queue, { ENABLE_CLICKHOUSE_SYNC: 'true' });
    expect(await queue.getJobSchedulersCount()).toBe(12);
    await registerRecurringJobs(queue, {}); expect(await queue.getJobSchedulersCount()).toBe(11);
  } finally { await queue.obliterate({ force: true }); await queue.close(); }
});
