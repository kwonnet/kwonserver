import {Worker, Job} from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import {logWorkerLifecycle} from '@/logger/events';
import {monthlyRewardQueue, monthlyRewardNotificationQueue} from '@/cron/jobs/queue';
import {monthlyRewardConfig, recoverMonthlyRewards} from '@/services/walletLedger/monthlyRewardQueue';
import {processMonthlyRewardStep} from '@/services/walletLedger/monthlyRewardJobs';
import {deliverMonthlyRewardBatch} from '@/services/walletLedger/monthlyRewardNotifications';

export async function processMonthlyRewardJob(job: Pick<Job, 'name' | 'data'>) {
  if (job.name !== 'monthly-reward-step' || typeof job.data?.settlementId !== 'string' || !/^[a-f0-9]{64}$/.test(job.data.settlementId)) {
    throw new Error('Invalid monthly reward job');
  }
  await processMonthlyRewardStep(job.data.settlementId);
}
export async function processMonthlyRewardNotificationJob(job: Pick<Job, 'name' | 'data'>) {
  if (job.name !== 'monthly-reward-notifications' || typeof job.data?.batchId !== 'string' || !/^[a-f0-9]{64}$/.test(job.data.batchId)) {
    throw new Error('Invalid monthly reward notification job');
  }
  await deliverMonthlyRewardBatch(job.data.batchId);
}

/** Own queues, bounded concurrency across replicas, independent of the cron consumer. */
export async function startMonthlyRewardWorkers() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for monthly reward workers');
  const config = monthlyRewardConfig();
  const connection = new IORedis(process.env.REDIS_URL, {maxRetriesPerRequest: null,
    connectionName: 'kwonserver:worker:monthly-rewards'});
  connection.on('error', error => logger.error({event: 'monthly_reward_connection_error', error}, 'Monthly reward Redis connection unavailable'));
  const workers: Worker[] = [];
  const runs: Promise<void>[] = [];
  let timer: NodeJS.Timeout | undefined;
  let recovery: Promise<void> | undefined;
  let closing = false;
  const recover = async () => {
    if (recovery || closing) return;
    const work = async () => {
      try { await recoverMonthlyRewards(); }
      catch (error) { logger.error({event: 'monthly_reward_recovery_failed', error}, 'Monthly reward recovery failed'); }
    };
    recovery = work();
    try { await recovery; } finally { recovery = undefined; }
  };
  const supervise = async (worker: Worker) => {
    try { await worker.run(); }
    catch (error) { logger.error({event: 'monthly_reward_worker_stopped', queue: worker.name, error}, 'Monthly reward worker stopped'); }
  };
  const close = async () => {
    closing = true; if (timer) clearInterval(timer); await recovery;
    await Promise.all(workers.map(worker => worker.close()));
    await Promise.all(runs);
    await connection.quit();
  };
  try {
    await monthlyRewardQueue.setGlobalConcurrency(config.globalConcurrency);
    await monthlyRewardNotificationQueue.setGlobalConcurrency(config.notificationConcurrency);
    workers.push(new Worker(monthlyRewardQueue.name, processMonthlyRewardJob, {
      connection, autorun: false, concurrency: config.localConcurrency, maxStalledCount: 3,
    }));
    workers.push(new Worker(monthlyRewardNotificationQueue.name, processMonthlyRewardNotificationJob, {
      connection, autorun: false, concurrency: config.notificationConcurrency, maxStalledCount: 3,
    }));
    for (const worker of workers) { logWorkerLifecycle(worker); runs.push(supervise(worker)); }
    await recover();
    timer = setInterval(async () => { await recover(); }, 60000);
    return {workers, close};
  } catch (error) { await close(); throw error; }
}
