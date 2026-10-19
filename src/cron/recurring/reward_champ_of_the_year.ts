import {dispatchMilestoneRewards} from '@/services/walletLedger/milestoneRewardQueue';

export async function run() {
  await dispatchMilestoneRewards('CHAMP');
}
