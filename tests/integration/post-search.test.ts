import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { searchPosts } from '@/services/v1/posts';
import { getAuthUser } from '@/services/v1/utils';
import { searchUsers } from '@/services/v1/users';
vi.mock('@/utils/webpush', () => ({ default: {} }));
const db = new PrismaClient();
const prefix = 'search-fixture-';
const author = prefix + 'author', viewer = prefix + 'viewer';
const create = (id: string, content: string, extra: any = {}) => db.post.create({ data: {
  id: prefix + id, userId: author, content, type: 'CONTENT', kind: 'ROOT', createdAt: new Date(Date.now() - 60_000), ...extra,
} });
beforeAll(async () => {
  await db.user.createMany({ data: [author, viewer].map(id => ({ id, name: 'Search Fixture', username: id, email: `${id}@example.invalid` })) });
  await create('older-popular', 'Searchfixture solar energy #Searchfixture', { totalLikes: 50n, createdAt: new Date(Date.now() - 120_000) });
  await create('newer', JSON.stringify({ blocks: [{ text: 'Searchfixture solar energy' }], entityMap: { 0: { data: { hidden: 'metadatasecret' } } } }));
  await create('hash', '#SearchfixtureExtra');
  for (const [id, extra] of Object.entries({ hidden: { isHidden: true }, draft: { status: 'DRAFT' }, restricted: { scope: 'FOLLOWED' }, reply: { kind: 'REPLY' }, future: { scheduleAt: new Date(Date.now() + 60_000) } })) await create(id, 'Searchfixture solar energy', extra);
});
afterAll(async () => {
  await db.blockUser.deleteMany({ where: { blockerId: viewer } });
  await db.muteUser.deleteMany({ where: { muterId: viewer } });
  await db.likedPost.deleteMany({ where: { userId: viewer } });
  await db.post.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});
it('orders top by engagement and latest by time, with real pagination and no restricted hits', async () => {
  const top = await searchPosts('Searchfixture solar energy', 'top', 1, 1);
  expect(top.posts.map((post: any) => post.id)).toEqual([prefix + 'older-popular']); expect(top.hasMore).toBe(true);
  const next = await searchPosts('Searchfixture solar energy', 'top', 2, 1);
  expect(next.posts.map((post: any) => post.id)).toEqual([prefix + 'newer']); expect(next.hasMore).toBe(false);
  const latest = await searchPosts('Searchfixture solar energy', 'latest', 1, 20);
  expect(latest.posts.map((post: any) => post.id)).toEqual([prefix + 'newer', prefix + 'older-popular']);
});
it('matches complete hashtags, excluding plain text and longer hashtags', async () => {
  const result = await searchPosts('#Searchfixture', 'top', 1, 20);
  expect(result.posts.map((post: any) => post.id)).toEqual([prefix + 'older-popular']);
});
it('ignores editor metadata and safely handles SQL-looking and empty queries', async () => {
  expect((await searchPosts('metadatasecret', 'top', 1, 20)).posts).toEqual([]);
  expect((await searchPosts("' OR 1=1 --", 'top', 1, 20)).posts).toEqual([]);
  expect((await searchPosts('#', 'top', 1, 20)).posts).toEqual([]);
});
it('removes blocked authors before pagination and exposes only public people fields', async () => {
  await db.blockUser.create({ data: { blockerId: viewer, blockedId: author } });
  const identity = { id: viewer } as any;
  expect((await searchPosts('Searchfixture', 'top', 1, 20, identity)).posts).toEqual([]);
  expect((await searchUsers({ query: prefix, page: 1, limit: 20, viewerId: viewer })).data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: author })]));
  await db.blockUser.deleteMany({ where: { blockerId: viewer } });
  const people = await searchUsers({ query: prefix, page: 1, limit: 1 });
  expect(people.status).toBe(200); expect(people.data).toHaveLength(1);
  expect(people.data[0]).not.toHaveProperty('email'); expect(people.data[0]).not.toHaveProperty('password');
});
it('hydrates authenticated search cards with the current viewer reaction', async () => {
  await db.likedPost.create({ data: { postId: prefix + 'newer', userId: viewer } });
  const identity = await getAuthUser(viewer);
  const result = await searchPosts('Searchfixture solar energy', 'latest', 1, 21, identity.data as any);
  expect(result.posts.map((post: any) => post.id)).toEqual([prefix + 'newer', prefix + 'older-popular']);
  expect((result.posts[0] as any).actions.hasLiked).toBe(true);
});
it('excludes newly private authors and returns an empty successful people result', async () => {
  await db.user.update({ where: { id: author }, data: { isPrivate: true } });
  expect((await searchPosts('Searchfixture', 'top', 1, 20)).posts).toEqual([]);
  expect(await searchUsers({ query: 'nonexistentfixtureperson', page: 1, limit: 21 })).toEqual({ data: [], status: 200 });
});
