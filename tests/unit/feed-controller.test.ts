import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
const deps = vi.hoisted(() => ({ recommend: vi.fn(), hydrate: vi.fn(), create: vi.fn(), gifters: vi.fn() }));
vi.mock('@/services/kwonrec', () => ({ getRecommendationResponse: deps.recommend }));
vi.mock('@/services/v1/posts', () => ({ getNewsfeed: deps.hydrate, createPost: deps.create, getPostGifters: deps.gifters }));
vi.mock('@/sseEmitter', () => ({ default: {} }));
vi.mock('@/utils/helpers', () => ({ getReqInfo: vi.fn() }));
import { getNewsfeedController, createPostController, getPostGiftersController } from '@/controllers/v1/posts';
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
  expect(res.headers).toMatchObject({ 'Cache-Control': 'private, no-store', 'X-Feed-Source': 'kwonrec' });
  expect(res.headers['Server-Timing']).toMatch(/^recommendations;dur=\d+, hydration;dur=\d+$/);
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

it.each(['following', 'friends', 'latest', 'trending'])('loads %s directly for the authenticated viewer without recommendations', async feed => {
  const request = req(); request.params.feedType = feed;
  request.query.page = '2'; request.query.userId = 'other-user';
  const res = response(); await getNewsfeedController(request, res);
  expect(deps.recommend).not.toHaveBeenCalled();
  expect(deps.hydrate).toHaveBeenCalledWith([], request.user, expect.objectContaining({ feed, page: 2 }));
  expect(res.headers).toMatchObject({ 'Cache-Control': 'private, no-store', 'X-Feed-Source': 'database' });
});
it.each([{ params: { feedType: 'unknown' } }, { query: { page: '0' } }, { query: { page: '1.5' } }, { query: { limit: '101' } }, { query: { limit: '-1' } }])('rejects unsupported tabs and invalid pagination: %j', changes => {
  const res = response(); return getNewsfeedController({ ...req(), ...changes }, res).then(() => {
    expect(res.statusCode).toBe(400); expect(deps.recommend).not.toHaveBeenCalled(); expect(deps.hydrate).not.toHaveBeenCalled();
  });
});


it('binds gift reporting to the authenticated owner and passes validated pagination', async () => {
  deps.gifters.mockResolvedValue({status: 200, data: {gifters: [], totalCoins: "0", hasMore: false}});
  const request = {params: {id: "post"}, query: {page: "2", limit: "10", viewerId: "attacker"}, user: {id: "owner"}} as any;
  const res = response();
  await getPostGiftersController(request, res);
  expect(deps.gifters).toHaveBeenCalledWith("post", "owner", 2, 10);
  expect(res.headers['Cache-Control']).toBe('private, no-store');
});
it.each([{page: "0"}, {limit: "51"}, {page: "1.5"}])('rejects invalid gift pagination %j before database reads', async query => {
  const res = response();
  await getPostGiftersController({params: {id: "post"}, query, user: {id: "owner"}} as any, res);
  expect(res.statusCode).toBe(400);
  expect(deps.gifters).not.toHaveBeenCalled();
});
