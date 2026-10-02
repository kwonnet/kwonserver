import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ following: vi.fn(), posts: vi.fn(), request: vi.fn(), create: vi.fn() }));
vi.mock('@/db', () => ({ default: { follow: { findMany: mocks.following }, post: { findMany: mocks.posts } } }));
vi.mock('axios', () => ({ default: { create: mocks.create.mockReturnValue({ post: mocks.request }) } }));
import { getRecommendationResponse, recommendationVisibility } from '@/services/kwonrec';

beforeEach(() => {
  mocks.following.mockReset().mockResolvedValue([{ followingId: 'author-1' }]);
  mocks.posts.mockReset().mockResolvedValue([{ id: 'fallback-1' }]);
  mocks.request.mockReset().mockResolvedValue({ data: { recommendations: [{ id: 'post-1', score: 4 }] } });
});

describe('recommendation client', () => {
  it.each([[undefined, 21], ['5', 5], [5.9, 5], [-10, 1], [0, 1], [1000, 100], ['bad', 21], [Infinity, 21]])(
    'bounds requested limit %s to %s', async (input, limit) => {
      const result = await getRecommendationResponse('viewer', input);
      expect(mocks.request).toHaveBeenCalledWith('/v1/recommendations', {
        user_id: 'viewer', limit, following_author_ids: ['author-1'],
      });
      expect(result.data.recommendations[0].id).toBe('post-1');
      expect(mocks.posts).not.toHaveBeenCalled();
      expect(mocks.following).toHaveBeenCalledWith(expect.objectContaining({
        where: { followerId: 'viewer', status: 'ACCEPTED' }, take: 100,
      }));
    });
  it('accepts an empty recommendation list', async () => {
    mocks.request.mockResolvedValue({ data: { recommendations: [] } });
    expect((await getRecommendationResponse('viewer', 5)).data.recommendations).toEqual([]);
    expect(mocks.posts).not.toHaveBeenCalled();
  });
  it.each([undefined, {}, { recommendations: {} }, { recommendations: [null] },
    { recommendations: [{ id: 12 }] }, { recommendations: [{}] }])('falls back on malformed data %j', async data => {
    mocks.request.mockResolvedValue({ data });
    expect((await getRecommendationResponse('viewer', 4)).data).toEqual({
      degraded: true, recommendations: [{ id: 'fallback-1', score: 0 }],
    });
    expect(mocks.posts).toHaveBeenCalledWith({ where: recommendationVisibility('viewer'),
      select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 4 });
  });
  it.each(['following', 'request'])('falls back on %s failure', async dependency => {
    mocks[dependency as 'following' | 'request'].mockRejectedValue(new Error('timeout'));
    expect((await getRecommendationResponse('viewer', 1)).data.degraded).toBe(true);
  });
  it('propagates failure if the authoritative fallback database also fails', async () => {
    mocks.request.mockRejectedValue(new Error('timeout'));
    mocks.posts.mockRejectedValue(new Error('database unavailable'));
    await expect(getRecommendationResponse('viewer', 1)).rejects.toThrow('database unavailable');
  });
  it('excludes hidden, private, moderated, blocked and muted content including parent/root posts', () => {
    const filter: any = recommendationVisibility('viewer');
    expect(filter).toMatchObject({ status: 'PUBLISHED', scope: 'ANYONE', isHidden: false, deletedAt: null,
      disinterest: { none: { userId: 'viewer' } }, reports: { none: { userId: 'viewer' } },
      kind: { in: ['ROOT', 'REPOST', 'QUOTE'] },
      user: { isPrivate: false, status: 'ACTIVE', deletedAt: null, deactivatedAt: null, NOT: [
        { blockedUsers: { some: { blockedId: 'viewer' } } },
        { blockedBy: { some: { blockerId: 'viewer' } } },
        { mutedBy: { some: { muterId: 'viewer' } } },
      ] },
    });
    const { kind, AND, ...publicFilter } = filter;
    expect(AND).toEqual([
      { OR: [{ parentId: null }, { parent: { is: publicFilter } }] },
      { OR: [{ rootId: null }, { root: { is: publicFilter } }] },
    ]);
  });
});
