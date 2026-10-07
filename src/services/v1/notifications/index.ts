import prisma from '@/db';
import { AuthUser } from '@/types/user';
import webpush from '@/utils/webpush';
import { Prisma } from '@prisma/client';
import logger from '@/logger';
import { postNotificationVisibility } from '@/services/recommendation-visibility';

export function publicationNotificationVisibility(userId: string): Prisma.NotificationWhereInput {
  return { OR: [
    { sourceKey: null },
    { sourceKey: { startsWith: 'post-published:' },
      sender: { postNotificationSubscribers: { some: { subscriberId: userId } } },
      post: { is: postNotificationVisibility(userId) } },
  ] };
}

export async function getAuthorNotificationSubscription(authorId: string, subscriberId: string) {
  const subscription = await prisma.postNotificationSubscription.findUnique({where: {subscriberId_authorId: {subscriberId, authorId}}});
  return {status: 200, data: {subscribed: !!subscription}};
}

export async function setAuthorNotificationSubscription(authorId: string, subscriberId: string, enabled: boolean) {
  if (authorId === subscriberId) return {status: 400, data: 'You cannot subscribe to your own posts'};
  if (!enabled) {
    await prisma.postNotificationSubscription.deleteMany({where: {subscriberId, authorId}});
    return {status: 200, data: {subscribed: false}};
  }
  const author = await prisma.user.findFirst({where: {
    id: authorId, status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null,
    NOT: [{blockedUsers: {some: {blockedId: subscriberId}}}, {blockedBy: {some: {blockerId: subscriberId}}}, {mutedBy: {some: {muterId: subscriberId}}}],
    OR: [{status: 'ACTIVE', isPrivate: false}, {followers: {some: {followerId: subscriberId, status: 'ACCEPTED'}}}],
  }, select: {id: true}});
  if (!author) return {status: 404, data: 'This account is unavailable for post notifications'};
  await prisma.postNotificationSubscription.createMany({data: [{subscriberId, authorId}], skipDuplicates: true});
  return {status: 200, data: {subscribed: true}};
}

/** Bounded transactional fanout. A crash rolls back both notifications and cursor. */
export async function fanoutPublishedPostNotifications() {
  for (let batch = 0; batch < 10; batch++) {
    const processed = await prisma.$transaction(async tx => {
      const [event] = await tx.$queryRaw<{postId: string; createdAt: Date; subscriberCursor: string | null}[]>`
        SELECT "postId", "createdAt", "subscriberCursor" FROM "PostPublicationNotification"
        WHERE "completedAt" IS NULL ORDER BY "createdAt", "postId" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!event) return false;
      const post = await tx.post.findUnique({where: {id: event.postId}, select: {userId: true, status: true, deletedAt: true, isHidden: true, user: {select: {name: true}}}});
      if (!post || post.status !== 'PUBLISHED' || post.deletedAt || post.isHidden) {
        await tx.postPublicationNotification.update({where: {postId: event.postId}, data: {completedAt: new Date()}});
        return true;
      }
      const subscribers = await tx.postNotificationSubscription.findMany({where: {
        authorId: post.userId, createdAt: {lte: event.createdAt},
        ...(event.subscriberCursor ? {id: {gt: event.subscriberCursor}} : {}),
        subscriber: {status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null},
      }, orderBy: {id: 'asc'}, take: 100});
      const notifications: Prisma.NotificationCreateManyInput[] = [];
      for (const subscription of subscribers) {
        const visible = await tx.post.findFirst({where: {id: event.postId, ...postNotificationVisibility(subscription.subscriberId)}, select: {id: true}});
        if (visible) notifications.push({sourceKey: `post-published:${event.postId}:${subscription.subscriberId}`,
          senderId: post.userId, recipientId: subscription.subscriberId, postId: event.postId,
          type: 'POST', action: 'NONE', title: 'New post', message: `${post.user.name.slice(0,80)} published a new post`});
      }
      if (notifications.length) await tx.notification.createMany({data: notifications, skipDuplicates: true});
      await tx.postPublicationNotification.update({where: {postId: event.postId}, data: {
        subscriberCursor: subscribers.at(-1)?.id ?? event.subscriberCursor,
        ...(subscribers.length < 100 ? {completedAt: new Date()} : {}),
      }});
      return true;
    }, {timeout: 30_000});
    if (!processed) break;
  }
}

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
  const notifications = await prisma.notification.findMany({where: {pushSentAt: null, pushAttempts: {lt: 5}, nextPushAttemptAt: {lte: now}}, orderBy: {createdAt: 'asc'}, take: 100});
  const deliver = async (notification: typeof notifications[number]) => {
    const claim = await prisma.notification.updateMany({where: {id: notification.id, pushSentAt: null, nextPushAttemptAt: {lte: now}}, data: {pushAttempts: {increment: 1}, nextPushAttemptAt: new Date(Date.now() + 300_000)}});
    if (!claim.count) return;
    let target = '/notifications';
    if (notification.sourceKey?.startsWith('post-published:')) {
      const current = await prisma.notification.findFirst({where: {id: notification.id,
        recipient: {status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null},
        ...publicationNotificationVisibility(notification.recipientId!),
        sender: {postNotificationSubscribers: {some: {subscriberId: notification.recipientId!, createdAt: {lte: notification.createdAt ?? new Date(0)}}}}},
        select: {post: {select: {id: true, user: {select: {username: true}}}}}});
      if (!current?.post) {
        await prisma.notification.update({where: {id: notification.id}, data: {pushSentAt: new Date()}});
        return;
      }
      target = `/@${encodeURIComponent(current.post.user.username)}/feed/${encodeURIComponent(current.post.id)}`;
    }
    const subscriptions = notification.recipientId ? await prisma.pushNotification.findMany({where: {userId: notification.recipientId, OR: [{sessionId: null}, {session: {revokedAt: null, expiresAt: {gt: new Date()}, userId: notification.recipientId}}]}, orderBy: {updatedAt: 'desc'}}) : [];
    let retry = false;
    for (const subscription of subscriptions) {
      if (notification.pushDeliveredSubscriptionIds?.includes(subscription.id)) continue;
      try {
        const config = validatePushSubscription(subscription.config);
        await webpush.sendNotification(config, JSON.stringify({title: notification.title, body: notification.message, tag: notification.id, url: target}), {TTL: 3600, timeout: 5_000});
        await prisma.notification.update({where: {id: notification.id}, data: {pushDeliveredSubscriptionIds: {push: subscription.id}}});
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await prisma.pushNotification.deleteMany({where: {id: subscription.id}});
        else {retry = true; logger.warn({notificationId: notification.id, subscriptionId: subscription.id, statusCode: error?.statusCode}, 'Push delivery failed; retry scheduled');}
      }
    }
    if (!retry) await prisma.notification.update({where: {id: notification.id}, data: {pushSentAt: new Date()}});
  };
  // Bound concurrent outbound requests instead of opening one for every subscriber.
  for (let offset = 0; offset < notifications.length; offset += 10) {
    await Promise.all(notifications.slice(offset, offset + 10).map(deliver));
  }
}
