import { deliverPendingPushNotifications } from '@/services/v1/notifications';
export async function run() { await deliverPendingPushNotifications(); }
