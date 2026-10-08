import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks, user } from './fixtures';
const db = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() });
  return { user: model(), notification: model(), subscription: model(), userTaskSettings: model(), gameAchievement: model() };
});
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/utils/helpers', () => ({ cleanTextContent: vi.fn(), commentClassifier: vi.fn(), AppError: class extends Error {} }));
import * as service from '@/services/v1/users';
beforeEach(() => resetMocks(db));
it('returns only public search fields and searches by ID, username or email', async () => {
  db.user.findFirst.mockResolvedValue(user({ avatar: 'image' }));
  const result = await service.searchUser('ada'); expect(result).toEqual({ status: 200, data: { id: 'user-1', username: 'ada', name: 'Ada', avatar: 'image' } });
  expect(db.user.findFirst.mock.calls[0][0].where.OR).toHaveLength(3); expect(result.data).not.toHaveProperty('password');
});
it.each([{ account: null, status: 404 }, { account: user({ status: 'SUSPENDED' }), status: 400 }, { account: user({ status: 'BANNED' }), status: 400 }])('rejects missing/unavailable search results', async ({ account, status }) => {
  db.user.findFirst.mockResolvedValue(account); expect((await service.searchUser('ada')).status).toBe(status);
});
it('returns public paginated search results', async () => {
  db.user.findMany.mockResolvedValue([user()]); const result = await service.searchUsers({ query: 'ada', page: 3, limit: 10 });
  expect(result.status).toBe(200); expect((result.data as any[])[0]).not.toHaveProperty('email');
  expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
});
it('reports empty searches', async () => { db.user.findMany.mockResolvedValue([]); expect((await service.searchUsers({ query: 'none', page: 1, limit: 10 })).status).toBe(200); });
it.each([{ rows: [], status: 404 }, { rows: [{ id: 'n' }], status: 200 }])('scopes notification pagination to the recipient', async ({ rows, status }) => {
  db.notification.findMany.mockResolvedValue(rows); expect((await service.getUserNotifications(user(), { page: 2, limit: 10 })).status).toBe(status);
  expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recipientId: 'user-1' }), skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }] }));
});
it('updates notification receipts only for the recipient', async () => {
  expect(await service.updateUserNotifications({ recipientId: 'u', isRead: true })).toEqual({ status: 200, data: null });
  expect(db.notification.updateMany).toHaveBeenCalledWith({ where: { recipientId: 'u' }, data: { recipientId: 'u', isRead: true } });
});
for (const [name, method, model] of [['subscription', service.getUserActiveSubscription, db.subscription], ['task settings', service.getUserTaskSettings, db.userTaskSettings]] as const) {
  it.each([false, true])(`loads ${name}, found=%s`, async found => {
    model.findFirst.mockResolvedValue(found ? { id: 'record' } : null);
    expect((await method('u')).status).toBe(found ? 200 : 404);
    expect(model.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u' }) }));
  });
  it(`handles ${name} lookup failures`, async () => { model.findFirst.mockRejectedValue(new Error('private')); expect((await method('u')).status).toBe(500); });
}
it.each([{ catId: null, year: null }, { catId: 'c', year: 2026 }])('filters achievements by player with optional category/year', async filter => {
  db.gameAchievement.findMany.mockResolvedValue([{ id: 'achievement' }]);
  expect((await service.getUserAchievements({ userId: 'u', page: 2, limit: 10, ...filter } as any)).status).toBe(200);
  const query = db.gameAchievement.findMany.mock.calls[0][0]; expect(query).toMatchObject({ skip: 10, take: 10 });
  expect(query.where.AND).toContainEqual({ playerId: 'u' });
  if (filter.year) expect(query.where.AND).toContainEqual({ createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } });
  if (filter.catId) expect(query.where.AND).toContainEqual({ catId: 'c' });
});
it('returns not found for empty achievements', async () => {
  db.gameAchievement.findMany.mockResolvedValue([]); expect((await service.getUserAchievements({ userId: 'u', page: 1, limit: 10 } as any)).status).toBe(404);
});
it.each(['search', 'searches', 'notifications', 'receipts', 'achievements'])('handles %s database failure', async kind => {
  const error = new Error('private'); db.user.findFirst.mockRejectedValue(error); db.user.findMany.mockRejectedValue(error);
  db.notification.findMany.mockRejectedValue(error); db.notification.updateMany.mockRejectedValue(error); db.gameAchievement.findMany.mockRejectedValue(error);
  const result = kind === 'search' ? await service.searchUser('u') : kind === 'searches' ? await service.searchUsers({ query: 'q', page: 1, limit: 10 }) : kind === 'notifications' ? await service.getUserNotifications(user(), { page: 1, limit: 10 }) : kind === 'receipts' ? await service.updateUserNotifications({ recipientId: 'u' }) : await service.getUserAchievements({ userId: 'u', page: 1, limit: 10 } as any);
  expect(result.status).toBe(500); expect(result.data).not.toContain('private');
});

it('messaging search includes private profiles but excludes self and blocks without exposing private bio', async () => {
  db.user.findMany.mockResolvedValue([user({isPrivate: true, bio: 'private biography'})]);
  const result = await service.searchUsers({query: 'ada', page: 1, limit: 20, viewerId: 'viewer', messaging: true});
  const args = db.user.findMany.mock.calls[0][0];
  expect(args.where).not.toHaveProperty('isPrivate');
  expect(args.where).toMatchObject({status: 'ACTIVE', deletedAt: null, deactivatedAt: null});
  expect(args.where.NOT).toEqual(expect.arrayContaining([
    {id: 'viewer'}, {blockedUsers: {some: {blockedId: 'viewer'}}}, {blockedBy: {some: {blockerId: 'viewer'}}},
  ]));
  expect(args.select.bio).toBe(false);
  expect((result.data as any[])[0].bio).toBeNull();
  await service.searchUsers({query: 'ada', page: 1, limit: 20, viewerId: 'viewer'});
  expect(db.user.findMany.mock.calls[1][0].where.isPrivate).toBe(false);
});
it('messaging search requires an authenticated viewer', async () => {
  expect((await service.searchUsers({query: 'ada', page: 1, limit: 20, messaging: true})).status).toBe(401);
  expect(db.user.findMany).not.toHaveBeenCalled();
});
