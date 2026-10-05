import prisma from '@/db';
import { AuthUser } from '@/types/user';
import webpush from '@/utils/webpush';

// Only browser push services may be contacted; arbitrary endpoints are an SSRF risk.
export function validatePushSubscription(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Invalid push subscription');
  const input = body as {endpoint?: unknown; keys?: {p256dh?: unknown; auth?: unknown}};
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new Error('Invalid push endpoint');
  const url = new URL(input.endpoint);
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(allowed.includes(url.hostname) || url.hostname.endsWith('.notify.windows.com'))) throw new Error('Unsupported push endpoint');
  const key = (value: unknown, bytes: number) => typeof value === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(value) && Buffer.from(value, 'base64url').length === bytes;
  if (!key(input.keys?.p256dh, 65) || !key(input.keys?.auth, 16)) throw new Error('Invalid push encryption keys');
  return {endpoint: url.href, keys: {p256dh: input.keys!.p256dh as string, auth: input.keys!.auth as string}};
}
export async function subscribePushNotification(body: unknown, user: Pick<AuthUser, 'id' | 'sessionId'>) {
  let config;
  try { config = validatePushSubscription(body); } catch {return {status: 400, data: 'Invalid or unsupported push subscription'};}
  try {webpush.configure?.();} catch {return {status: 503, data: 'Push notifications are not configured on the server'};}
  try {
    // A browser endpoint belongs to the currently selected account, never both accounts.
    await prisma.pushNotification.upsert({where: {endpoint: config.endpoint}, create: {endpoint: config.endpoint, config, userId: user.id, sessionId: user.sessionId ?? null}, update: {config, userId: user.id, sessionId: user.sessionId ?? null}});
    return {status: 200, data: {subscribed: true}};
  } catch {return {status: 500, data: 'Unable to enable notifications'};}
}
export async function unsubscribePushNotification(endpoint: string, user: Pick<AuthUser, 'id' | 'sessionId'>) {
  await prisma.pushNotification.deleteMany({where: {endpoint, userId: user.id}});
}
export async function deliverPendingPushNotifications() {
  const now = new Date();
  // Recurring queue has global concurrency one. Lease rows to recover after crashes.
  const notifications = await prisma.notification.findMany({where: {pushSentAt: null, pushAttempts: {lt: 5}, nextPushAttemptAt: {lte: now}}, orderBy: {createdAt: 'asc'}, take: 20});
  await Promise.all(notifications.map(async notification => {
    const claim = await prisma.notification.updateMany({where: {id: notification.id, pushSentAt: null, nextPushAttemptAt: {lte: now}}, data: {pushAttempts: {increment: 1}, nextPushAttemptAt: new Date(Date.now() + 300_000)}});
    if (!claim.count) return;
    const subscriptions = notification.recipientId ? await prisma.pushNotification.findMany({where: {userId: notification.recipientId, OR: [{sessionId: null}, {session: {revokedAt: null, expiresAt: {gt: new Date()}, userId: notification.recipientId}}]}, orderBy: {updatedAt: 'desc'}}) : [];
    let retry = false;
    for (const subscription of subscriptions) {
      try {
        const config = validatePushSubscription(subscription.config);
        await webpush.sendNotification(config, JSON.stringify({title: notification.title, body: notification.message, tag: notification.id, url: '/notifications'}), {TTL: 3600, timeout: 5_000});
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await prisma.pushNotification.deleteMany({where: {id: subscription.id}});
        else retry = true;
      }
    }
    if (!retry) await prisma.notification.update({where: {id: notification.id}, data: {pushSentAt: new Date()}});
  }));
}
