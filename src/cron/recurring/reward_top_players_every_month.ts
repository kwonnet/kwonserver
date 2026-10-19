import {dispatchMonthlyRewards} from '@/services/walletLedger/monthlyRewardQueue';

// Dispatch only. Dedicated workers perform short, resumable payment steps.
export async function run() { await dispatchMonthlyRewards(); }
