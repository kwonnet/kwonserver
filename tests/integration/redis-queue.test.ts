import { expect, it } from 'vitest';
import { Queue } from 'bullmq';
it('persists delayed jobs, removes cancelled jobs and deduplicates job IDs in Redis', async () => {
  const queue = new Queue('integration-subscriptions', { connection: { host: '127.0.0.1', port: 16379 } });
  try {
    await queue.add('renew', { subscriptionId: 's' }, { jobId: 'sub-1', delay: 60000 });
    await queue.add('renew', { subscriptionId: 's' }, { jobId: 'sub-1', delay: 60000 });
    expect(await queue.getDelayedCount()).toBe(1);
    expect((await queue.getJob('sub-1'))?.data).toEqual({ subscriptionId: 's' });
    await queue.remove('sub-1'); expect(await queue.getJob('sub-1')).toBeUndefined();
  } finally { await queue.obliterate({ force: true }); await queue.close(); }
});
