import {recoverMilestoneRewards} from '@/services/walletLedger/milestoneRewardQueue';
import {recoverMonthlyRewards} from '@/services/walletLedger/monthlyRewardQueue';
import {getMonthlyRewardProgress} from '@/services/walletLedger/monthlyRewardProgress';
import logger from '@/logger';
export async function run() {
  await recoverMonthlyRewards();
  await recoverMilestoneRewards();
  for (const period of await getMonthlyRewardProgress()) {
    logger.info({event: 'monthly_reward_progress', ...period}, 'Monthly reward settlement progress');
  }
}
