import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
const send = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/utils/webpush', () => ({default: {sendNotification: send}}));
import {subscribePushNotification, unsubscribePushNotification, deliverPendingPushNotifications} from '@/services/v1/notifications';
const db = new PrismaClient(); const prefix = 'push-fixture-'; let first: string, second: string;
const config = {endpoint: 'https://fcm.googleapis.com/fcm/send/disposable-test', keys: {p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url')}};
beforeAll(async () => {
 first = (await db.user.create({data: {name: 'First', username: prefix + 'first', email: prefix + 'first@test.invalid'}})).id;
 second = (await db.user.create({data: {name: 'Second', username: prefix + 'second', email: prefix + 'second@test.invalid'}})).id;
});
afterAll(async () => {await db.pushNotification.deleteMany({where: {endpoint: config.endpoint}}); await db.user.deleteMany({where: {id: {in: [first, second]}}}); await db.$disconnect();});
it('deduplicates subscriptions, transfers browser ownership on account switch, and respects unsubscribe ownership', async () => {
 await Promise.all([subscribePushNotification(config, {id: first}), subscribePushNotification(config, {id: first})]);
 expect(await db.pushNotification.count({where: {endpoint: config.endpoint}})).toBe(1);
 await subscribePushNotification(config, {id: second}); await unsubscribePushNotification(config.endpoint, {id: first});
 expect(await db.pushNotification.findUnique({where: {endpoint: config.endpoint}})).toMatchObject({userId: second});
 const notification = await db.notification.create({data: {title: 'New like', message: 'Your post was liked', recipientId: second}});
 await deliverPendingPushNotifications();
 expect(send).toHaveBeenCalled(); expect(await db.notification.findUnique({where: {id: notification.id}})).toMatchObject({pushSentAt: expect.any(Date), pushAttempts: 1});
 await unsubscribePushNotification(config.endpoint, {id: second}); expect(await db.pushNotification.count({where: {endpoint: config.endpoint}})).toBe(0);
});

it('does not deliver push notifications to revoked login sessions', async () => {
 const session = await db.userSession.create({data: {userId: second, provider: 'PASSWORD', device: {}, metadataSource: 'API_REQUEST', expiresAt: new Date(Date.now()+3600_000), retainUntil: new Date(Date.now()+3600_000)}});
 await subscribePushNotification(config, {id: second, sessionId: session.id});
 await db.userSession.update({where: {id: session.id}, data: {revokedAt: new Date()}});
 await db.notification.create({data: {title: 'Revoked device', message: 'Private update', recipientId: second}});
 send.mockClear(); await deliverPendingPushNotifications(); expect(send).not.toHaveBeenCalled();
});
