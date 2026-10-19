import {Worker, Job} from 'bullmq';
import IORedis from 'ioredis';
import logger from '@/logger';
import {logWorkerLifecycle} from '@/logger/events';
import {milestoneRewardQueue} from '@/cron/jobs/queue';
import {milestoneRewardConfig, recoverMilestoneRewards} from '@/services/walletLedger/milestoneRewardQueue';
import {processMilestoneRewardTask} from '@/services/walletLedger/milestoneRewardJobs';

export async function processMilestoneRewardJob(job: Pick<Job, 'name' | 'data'>) {
  if (job.name !== 'milestone-reward' || typeof job.data?.taskId !== 'string' || !/^[a-f0-9]{64}$/.test(job.data.taskId)) {
    throw new Error('Invalid milestone reward job');
  }
  await processMilestoneRewardTask(job.data.taskId);
}
export async function startMilestoneRewardWorkers() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for milestone reward workers');
  const config = milestoneRewardConfig();
  const connection = new IORedis(process.env.REDIS_URL, {maxRetriesPerRequest: null,
    connectionName: 'kwonserver:worker:milestone-rewards'});
  connection.on('error', error => logger.error({event: 'milestone_reward_connection_error', error}, 'Reward Redis connection unavailable'));
  let worker: Worker | undefined, timer: NodeJS.Timeout | undefined, recovery: Promise<void> | undefined, lifetime: Promise<void> | undefined;
  let closing = false;
  const recover = async () => {
    if (closing || recovery) return;
    const work = async () => {
      try { await recoverMilestoneRewards(); }
      catch (error) { logger.error({event: 'milestone_reward_recovery_failed', error}, 'Milestone reward recovery failed'); }
    };
    recovery = work();
    try { await recovery; } finally { recovery = undefined; }
  };
  const close = async () => {
    closing = true; if (timer) clearInterval(timer); await recovery;
    await worker?.close(); await lifetime; await connection.quit();
  };
  try {
    await milestoneRewardQueue.setGlobalConcurrency(config.globalConcurrency);
    worker = new Worker(milestoneRewardQueue.name, processMilestoneRewardJob, {
      connection, autorun: false, concurrency: config.localConcurrency, maxStalledCount: 3,
    });
    logWorkerLifecycle(worker);
    const supervise = async () => {
      try { await worker!.run(); }
      catch (error) { logger.error({event: 'milestone_reward_worker_stopped', error}, 'Milestone reward worker stopped'); }
    };
    lifetime = supervise(); await recover();
    timer = setInterval(async () => { await recover(); }, 60000);
    return {worker, close};
  } catch (error) { await close(); throw error; }
}
