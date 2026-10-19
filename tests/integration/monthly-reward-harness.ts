import {PromisePool} from '@supercharge/promise-pool';
import prisma from '@/db';
import {run as dispatch} from '@/cron/recurring/reward_top_players_every_month';
import {processMonthlyRewardStep} from '@/services/walletLedger/monthlyRewardJobs';

// Financial assertions drive steps directly; queue/worker integration is tested separately.
export async function settleMonthlyRewards() {
  await dispatch();
  for (;;) {
    const tasks = await prisma.monthlyRewardSettlement.findMany({where: {status: {not: 'COMPLETED'}}});
    if (!tasks.length) return;
    const {errors} = await PromisePool.for(tasks).withConcurrency(4).process(async task => { await processMonthlyRewardStep(task.id); });
    if (errors.length) throw errors[0];
  }
}
