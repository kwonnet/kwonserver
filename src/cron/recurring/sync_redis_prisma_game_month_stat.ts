import {archiveClosedGameMonth} from '@/services/v1/games/periodRecovery';
import {getRewardDateInfo} from '@/utils';
export async function run() {
  const period=getRewardDateInfo();
  await archiveClosedGameMonth(period.monthlyRewardYear,period.monthlyRewardMonth);
}
