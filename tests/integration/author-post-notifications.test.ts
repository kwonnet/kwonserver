import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient, Prisma} from '@prisma/client';
import {afterAll, beforeAll, beforeEach, expect, it, vi} from 'vitest';
const send = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('@/utils/webpush', () => ({default: {sendNotification: send}}));
import {getAuthorNotificationSubscription, setAuthorNotificationSubscription, fanoutPublishedPostNotifications, deliverPendingPushNotifications, publicationNotificationVisibility} from '@/services/v1/notifications';
import {publishDueScheduledPosts} from '@/services/v1/posts';
const db = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10})});
let author: string, subscriber: string, stranger: string;
const extraSubscribers: string[] = [];
const fixture = 'author-notifications-';
const config = {endpoint: 'https://fcm.googleapis.com/fcm/send/author-notifications-test', keys: {p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url')}};
const publish = (data: Partial<Prisma.PostUncheckedCreateInput> = {}) => db.post.create({data: {userId: author, content: 'A new post', type: 'CONTENT', status: 'PUBLISHED', scope: 'ANYONE', kind: 'ROOT', ...data}});
beforeAll(async () => {
  const people = await Promise.all(['author','subscriber','stranger'].map(name => db.user.create({data: {name, username: fixture+name, email: fixture+name+'@test.invalid'}})));
  [author, subscriber, stranger] = people.map(person => person.id);
});
beforeEach(async () => {
  send.mockClear();
  await db.notification.deleteMany({where: {senderId: author}});
  await db.post.deleteMany({where: {userId: author, kind: {in: ['THREAD','REPLY','REPOST','QUOTE']}}});
  await db.post.deleteMany({where: {userId: author}});
  await db.postNotificationSubscription.deleteMany({where: {authorId: author}});
  await db.blockUser.deleteMany({where: {OR: [{blockerId: author}, {blockedId: author}]}});
  await db.muteUser.deleteMany({where: {mutedId: author}});
  await db.follow.deleteMany({where: {followingId: author}});
  await db.user.update({where: {id: author}, data: {isPrivate: false, status: 'ACTIVE'}});
});
afterAll(async () => {
  await db.notification.deleteMany({where: {senderId: author}});
  await db.post.deleteMany({where: {userId: author}});
  await db.pushNotification.deleteMany({where: {userId: subscriber}});
  await db.follow.deleteMany({where: {followingId: author}});
  await db.blockUser.deleteMany({where: {OR: [{blockerId: author}, {blockedId: author}]}});
  await db.muteUser.deleteMany({where: {mutedId: author}});
  await db.user.deleteMany({where: {id: {in: [author,subscriber,stranger,...extraSubscribers]}}});
  await db.$disconnect();
});
it('persists idempotent opt-in and isolates preference ownership', async () => {
  await Promise.all([setAuthorNotificationSubscription(author, subscriber, true), setAuthorNotificationSubscription(author, subscriber, true)]);
  expect(await db.postNotificationSubscription.count({where: {authorId: author}})).toBe(1);
  expect((await getAuthorNotificationSubscription(author, stranger)).data.subscribed).toBe(false);
  expect((await setAuthorNotificationSubscription(author, author, true)).status).toBe(400);
  await setAuthorNotificationSubscription(author, stranger, false);
  expect((await getAuthorNotificationSubscription(author, subscriber)).data.subscribed).toBe(true);
});
it('commits publication events atomically, deduplicates fanout, and pushes a post deep link', async () => {
  await setAuthorNotificationSubscription(author, subscriber, true);
  const post = await publish();
  expect(await db.postPublicationNotification.findUnique({where: {postId: post.id}})).not.toBeNull();
  await Promise.all([fanoutPublishedPostNotifications(),fanoutPublishedPostNotifications()]);
  await db.post.update({where: {id: post.id}, data: {content: 'Edited', status: 'PUBLISHED'}});
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {postId: post.id}})).toBe(1);
  await db.pushNotification.create({data: {endpoint: config.endpoint, config, userId: subscriber}});
  await deliverPendingPushNotifications();
  expect(send).toHaveBeenCalledOnce();
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({url: `/@${fixture}author/feed/${post.id}`, body: 'author published a new post'});
  await expect(db.$transaction(async tx => {
    await tx.post.create({data: {userId: author, content: 'Rolled back', type: 'CONTENT', kind: 'ROOT'}});
    throw new Error('rollback');
  })).rejects.toThrow('rollback');
  expect(await db.postPublicationNotification.count({where: {post: {userId: author}}})).toBe(1);
});
it('queues scheduled publications only when they go live and skips draft/thread/reply/repost', async () => {
  await setAuthorNotificationSubscription(author, subscriber, true);
  const scheduled = await publish({status: 'SCHEDULED', scheduleAt: new Date(Date.now()-1000)});
  const draft = await publish({status: 'DRAFT'});
  for (const kind of ['THREAD','REPLY','REPOST'] as const) await publish({kind, parentId: draft.id, rootId: kind === 'THREAD' ? draft.id : null});
  expect(await db.postPublicationNotification.count({where: {post: {userId: author}}})).toBe(0);
  await publishDueScheduledPosts();
  await publishDueScheduledPosts();
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {senderId: author}})).toBe(1);
  expect(await db.notification.findFirst({where: {postId: scheduled.id}})).not.toBeNull();
  await db.post.update({where: {id: draft.id}, data: {status: 'PUBLISHED'}});
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {senderId: author}})).toBe(2);
  // Remove dependent fixture posts before the next test's root cleanup.
  await db.post.deleteMany({where: {parentId: draft.id}});
});
it('does not send historical posts to late subscribers or recipients who unsubscribe before fanout', async () => {
  await publish();
  await setAuthorNotificationSubscription(author, subscriber, true);
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {senderId: author}})).toBe(0);
  await publish();
  await setAuthorNotificationSubscription(author, subscriber, false);
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {senderId: author}})).toBe(0);
});
it.each(['block','mute','private','hidden','deleted','unsubscribe'])('rechecks %s before pushing a queued notification', async change => {
  await setAuthorNotificationSubscription(author, subscriber, true);
  const post = await publish();
  await fanoutPublishedPostNotifications();
  await db.pushNotification.upsert({where: {endpoint: config.endpoint}, create: {endpoint: config.endpoint, config, userId: subscriber}, update: {userId: subscriber}});
  if (change==='block') await db.blockUser.create({data: {blockerId: author, blockedId: subscriber}});
  if (change==='mute') await db.muteUser.create({data: {muterId: subscriber, mutedId: author}});
  if (change==='private') await db.user.update({where: {id: author}, data: {status: 'PRIVATE', isPrivate: true}});
  if (change==='hidden') await db.post.update({where: {id: post.id}, data: {isHidden: true}});
  if (change==='deleted') await db.post.update({where: {id: post.id}, data: {deletedAt: new Date()}});
  if (change==='unsubscribe') await setAuthorNotificationSubscription(author, subscriber, false);
  await deliverPendingPushNotifications();
  expect(send).not.toHaveBeenCalled();
  expect(await db.notification.count({where: {recipientId: subscriber, ...publicationNotificationVisibility(subscriber)}})).toBe(0);
});
it('allows accepted followers of private authors, but never an opt-in alone', async () => {
  await db.user.update({where: {id: author}, data: {status: 'PRIVATE', isPrivate: true}});
  expect((await setAuthorNotificationSubscription(author, subscriber, true)).status).toBe(404);
  await db.follow.create({data: {followerId: subscriber, followingId: author, status: 'ACCEPTED'}});
  expect((await setAuthorNotificationSubscription(author, subscriber, true)).status).toBe(200);
  const post = await publish({scope: 'FOLLOWED'});
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {postId: post.id}})).toBe(1);
});
it('pages large subscriber lists without duplicate or missing recipients', async () => {
  const people = await db.user.createManyAndReturn({data: Array.from({length: 105}, (_, i) => ({name: 'Subscriber', username: `${fixture}bulk-${i}`, email: `${fixture}bulk-${i}@test.invalid`}))});
  extraSubscribers.push(...people.map(person => person.id));
  await db.postNotificationSubscription.createMany({data: people.map(person => ({authorId: author, subscriberId: person.id}))});
  const post = await publish();
  await Promise.all([fanoutPublishedPostNotifications(),fanoutPublishedPostNotifications()]);
  expect(await db.notification.count({where: {postId: post.id}})).toBe(105);
  expect(await db.postPublicationNotification.findUnique({where: {postId: post.id}})).toMatchObject({completedAt: expect.any(Date)});
  await fanoutPublishedPostNotifications();
  expect(await db.notification.count({where: {postId: post.id}})).toBe(105);
});
