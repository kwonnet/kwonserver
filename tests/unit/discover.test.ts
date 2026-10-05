import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ $queryRawUnsafe: vi.fn(), country: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/db/timescaleDb', () => ({ prismaAnalytics: {} }));
import { getTrendingTopics, getDiscoverTrends } from '@/services/v1/discover';
const row = { last_24_mentions: 10n, last_24_posts: 5n, last_24_users: 3n, trend: ' Topic ', growth: 'New', country_id: null, users: 8n, posts: 12n, mentions: 20n };
beforeEach(() => { resetMocks(db); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); db.$queryRawUnsafe.mockResolvedValue([row]); });
it('uses global defaults, trims trends and converts database counts to JSON numbers', async () => {
  expect(await getTrendingTopics()).toEqual({ status: 200, data: [{ last_24_mentions: 10, last_24_posts: 5, last_24_users: 3, trend: 'Topic', growth: 'New', country: 'Global', users: 8, posts: 12, mentions: 20 }] });
  expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), 0, 20); expect(db.country.findUnique).not.toHaveBeenCalled();
});
it('binds country filters as SQL parameters rather than interpolating user input', async () => {
  const country = "NG'; DROP TABLE posts; --"; db.country.findUnique.mockResolvedValue({ name: 'Nigeria', emoji: '🇳🇬' });
  expect(await getTrendingTopics(country, 7, 10)).toMatchObject({ status: 200, data: [{ country: 'Nigeria' }] });
  const [sql, ...params] = db.$queryRawUnsafe.mock.calls[0];
  expect(sql).toContain('AND COALESCE(e."countryId", u."countryId") = $3'); expect(sql).not.toContain(country); expect(params).toEqual([10, 7, country]);
  expect(db.country.findUnique).toHaveBeenCalledWith({ where: { id: country }, select: { id: true, name: true, emoji: true } });
});
it('labels an unknown country', async () => { db.country.findUnique.mockResolvedValue(null); expect(await getTrendingTopics('missing')).toMatchObject({ data: [{ country: 'Unknown' }] }); });
it('orders returned trends by recent mentions', async () => {
  db.$queryRawUnsafe.mockResolvedValue([row, { ...row, trend: 'Popular', last_24_mentions: 50n }]);
  const result = await getTrendingTopics(); expect((result.data as any[]).map(r => r.trend)).toEqual(['Popular', 'Topic']);
});
it('returns an empty collection for no qualifying topics', async () => { db.$queryRawUnsafe.mockResolvedValue([]); expect(await getTrendingTopics()).toEqual({ status: 200, data: [] }); });
it.each(['query', 'country'])('returns a generic error after %s failure', async stage => {
  if (stage === 'query') db.$queryRawUnsafe.mockRejectedValue(new Error('private'));
  else db.country.findUnique.mockRejectedValue(new Error('private'));
  expect(await getTrendingTopics('NG')).toEqual({ status: 500, data: 'Error occurred trying to get latest trends' });
});

it.each([0, 101, 1.5])('rejects invalid limit %s before querying', async limit => {
  expect(await getTrendingTopics(null, limit)).toMatchObject({ status: 400 });
  expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
});

it('resolves ISO2 to the stored country ID before querying event country IDs', async () => {
  db.country.findUnique.mockResolvedValue({ id: 'country-nigeria', name: 'Nigeria', emoji: '🇳🇬' });
  expect(await getTrendingTopics('ng', 5, 1)).toMatchObject({ status: 200, data: [{ country: 'Nigeria' }] });
  expect(db.country.findUnique).toHaveBeenCalledWith({ where: { iso2: 'NG' }, select: { id: true, name: true, emoji: true } });
  expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), 1, 5, 'country-nigeria');
});

it('For you uses stored country, ignoring a forged browser country, then falls back when empty', async () => {
  db.user.findUnique.mockResolvedValue({ countryId: 'nigeria' });
  db.country.findUnique.mockResolvedValue({ id: 'nigeria', name: 'Nigeria', emoji: '🇳🇬' });
  db.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
  expect(await getDiscoverTrends({ viewerId: 'owner', personalized: true, country: 'forged', limit: 10 })).toMatchObject({ status: 200, data: [{ country: 'Global' }] });
  expect(db.$queryRawUnsafe.mock.calls.map(call => call.slice(1))).toEqual([[1, 10, 'nigeria'], [1, 10]]);
});
it('keeps local results and never masks a database failure with global fallback', async () => {
  db.user.findUnique.mockResolvedValue({ countryId: 'nigeria' });
  expect((await getDiscoverTrends({ viewerId: 'u', personalized: true, limit: 5 })).status).toBe(200);
  expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  db.$queryRawUnsafe.mockRejectedValue(new Error('unavailable'));
  expect((await getDiscoverTrends({ viewerId: 'u', personalized: true, limit: 5 })).status).toBe(500);
  expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2);
});
it('uses worldwide trends for guests or accounts without a country', async () => {
  db.user.findUnique.mockResolvedValue({ countryId: null });
  await getDiscoverTrends({ viewerId: 'u', personalized: true, limit: 5 });
  await getDiscoverTrends({ personalized: true, country: 'forged', limit: 5 });
  expect(db.$queryRawUnsafe.mock.calls.map(call => call.slice(1))).toEqual([[1, 5], [1, 5]]);
});
it('validates and parameterizes semantic category filters', async () => {
  await getTrendingTopics(null, 5, 1, 'sports');
  expect(db.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('AND p.topic = $3'), 1, 5, 'sports');
  expect((await getTrendingTopics(null, 5, 1, 'injected')).status).toBe(400);
  expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
});
