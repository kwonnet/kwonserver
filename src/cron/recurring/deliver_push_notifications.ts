import { deliverPendingPushNotifications, fanoutPublishedPostNotifications } from '@/services/v1/notifications';
export async function run() { await fanoutPublishedPostNotifications(); await deliverPendingPushNotifications(); }
