import {PrismaPg} from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
vi.mock('@/utils/webpush', () => ({ default: {} }));
import { newsfeedQuery } from '@/services/v1/posts';
import { getNewsfeed } from '@/services/v1/posts';

const db = new PrismaClient({ adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000}), log: [{ emit: 'event', level: 'query' }] });
let queries = 0;
db.$on('query', () => { queries++; });
const viewer = 'feed-reader';
const author = 'feed-author';
const ids = Array.from({ length: 21 }, (_, i) => `feed-post-${i}`);
let reader: any;
beforeAll(async () => {
  for (const id of [viewer, author, 'feed-blocked']) {
    await db.user.create({ data: { id, username: id, name: id, email: `${id}@test.invalid` } });
  }
  reader = await db.user.findUniqueOrThrow({ where: { id: viewer } });
  await db.post.createMany({ data: ids.map(id => ({ id, userId: author, type: 'CONTENT', kind: 'ROOT', content: id })) });
  await db.post.update({ where: { id: ids[0] }, data: { kind: 'QUOTE', parentId: ids[1], rootId: ids[1] } });
  await db.post.update({ where: { id: ids[1] }, data: { kind: 'QUOTE', parentId: ids[2], rootId: ids[2] } });
  await db.likedPost.create({ data: { postId: ids[2], userId: viewer } });
  await db.bookmark.create({ data: { postId: ids[0], userId: viewer } });
  await db.post.create({ data: { id: 'feed-repost', userId: viewer, type: 'CONTENT', kind: 'REPOST', parentId: ids[2] } });
  await db.poll.create({ data: { postId: ids[3], expireAt: new Date('2099-01-01'), options: { create: [
    { text: 'A', voters: { create: { userId: viewer } } }, { text: 'B' },
  ] } } });
  await db.quiz.create({ data: { postId: ids[4], expireAt: new Date('2099-01-01'), rewardAmount: 1.25, maxWinners: 2,
    options: { create: [{ text: 'Correct', isCorrect: true }, { text: 'Wrong' }] } } });
  await db.follow.create({ data: { followerId: viewer, followingId: author, status: 'ACCEPTED' } });
});
afterAll(async () => { await db.$disconnect(); });

// Includes relation ordering in comparison without relying on PostgreSQL's unspecified row order.
function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value?.constructor?.name === 'Decimal') return value.toString();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, canonical(v)]));
  return value;
}

it('returns identical viewer-specific data with one hydration query instead of many sequential reads', async () => {
  const query = newsfeedQuery(viewer, ids);
  queries = 0;
  const before = performance.now();
  const legacy = await db.post.findMany({ ...query, relationLoadStrategy: 'query' });
  const legacyMs = Math.round(performance.now() - before);
  const legacyQueries = queries;
  queries = 0;
  const after = performance.now();
  const joined = await db.post.findMany(query);
  const joinedMs = Math.round(performance.now() - after);
  expect(queries).toBe(1);
  expect(legacyQueries).toBeGreaterThan(15);
  expect(canonical(joined)).toEqual(canonical(legacy));
  expect(joined).toHaveLength(21);
  const measurement = JSON.stringify({ event: 'feed_hydration_benchmark', posts: 21, legacyQueries, joinedQueries: queries, legacyMs, joinedMs });
  console.info(measurement);
  if (process.env.FEED_BENCHMARK_OUTPUT) writeFileSync(process.env.FEED_BENCHMARK_OUTPUT, measurement); 
});

it('keeps fresh visibility and reactions when ranking is reused, including nested repost actions', async () => {
  const first = await getNewsfeed([ids[0]], reader, { feed: 'foryou' });
  expect(first.status).toBe(200);
  const post = (first.data as any[])[0];
  expect(post.actions.hasSaved).toBe(true);
  expect(post.parent.parent.actions.hasLiked).toBe(true);
  expect(post.parent.parent.actions.hasReposted).toBe(true);
  await db.post.update({ where: { id: ids[0] }, data: { isHidden: true } });
  expect(await getNewsfeed([ids[0]], reader, { feed: 'foryou' })).toEqual({ status: 200, data: [] });
});

it('uses accepted follows, mutual follows and fresh visibility rather than recommendation IDs for each tab', async () => {
  const now = new Date();
  const names = ['following', 'friend', 'private', 'pending', 'stranger', 'blocked', 'muted'];
  for (const name of names) {
    const id = `tab-${name}`;
    await db.user.create({ data: { id, username: id, name, email: `${id}@test.invalid`, ...(name === 'private' ? { isPrivate: true, status: 'PRIVATE' } : {}) } });
    await db.post.create({ data: { id: `tab-post-${name}`, userId: id, type: 'CONTENT', kind: 'ROOT', content: name, createdAt: new Date(now.getTime() - 1000), ...(name === 'private' ? { scope: 'FOLLOWED' } : {}) } });
    if (!['stranger'].includes(name)) await db.follow.create({ data: { followerId: viewer, followingId: id, status: name === 'pending' ? 'PENDING' : 'ACCEPTED' } });
  }
  await db.follow.create({ data: { followerId: 'tab-friend', followingId: viewer, status: 'ACCEPTED' } });
  await db.blockUser.create({ data: { blockerId: viewer, blockedId: 'tab-blocked' } });
  await db.muteUser.create({ data: { muterId: viewer, mutedId: 'tab-muted' } });
  const read = async (feed: string, page = 1, limit = 100) => db.post.findMany(newsfeedQuery(viewer, ['tab-post-stranger'], { feed, page, limit }));
  const following = await read('following');
  expect(following.filter(p => p.id.startsWith('tab-')).map(p => p.id).sort()).toEqual(['tab-post-following', 'tab-post-friend', 'tab-post-private']);
  expect((await read('friends')).map(p => p.id)).toEqual(['tab-post-friend']);
  const latest = await read('latest');
  expect(latest.some(p => p.id === 'tab-post-stranger')).toBe(true);
  expect(latest.some(p => p.id === 'tab-post-private')).toBe(false);
  const first = await read('following', 1, 2), second = await read('following', 2, 2);
  expect(new Set([...first, ...second].map(p => p.id)).size).toBe(first.length + second.length);
  await db.follow.updateMany({ where: { followerId: viewer, followingId: 'tab-private' }, data: { status: 'PENDING' } });
  expect((await read('following')).some(p => p.id === 'tab-post-private')).toBe(false);
});
