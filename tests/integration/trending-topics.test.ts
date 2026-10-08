import {PrismaPg} from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
const { backfill } = createRequire(import.meta.url)('../../scripts/database-analytics.cjs');
import { getTrendingTopics } from '@/services/v1/discover';
const db = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})});
const prefix = 'trending-fixture-';
const author = prefix + 'author';
const makePost = async (id: string, content: string, extra: any = {}) => {
  // The live trend window uses the database clock. Docker and the host can differ
  // by seconds, making freshly created Prisma timestamps appear in the future.
  const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
  return db.post.create({ data: {
    id: prefix + id, userId: author, type: 'CONTENT', kind: 'ROOT', content, createdAt: now, ...extra,
  } });
};
beforeAll(async () => {
  await db.user.create({ data: {emailVerifiedAt: new Date(),  id: author, name: 'Trending Author', username: author, email: author + '@example.invalid' } });
});
afterAll(async () => {
  await db.post.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.user.delete({ where: { id: author } });
  await db.country.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.continent.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});
it('a topic in one recent post is available by country ID or ISO2, and older-only topics remain historical', async () => {
  const continent = await db.continent.create({ data: { id: prefix + 'continent', code: 'ZT', name: prefix + 'continent' } });
  const country = await db.country.create({ data: { id: prefix + 'country', name: prefix + 'country', iso2: 'ZT', iso3: 'ZTT', emoji: prefix + 'flag', continentId: continent.id } });
  await makePost('single-recent-country', 'SingleCountryTopic', { countryId: country.id, createdAt: new Date(Date.now() - 3600000) });
  const historical = await makePost('historical-country', 'HistoricalCountryTopic', { countryId: country.id, createdAt: new Date(Date.now() - 5 * 24 * 3600000) });
  expect(await db.postTrendingEvent.count({ where: { postId: historical.id } })).toBe(1);
  for (const filter of [country.id, 'zt']) {
    const result = await getTrendingTopics(filter, 3, 1);
    expect(result.status).toBe(200);
    expect(result.data).toEqual([expect.objectContaining({ trend: 'Singlecountrytopic', country: country.name, posts: 1, last_24_posts: 1 })]);
  }
  await db.post.update({ where: { id: prefix + 'single-recent-country' }, data: { isHidden: true } });
  expect(await getTrendingTopics(country.id, 3, 1)).toEqual({ status: 200, data: [] });
});
it('extracts rendered Draft.js text, complete n-grams and hashtags; ignores URL, mentions and metadata', async () => {
  const content = JSON.stringify({ blocks: [{ text: 'Solar Energy Revolution #Solar @privateperson https://example.test/privateword' }], entityMap: { 0: { data: { hidden: 'metadataword' } } } });
  const rows = await db.$queryRawUnsafe<any[]>('SELECT * FROM kwonnet_trend_keywords($1)', content);
  expect(rows).toEqual(expect.arrayContaining([
    { keyword: 'solar', is_hashtag: true }, { keyword: 'solar energy', is_hashtag: false },
    { keyword: 'solar energy revolution', is_hashtag: false },
  ]));
  expect(rows.some(row => /metadataword|privateperson|privateword|blocks|entitymap/.test(row.keyword))).toBe(false);
  expect(rows.filter(row => row.keyword === 'solar')).toHaveLength(1);
  const stop = await db.$queryRawUnsafe<any[]>('SELECT * FROM kwonnet_trend_keywords($1)', 'solar and energy');
  expect(stop.map(row => row.keyword).sort()).toEqual(['energy', 'solar']);
});
it('insert/edit/privacy/deletion changes update events atomically and counter-only changes do not reindex', async () => {
  const post = await makePost('edits', 'Solar Energy Revolution');
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(6);
  await db.post.update({ where: { id: post.id }, data: { content: 'Ocean Conservation' } });
  expect((await db.postTrendingEvent.findMany({ where: { postId: post.id } })).map(row => row.keyword).sort()).toEqual(['conservation', 'ocean', 'ocean conservation']);
  await db.post.update({ where: { id: post.id }, data: { totalLikes: 12n } });
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(3);
  await db.post.update({ where: { id: post.id }, data: { scope: 'FOLLOWED' } });
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(0);
  await db.post.update({ where: { id: post.id }, data: { scope: 'ANYONE' } });
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(3);
  await db.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(0);
  await db.post.update({ where: { id: post.id }, data: { deletedAt: null } });
  await db.post.delete({ where: { id: post.id } });
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(0);
});
it('never indexes drafts, restricted posts, hidden posts or replies', async () => {
  for (const [index, extra] of [{ status: 'DRAFT' }, { isHidden: true }, { scope: 'MENTIONS' }, { kind: 'REPLY' }, { rootId: prefix + 'root' }].entries()) {
    if (index === 4) await makePost('root', 'Root content');
    const post = await makePost('restricted-' + index, 'Secret Topic', extra);
    expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(0);
  }
});
it('uses exact unique-user counts and excludes newly private accounts immediately', async () => {
  await makePost('recent', 'DistinctiveTrend', { createdAt: new Date(Date.now() - 3600000) });
  await makePost('recent2', 'DistinctiveTrend', { createdAt: new Date(Date.now() - 7200000) });
  await makePost('yesterday', 'DistinctiveTrend', { createdAt: new Date(Date.now() - 30 * 3600000) });
  await makePost('future', 'DistinctiveTrend', { createdAt: new Date(Date.now() + 24 * 3600000) });
  const initial = await getTrendingTopics();
  expect(initial.status).toBe(200);
  expect((initial.data as any[]).find(row => row.trend === 'Distinctivetrend')).toMatchObject({ last_24_posts: 2, posts: 3, users: 1, last_24_users: 1, growth: '100%' });
  await db.user.update({ where: { id: author }, data: { isPrivate: true } });
  const hidden = await getTrendingTopics();
  expect(hidden.status === 404 || !(hidden.data as any[]).some(row => row.trend === 'Distinctivetrend')).toBe(true);
  await db.user.update({ where: { id: author }, data: { isPrivate: false } });
});
it('reindexing a post is idempotent and concurrent edits cannot leave mixed keyword sets', async () => {
  const post = await makePost('repeat', 'Repeated Keyword');
  await db.$executeRawUnsafe('SELECT kwonnet_sync_post_trends($1)', post.id);
  await db.$executeRawUnsafe('SELECT kwonnet_sync_post_trends($1)', post.id);
  expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(3);
  await Promise.all(['Final Alpha', 'Final Beta'].map(content => db.post.update({ where: { id: post.id }, data: { content } })));
  const latest = await db.post.findUniqueOrThrow({ where: { id: post.id } });
  const expected = latest.content!.toLowerCase().split(' ');
  expect((await db.postTrendingEvent.findMany({ where: { postId: post.id } })).map(row => row.keyword).sort()).toEqual([...expected, expected.join(' ')].sort());
});

