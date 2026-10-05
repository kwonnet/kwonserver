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
  const make = (id: string) => ({ ...post({ id }), user: user(), replies: id === 'a' ? [{ id: 'repost', parentId: 'a' }] : [] });
  findMany.mockResolvedValueOnce([make('a'), make('c')]);
  const result = await getNewsfeed(['c', 'deleted', 'a'], user(), { feed: 'foryou' });
  expect(result.status).toBe(200);
  expect((result.data as any[]).map(p => p.id)).toEqual(['c', 'a']);
  expect((result.data as any[])[1].actions.hasReposted).toBe(true);
  expect(findMany.mock.calls[0][0].where).toEqual({ ...recommendationVisibility('user-1'), id: { in: ['c', 'deleted', 'a'] } });
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findMany.mock.calls[0][0]).toMatchObject({ relationLoadStrategy: 'join', include: { replies: { where: { userId: 'user-1', kind: 'REPOST', status: 'PUBLISHED', deletedAt: null } } } });
});
it('returns an empty feed when every recommendation has become unavailable', async () => {
  findMany.mockResolvedValue([]); expect(await getNewsfeed(['deleted'], user(), { feed: 'foryou' })).toEqual({ status: 200, data: [] });
});
it('hydrates parent repost actions without leaking credentials', async () => {
  const parent = { ...post({ id: 'parent' }), user: user(), replies: [{ id: 'repost', parentId: 'parent' }] };
  findMany.mockResolvedValueOnce([{ ...post({ id: 'child', parentId: 'parent', parent }), user: user() }]);
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

it('skips hydration completely for empty rankings', async () => {
  expect(await getNewsfeed([], user(), { feed: 'foryou' })).toEqual({ status: 200, data: [] });
  expect(findMany).not.toHaveBeenCalled();
});

it.each(['following', 'friends', 'latest', 'trending'])('queries %s with real pagination even when no recommendation IDs exist', async feed => {
  findMany.mockResolvedValue([]);
  await getNewsfeed([], user(), { feed, page: 3, limit: 10 });
  const query = findMany.mock.calls[0][0];
  expect(query.take).toBe(10); expect(query.skip).toBe(20); expect(query.where.id).toBeUndefined();
  expect(query.orderBy.at(-1)).toEqual({ id: 'desc' });
  if (feed === 'following' || feed === 'friends') {
    const relation = query.where.AND[1].user;
    expect(relation.followers).toEqual({ some: { followerId: 'user-1', status: 'ACCEPTED' } });
    if (feed === 'friends') expect(relation.following).toEqual({ some: { followingId: 'user-1', status: 'ACCEPTED' } });
    else expect(relation.following).toBeUndefined();
    expect(query.where.AND[2].OR[1].parent.is.user.NOT).toEqual(expect.arrayContaining([
      { blockedBy: { some: { blockerId: 'user-1' } } }, { mutedBy: { some: { muterId: 'user-1' } } },
    ]));
  }
  if (feed === 'trending') {
    expect(query.orderBy[0]).toEqual({ totalLikes: 'desc' });
    expect(query.where.createdAt.gte).toBeInstanceOf(Date);
  }
});
it('keeps database order for chronological tabs rather than recommendation order', async () => {
  findMany.mockResolvedValue([{ ...post({ id: 'new' }), user: user() }, { ...post({ id: 'old' }), user: user() }]);
  const result = await getNewsfeed(['old', 'new'], user(), { feed: 'latest' });
  expect((result.data as any[]).map(p => p.id)).toEqual(['new', 'old']);
});
