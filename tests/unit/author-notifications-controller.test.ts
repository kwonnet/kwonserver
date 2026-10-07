import {beforeEach, expect, it, vi} from 'vitest';
const deps = vi.hoisted(() => ({get: vi.fn(), set: vi.fn()}));
vi.mock('@/services/v1/notifications', () => ({getAuthorNotificationSubscription: deps.get, setAuthorNotificationSubscription: deps.set}));
import {authorNotificationSubscriptionController} from '@/controllers/v1/notifications';
beforeEach(() => {vi.clearAllMocks(); deps.get.mockResolvedValue({status: 200, data: {subscribed: true}}); deps.set.mockResolvedValue({status: 200, data: {subscribed: true}});});
const response = () => {const res:any = {setHeader: vi.fn(), status: vi.fn(), send: vi.fn()}; res.status.mockReturnValue(res); return res;};
it('binds the subscriber to authentication and keeps preferences out of shared caches', async () => {
  const res=response();
  await authorNotificationSubscriptionController({method: 'PUT', params: {authorId: 'author'}, user: {id: 'viewer'}, body: {enabled: true, subscriberId: 'victim'}} as any, res);
  expect(deps.set).toHaveBeenCalledWith('author', 'viewer', true);
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
});
it.each([{}, {enabled: 'false'}, {enabled: 1}, {enabled: null}])('rejects invalid preference input %j', async body => {
  const res=response();
  await authorNotificationSubscriptionController({method: 'PUT', params: {authorId: 'author'}, user: {id: 'viewer'}, body} as any, res);
  expect(res.status).toHaveBeenCalledWith(400); expect(deps.set).not.toHaveBeenCalled();
});
it('reads only the authenticated viewer preference', async () => {
  await authorNotificationSubscriptionController({method: 'GET', params: {authorId: 'author'}, user: {id: 'viewer'}} as any, response());
  expect(deps.get).toHaveBeenCalledWith('author','viewer');
});
it('reports database failures without a false success', async () => {
  deps.set.mockRejectedValue(new Error('DB unavailable')); const res=response();
  await authorNotificationSubscriptionController({method: 'PUT', params: {authorId: 'author'}, user: {id: 'viewer'}, body: {enabled: false}} as any, res);
  expect(res.status).toHaveBeenCalledWith(503);
});
