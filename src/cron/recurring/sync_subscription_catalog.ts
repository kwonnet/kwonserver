import { syncSubscriptionCatalog } from '@/services/v1/subscriptions';
export async function run() {
  await syncSubscriptionCatalog();
}
