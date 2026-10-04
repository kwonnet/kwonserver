import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
const deps = vi.hoisted(() => ({ recommend: vi.fn(), hydrate: vi.fn(), create: vi.fn() }));
vi.mock('@/services/kwonrec', () => ({ getRecommendationResponse: deps.recommend }));
vi.mock('@/services/v1/posts', () => ({ getNewsfeed: deps.hydrate, createPost: deps.create }));
vi.mock('@/sseEmitter', () => ({ default: {} }));
vi.mock('@/utils/helpers', () => ({ getReqInfo: vi.fn() }));
import { getNewsfeedController, createPostController } from '@/controllers/v1/posts';
beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset());
  deps.recommend.mockResolvedValue({ data: { recommendations: [{ id: 'p2' }, { id: 'p1' }] } });
  deps.hydrate.mockResolvedValue({ status: 200, data: [{ id: 'p2' }] });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
const req = () => ({ params: { feedType: 'foryou' }, query: { limit: '10' }, user: { id: 'viewer' } } as any);
it('passes ranked IDs to authoritative hydration and disables shared caching', async () => {
  const res = response(); const request = req(); await getNewsfeedController(request, res);
  expect(deps.recommend).toHaveBeenCalledWith('viewer', 10, 1);
  expect(deps.hydrate).toHaveBeenCalledWith(['p2', 'p1'], request.user, expect.objectContaining({ feed: 'foryou', limit: 10, page: 1 }));
  expect(res.headers).toEqual({ 'Cache-Control': 'private, no-store', 'X-Feed-Source': 'kwonrec' });
  expect(res.body).toEqual([{ id: 'p2' }]);
});
it('forwards the requested page to recommendations and hydration', async () => {
  const request = req();
  request.query.page = '3';
  const res = response();
  await getNewsfeedController(request, res);
  expect(deps.recommend).toHaveBeenCalledWith('viewer', 10, 3);
  expect(deps.hydrate).toHaveBeenCalledWith(['p2', 'p1'], request.user,
    expect.objectContaining({ feed: 'foryou', limit: 10, page: 3 }));
  expect(res.statusCode).toBe(200);
});
it('marks chronological fallback responses', async () => {
  deps.recommend.mockResolvedValue({ data: { degraded: true, recommendations: [] } }); const res = response();
  await getNewsfeedController(req(), res); expect(res.headers['X-Feed-Source']).toBe('fallback');
});
it.each([{ params: {} }, { query: { limit: 'invalid' } }])('rejects invalid feed requests before recommendations', async changes => {
  const res = response(); await getNewsfeedController({ ...req(), ...changes }, res);
  expect(res.statusCode).toBe(400); expect(deps.recommend).not.toHaveBeenCalled();
});
it('forwards hydration rejection', async () => {
  deps.hydrate.mockResolvedValue({ status: 403, data: 'Forbidden' }); const res = response();
  await getNewsfeedController(req(), res); expect(res.statusCode).toBe(403); expect(res.body).toBe('Forbidden');
});
it('handles recommendation errors', async () => {
  deps.recommend.mockRejectedValue(new Error('unavailable')); const res = response();
  await getNewsfeedController(req(), res); expect(res.statusCode).toBe(400); expect(deps.hydrate).not.toHaveBeenCalled();
});
it('rejects invalid post creation without calling the service', async () => {
  const res = response(); await createPostController({ body: {}, user: { id: 'u' } } as any, res);
  expect(res.statusCode).toBe(400); expect(deps.create).not.toHaveBeenCalled();
});
it('binds valid post creation to the authenticated user', async () => {
  deps.create.mockResolvedValue({ status: 201, data: { id: 'p' } }); const res = response();
  const body = { isDraft: false, thread: [{ type: 'CONTENT', scope: 'ANYONE', media: [], content: 'Hello' }] };
  await createPostController({ body, user: { id: 'viewer' } } as any, res);
  expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({ isDraft: false }), 'viewer'); expect(res.statusCode).toBe(201);
});
