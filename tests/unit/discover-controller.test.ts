import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks, response } from './fixtures';
const deps = vi.hoisted(() => ({ trends: vi.fn(), cache: vi.fn() }));
vi.mock('@/services/v1/discover', () => ({ getTrendingTopics: deps.trends }));
vi.mock('@/interceptors', () => ({ storeDataInCacheMemory: deps.cache }));
import { getTrendController } from '@/controllers/v1/discover';
beforeEach(() => { resetMocks(deps); vi.spyOn(console, 'log').mockImplementation(() => {}); });
it('rejects malformed queries before searching', async () => {
  const res = response(); await getTrendController({ query: { limit: 'bad' } } as any, res); expect(res.statusCode).toBe(400); expect(deps.trends).not.toHaveBeenCalled();
});
it.each([{ query: {}, args: [null, 21, 10] }, { query: { country: 'NG', limit: '5' }, args: ['NG', 5, 10] }])('uses parsed query values without caching visibility-sensitive results', async ({ query, args }) => {
  const data = [{ trend: 'Kwonnet' }]; deps.trends.mockResolvedValue({ status: 200, data }); const req: any = { query }; const res = response();
  await getTrendController(req, res); expect(deps.trends).toHaveBeenCalledWith(...args); expect(res.body).toEqual(data);
  expect(deps.cache).not.toHaveBeenCalled();
  expect(res.headers).toMatchObject({ 'Cache-Control': 'private, no-store' });
});
it.each([404, 500])('propagates status %s without caching errors', async status => {
  deps.trends.mockResolvedValue({ status, data: 'Not found' }); const res = response(); await getTrendController({ query: {} } as any, res);
  expect(res.statusCode).toBe(status); expect(deps.cache).not.toHaveBeenCalled();
});
it('handles a service exception', async () => {
  deps.trends.mockRejectedValue(new Error('service unavailable')); const res = response(); await getTrendController({ query: {} } as any, res); expect(res.statusCode).toBe(400);
});
