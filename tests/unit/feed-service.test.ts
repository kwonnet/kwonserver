import { beforeEach, expect, it, vi } from 'vitest';
import { post, user } from './fixtures';
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/db', () => ({ default: { post: { findMany } } }));
vi.mock('@/utils/webpush', () => ({ default: {} }));
vi.mock('@/db/clickhouse', () => ({ clickHouseClient: {} }));
vi.mock('@/db/timescaleDb', () => ({ prismaAnalytics: {}, sequelizeAnalytics: {} }));
vi.mock('@/utils/helpers', () => ({ AppError: class extends Error {} }));
import { getNewsfeed, getRecommendedPosts } from '@/services/v1/posts';
import { recommendationVisibility } from '@/services/kwonrec';
beforeEach(() => { findMany.mockReset(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
it('hydrates only visible recommended posts, preserves ranking and omits missing IDs', async () => {
  const make = (id: string) => ({ ...post({ id }), user: user() });
  findMany.mockResolvedValueOnce([make('a'), make('c')]).mockResolvedValueOnce([{ id: 'repost', parentId: 'a' }]);
  const result = await getNewsfeed(['c', 'deleted', 'a'], user(), { feed: 'foryou' });
  expect(result.status).toBe(200);
  expect((result.data as any[]).map(p => p.id)).toEqual(['c', 'a']);
  expect((result.data as any[])[1].actions.hasReposted).toBe(true);
  expect(findMany.mock.calls[0][0].where).toEqual({ ...recommendationVisibility('user-1'), id: { in: ['c', 'deleted', 'a'] } });
  expect(findMany.mock.calls[1][0].where).toMatchObject({ userId: 'user-1', kind: 'REPOST' });
});
it('returns an empty feed when every recommendation has become unavailable', async () => {
  findMany.mockResolvedValue([]); expect(await getNewsfeed(['deleted'], user(), { feed: 'foryou' })).toEqual({ status: 200, data: [] });
});
it('hydrates parent repost actions without leaking credentials', async () => {
  const parent = { ...post({ id: 'parent' }), user: user() };
  findMany.mockResolvedValueOnce([{ ...post({ id: 'child', parentId: 'parent', parent }), user: user() }])
    .mockResolvedValueOnce([{ id: 'repost', parentId: 'parent' }]);
  const result = await getNewsfeed(['child'], user(), { feed: 'foryou' });
  expect((result.data as any[])[0].parent.actions.hasReposted).toBe(true);
  expect((result.data as any[])[0].author).not.toHaveProperty('password');
});
it('returns a generic feed error on database failure', async () => {
  findMany.mockRejectedValue(new Error('private db detail'));
  expect(await getNewsfeed(['a'], user(), { feed: 'foryou' })).toEqual({ status: 500, data: 'Error occurred trying to get feed, please try again' });
});
it('applies the same visibility filter to lightweight recommendation lookup', async () => {
  findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  expect(await getRecommendedPosts('u', ['b', 'a'])).toEqual({ status: 200, data: [{ id: 'b' }, { id: 'a' }] });
  expect(findMany.mock.calls[0][0].where).toEqual({ ...recommendationVisibility('u'), id: { in: ['b', 'a'] } });
});
it('handles lightweight recommendation database failure', async () => {
  findMany.mockRejectedValue(new Error('db')); expect((await getRecommendedPosts('u', [])).status).toBe(500);
});
