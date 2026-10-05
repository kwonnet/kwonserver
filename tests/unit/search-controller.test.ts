import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
const deps = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/services/v1/posts', () => ({ searchPosts: deps.search }));
vi.mock('@/sseEmitter', () => ({ default: {} }));
vi.mock('@/utils/helpers', () => ({ getReqInfo: vi.fn() }));
import { searchPostsController } from '@/controllers/v1/posts';
beforeEach(() => { deps.search.mockReset(); deps.search.mockResolvedValue({ posts: [], hasMore: false }); });
it('binds search to the request viewer, converts pagination and sends uncached collection responses', async () => {
  const user = { id: 'viewer' }, res = response();
  await searchPostsController({ query: { q: ' Solar Energy ', tab: 'latest', page: '2', limit: '21', viewerId: 'forged' }, user } as any, res);
  expect(deps.search).toHaveBeenCalledWith('Solar Energy', 'latest', 2, 21, user);
  expect(res.headers).toMatchObject({ 'Cache-Control': 'private, no-store' });
  expect(res.body).toEqual({ posts: [], hasMore: false });
});
it('supports public search with safe defaults', async () => {
  const res = response(); await searchPostsController({ query: { q: '#solar' } } as any, res);
  expect(deps.search).toHaveBeenCalledWith('#solar', 'top', 1, 20, undefined);
});
it.each([{ q: '' }, { q: 'a', tab: 'media' }, { q: 'a', page: '0' }, { q: 'a', limit: '500' }, { q: ['a', 'b'] }])('rejects invalid query parameters: %j', async query => {
  const res = response(); await searchPostsController({ query } as any, res);
  expect(res.statusCode).toBe(400); expect(deps.search).not.toHaveBeenCalled();
});
it('returns a safe error on database failure', async () => {
  deps.search.mockRejectedValue(new Error('secret database details')); const res = response();
  await searchPostsController({ query: { q: 'solar' } } as any, res);
  expect(res.statusCode).toBe(500); expect(res.body).toEqual({ error: 'Unable to load search results' });
});
