import { reconcileSubscriptionPayments } from '@/services/v1/subscriptions';
export async function run() {
  await reconcileSubscriptionPayments();
}
