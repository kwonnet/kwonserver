import {beforeEach, expect, it, vi} from 'vitest';
const deps = vi.hoisted(() => ({subscriptions: {upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn()}, notifications: {findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn()}, configure: vi.fn(), send: vi.fn()}));
vi.mock('@/db', () => ({default: {pushNotification: deps.subscriptions, notification: deps.notifications}}));
vi.mock('@/utils/webpush', () => ({default: {sendNotification: deps.send, configure: deps.configure}}));
import {subscribePushNotification, unsubscribePushNotification, validatePushSubscription, deliverPendingPushNotifications} from '@/services/v1/notifications';
const subscription = {endpoint: 'https://fcm.googleapis.com/fcm/send/browser', keys: {p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url')}};
beforeEach(() => {
 vi.clearAllMocks(); deps.configure.mockReset(); deps.notifications.updateMany.mockResolvedValue({count: 1}); deps.notifications.update.mockResolvedValue({});
 deps.notifications.findMany.mockResolvedValue([{id: 'n1', recipientId: 'owner', title: 'New like', message: 'Your post was liked'}]);
 deps.subscriptions.findMany.mockResolvedValue([{id: 's1', config: subscription}]); deps.send.mockResolvedValue({});
});
it('upserts a browser endpoint to the authenticated account, never a body-supplied user', async () => {
 expect((await subscribePushNotification({...subscription, userId: 'attacker'}, {id: 'owner'})).status).toBe(200);
 expect(deps.subscriptions.upsert).toHaveBeenCalledWith({where: {endpoint: subscription.endpoint}, create: {endpoint: subscription.endpoint, config: subscription, userId: 'owner', sessionId: null}, update: {config: subscription, userId: 'owner', sessionId: null}});
});
it.each(['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.attacker.test/x','https://127.0.0.1/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])('rejects unsafe endpoints %s', endpoint => {
 expect(() => validatePushSubscription({...subscription, endpoint})).toThrow();
});
it('rejects bad keys without storing a subscription', async () => {
 expect((await subscribePushNotification({...subscription, keys: {p256dh: 'invalid', auth: 'invalid'}}, {id: 'owner'})).status).toBe(400);
 expect(deps.subscriptions.upsert).not.toHaveBeenCalled();
});
it('unsubscribes only the authenticated owner', async () => {
 await unsubscribePushNotification(subscription.endpoint, {id: 'owner'});
 expect(deps.subscriptions.deleteMany).toHaveBeenCalledWith({where: {endpoint: subscription.endpoint, userId: 'owner'}});
});
it('delivers committed notifications and marks success', async () => {
 await deliverPendingPushNotifications();
 expect(deps.send).toHaveBeenCalledWith(subscription, expect.stringContaining('"tag":"n1"'), {TTL: 3600, timeout: 5_000});
 expect(deps.notifications.update).toHaveBeenCalledWith({where: {id: 'n1'}, data: {pushSentAt: expect.any(Date)}});
});
it.each([404, 410])('removes expired endpoints %s without retrying', async statusCode => {
 deps.send.mockRejectedValue({statusCode}); await deliverPendingPushNotifications();
 expect(deps.subscriptions.deleteMany).toHaveBeenCalledWith({where: {id: 's1'}});
 expect(deps.notifications.update).toHaveBeenCalled();
});
it('keeps transient failures pending and still delivers to other devices', async () => {
 deps.subscriptions.findMany.mockResolvedValue([{id: 's1', config: subscription}, {id: 's2', config: subscription}]);
 deps.send.mockRejectedValueOnce({statusCode: 503}).mockResolvedValueOnce({}); await deliverPendingPushNotifications();
 expect(deps.send).toHaveBeenCalledTimes(2);
 expect(deps.notifications.update).toHaveBeenCalledWith({where: {id: 'n1'}, data: {pushDeliveredSubscriptionIds: {push: 's2'}}});
 expect(deps.notifications.update).not.toHaveBeenCalledWith({where: {id: 'n1'}, data: {pushSentAt: expect.any(Date)}});
});
it('retries only devices that have not already received the notification', async () => {
 deps.notifications.findMany.mockResolvedValue([{id: 'n1', recipientId: 'owner', title: 'New post', message: 'Published', pushDeliveredSubscriptionIds: ['s1']}]);
 deps.subscriptions.findMany.mockResolvedValue([{id: 's1', config: subscription}, {id: 's2', config: subscription}]);
 await deliverPendingPushNotifications();
 expect(deps.send).toHaveBeenCalledOnce();
 expect(deps.notifications.update).toHaveBeenCalledWith({where: {id: 'n1'}, data: {pushDeliveredSubscriptionIds: {push: 's2'}}});
});
it('does not deliver when another worker already owns the lease', async () => {
 deps.notifications.updateMany.mockResolvedValue({count: 0}); await deliverPendingPushNotifications(); expect(deps.send).not.toHaveBeenCalled();
});
it('finishes notifications with no subscribed device without growing a backlog', async () => {
 deps.subscriptions.findMany.mockResolvedValue([]); await deliverPendingPushNotifications(); expect(deps.send).not.toHaveBeenCalled(); expect(deps.notifications.update).toHaveBeenCalled();
});

it('reports missing VAPID configuration before falsely claiming notifications are enabled', async () => {
 deps.configure.mockImplementation(() => {throw new Error('Unavailable');});
 expect((await subscribePushNotification(subscription, {id: 'owner'})).status).toBe(503);
 expect(deps.subscriptions.upsert).not.toHaveBeenCalled();
});