it('backfills pre-existing posts once and resumes without duplicating events', async () => {
  const post = await makePost('backfill', 'Historical Solar');
  // Simulate a row from before the trigger was installed, in the disposable DB.
  await db.postTrendingEvent.deleteMany({ where: { postId: post.id } });
  await db.$executeRawUnsafe('DELETE FROM "KwonnetAnalyticsSetup" WHERE name = $1', 'post-trends-v1');
  const { Client } = createRequire(import.meta.url)('pg');
  const connection = new Client({ connectionString: process.env.DATABASE_URL });
  await connection.connect();
  const log = { info() {} };
  try {
    await backfill(connection, log);
    expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(3);
    const state = await connection.query('SELECT "completedAt" FROM "KwonnetAnalyticsSetup" WHERE name = $1', ['post-trends-v1']);
    await backfill(connection, log);
    const again = await connection.query('SELECT "completedAt" FROM "KwonnetAnalyticsSetup" WHERE name = $1', ['post-trends-v1']);
    expect(again.rows[0].completedAt).toEqual(state.rows[0].completedAt);
    expect(await db.postTrendingEvent.count({ where: { postId: post.id } })).toBe(3);
  } finally { await connection.end(); }
});

it('filters category trends using inferred topics and resets them when content changes', async () => {
  const post = await makePost('sports', 'Championship Victory');
  await db.post.update({ where: { id: post.id }, data: { topic: 'sports' } });
  const sports = await getTrendingTopics(null, 100, 1, 'sports');
  expect(sports.data).toEqual(expect.arrayContaining([expect.objectContaining({ trend: 'Championship Victory' })]));
  const music = await getTrendingTopics(null, 100, 1, 'music');
  expect(music.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ trend: 'Championship Victory' })]));
  await db.post.update({ where: { id: post.id }, data: { content: 'Album Release' } });
  expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).topic).toBeNull();
});

it('captures the author country for new posts without a location', async () => {
  const country = await db.country.findUniqueOrThrow({ where: { id: prefix + 'country' } });
  await db.user.update({ where: { id: author }, data: { countryId: country.id } });
  const post = await makePost('author-country', 'Localized Celebration');
  expect(post.countryId).toBe(country.id);
  expect((await getTrendingTopics(country.id, 100, 1)).data).toEqual(expect.arrayContaining([expect.objectContaining({ trend: 'Localized Celebration' })]));
});
