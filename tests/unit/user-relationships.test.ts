import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { resetMocks, user } from './fixtures';
const deps = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  const tx = { user: model(), follow: model(), followHistory: model(), blockUser: model(), blockHistory: model(), muteUser: model(), muteHistory: model(), notification: model(), profileVisit: model() };
  return { tx, db: { $transaction: vi.fn(), followHistory: model(), blockHistory: model(), muteHistory: model(), user: model(), userReport: model(), userLocation: { upsert: vi.fn() } } };
});
vi.mock('@/db', () => ({ default: deps.db }));
vi.mock('@/db/models', () => ({ MessageModel: {} }));
vi.mock('@/utils/helpers', () => ({ cleanTextContent: vi.fn(), commentClassifier: vi.fn() }));
import * as users from '@/services/v1/users';
import { UserFollowAction } from '@/types';
const viewer = user({ id: 'u', name: 'Ada' });
const follow = (action: UserFollowAction) => users.followUser({ senderId: 'u', recipientId: 'r', action }, viewer);
beforeEach(() => {
  resetMocks(deps); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  deps.db.$transaction.mockImplementation(work => work(deps.tx));
  deps.tx.user.findUniqueOrThrow.mockResolvedValue(user({ id: 'r' }));
  deps.db.user.findUniqueOrThrow.mockResolvedValue(user({ id: 'r' }));
  deps.tx.blockUser.create.mockResolvedValue({ id: 'block' }); deps.tx.muteUser.create.mockResolvedValue({ id: 'mute' });
});
afterEach(() => vi.useRealTimers());
it.each(['ACTIVE', 'PRIVATE'])('follows a %s account with the right status and notification', async status => {
  deps.tx.user.findUniqueOrThrow.mockResolvedValue(user({ id: 'r', status }));
  const expected = status === 'PRIVATE' ? 'PENDING' : 'ACCEPTED';
  expect(await follow(UserFollowAction.FOLLOW)).toMatchObject({ status: 200, data: { status: expected } });
  expect(deps.tx.follow.create).toHaveBeenCalledWith({ data: { followerId: 'u', followingId: 'r', status: expected } });
  expect(deps.tx.followHistory.create).toHaveBeenCalledWith({ data: { followerId: 'u', followingId: 'r', action: 'FOLLOW' } });
  expect(deps.db.followHistory.create).not.toHaveBeenCalled();
  expect(deps.tx.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ senderId: 'u', recipientId: 'r', title: status === 'PRIVATE' ? 'New connection request' : 'New user follow' }) });
});
it('does not duplicate an existing follow notification', async () => {
  deps.tx.notification.findFirst.mockResolvedValue({ id: 'existing' }); await follow(UserFollowAction.FOLLOW); expect(deps.tx.notification.create).not.toHaveBeenCalled();
});
it('rejects following an unavailable account without writing', async () => {
  deps.tx.user.findUniqueOrThrow.mockResolvedValue(user({ status: 'SUSPENDED' })); expect((await follow(UserFollowAction.FOLLOW)).status).toBe(500);
  expect(deps.tx.follow.create).not.toHaveBeenCalled(); expect(deps.tx.followHistory.create).not.toHaveBeenCalled();
});
it.each(['ACTIVE', 'SUSPENDED'])('allows unfollowing a %s account and records history in the transaction', async status => {
  deps.tx.user.findUniqueOrThrow.mockResolvedValue(user({ status })); expect((await follow(UserFollowAction.UNFOLLOW)).status).toBe(200);
  expect(deps.tx.follow.delete).toHaveBeenCalledWith({ where: { followerId_followingId: { followerId: 'u', followingId: 'r' } } });
  expect(deps.tx.followHistory.create).toHaveBeenCalledWith({ data: { followerId: 'u', followingId: 'r', action: 'UNFOLLOW' } });
});
it('cancels a pending request without recording it as an unfollow', async () => {
  expect((await follow(UserFollowAction.CANCEL)).status).toBe(200); expect(deps.tx.follow.delete).toHaveBeenCalled();
  expect(deps.tx.followHistory.create).not.toHaveBeenCalled(); expect(deps.db.followHistory.create).not.toHaveBeenCalled();
});
it.each([UserFollowAction.ACCEPT, UserFollowAction.REJECT])('processes %s on the incoming relationship', async action => {
  expect((await follow(action)).status).toBe(200);
  const method = action === UserFollowAction.ACCEPT ? deps.tx.follow.update : deps.tx.follow.delete;
  expect(method).toHaveBeenCalledWith(expect.objectContaining({ where: { followerId_followingId: { followerId: 'r', followingId: 'u' } } }));
  expect(deps.tx.follow.create).not.toHaveBeenCalled();
});
it('fails the follow transaction if writing its history fails', async () => {
  deps.tx.followHistory.create.mockRejectedValue(new Error('db')); expect((await follow(UserFollowAction.FOLLOW)).status).toBe(500); expect(deps.tx.notification.create).not.toHaveBeenCalled();
});
it.each([false, true])('blocks an account and removes existing follow=%s', async existingFollow => {
  deps.tx.follow.findFirst.mockResolvedValue(existingFollow ? { id: 'follow' } : null);
  expect(await users.blockUser('r', viewer)).toMatchObject({ status: 200, data: { isBlocked: true } });
  expect(deps.tx.blockHistory.create).toHaveBeenCalledWith({ data: { blockerId: 'u', blockedId: 'r', action: 'BLOCK' } });
  expect(deps.db.blockHistory.create).not.toHaveBeenCalled();
  if (existingFollow) {
    expect(deps.tx.follow.delete).toHaveBeenCalledWith({ where: { id: 'follow' } });
    expect(deps.tx.followHistory.create).toHaveBeenCalledWith({ data: { followerId: 'u', followingId: 'r', action: 'UNFOLLOW' } });
  } else expect(deps.tx.follow.delete).not.toHaveBeenCalled();
});
it('unblocks an existing relationship without recreating follows', async () => {
  deps.tx.blockUser.findFirst.mockResolvedValue({ id: 'block' }); expect(await users.blockUser('r', viewer)).toMatchObject({ status: 200, data: { isBlocked: false } });
  expect(deps.tx.blockUser.delete).toHaveBeenCalledWith({ where: { id: 'block' } });
  expect(deps.tx.blockHistory.create).toHaveBeenCalledWith({ data: { blockerId: 'u', blockedId: 'r', action: 'UNBLOCK' } }); expect(deps.tx.follow.create).not.toHaveBeenCalled();
});
it.each([false, true])('toggles mute with existing=%s and writes history in the transaction', async existing => {
  deps.tx.muteUser.findFirst.mockResolvedValue(existing ? { id: 'mute' } : null);
  expect(await users.muteUser('r', viewer)).toMatchObject({ status: 200, data: { isMuted: !existing } });
  expect(deps.tx.muteHistory.create).toHaveBeenCalledWith({ data: { muterId: 'u', mutedId: 'r', action: existing ? 'UNMUTE' : 'MUTE' } });
  expect(deps.db.muteHistory.create).not.toHaveBeenCalled();
});
it.each(['follow', 'block', 'mute', 'visit'])('handles %s transaction failure', async name => {
  deps.db.$transaction.mockRejectedValue(new Error('db'));
  const result = name === 'follow' ? await follow(UserFollowAction.FOLLOW) : name === 'block' ? await users.blockUser('r', viewer) : name === 'mute' ? await users.muteUser('r', viewer) : await users.profileVisit({ userId: 'r', sessionId: 'session' } as any, viewer);
  expect(result.status).toBe(500);
});
it.each([false, true])('records each profile visit, notifying only for first visit: existing=%s', async existing => {
  deps.tx.profileVisit.findFirst.mockResolvedValue(existing ? { id: 'visit' } : null);
  const arg: any = { userId: 'r', sessionId: 'session', device: {}, meta: null };
  expect((await users.profileVisit(arg, viewer)).status).toBe(200);
  expect(deps.tx.profileVisit.create).toHaveBeenCalledWith({ data: { ...arg, visitorId: 'u' } }); expect(deps.tx.notification.create).toHaveBeenCalledTimes(existing ? 0 : 1);
});
it.each([{ age: 86400000 - 1, status: 400 }, { age: 86400000, status: 200 }, { age: 86400001, status: 200 }])('enforces the 24-hour report cooldown at $age ms', async ({ age, status }) => {
  deps.db.userReport.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - age) });
  const body: any = { id: 'r', code: 'SPAM', message: 'details', meta: {} };
  expect((await users.reportUser(body, viewer)).status).toBe(status);
  if (status === 400) expect(deps.db.userReport.create).not.toHaveBeenCalled();
  else expect(deps.db.userReport.create).toHaveBeenCalledWith({ data: { reportedId: 'r', reporterId: 'u', reason: 'SPAM', message: 'details', meta: {} } });
});
it('handles report persistence failure', async () => {
  deps.db.userReport.create.mockRejectedValue(new Error('db')); expect((await users.reportUser({ id: 'r' } as any, viewer)).status).toBe(500);
});
it('upserts location for the specified user', async () => {
  const location = { latitude: 6.5, longitude: 3.4 }; deps.db.userLocation.upsert.mockResolvedValue(location);
  expect(await users.logUserLocation('u', location)).toEqual({ status: 200, data: location });
  expect(deps.db.userLocation.upsert).toHaveBeenCalledWith({ where: { userId: 'u' }, update: location, create: { userId: 'u', ...location } });
});
it('handles location persistence failure', async () => {
  deps.db.userLocation.upsert.mockRejectedValue(new Error('db')); expect((await users.logUserLocation('u', { latitude: 0, longitude: 0 })).status).toBe(500);
});
it.each([
  { owner: false, current: 'ACTIVE', next: 'BANNED' },
  { owner: false, current: 'ACTIVE', next: 'ACTIVE' },
  { owner: true, current: 'BANNED', next: 'ACTIVE' },
  { owner: true, current: 'SUSPENDED', next: 'ACTIVE' },
  { owner: true, current: 'ACTIVE', next: 'BANNED' },
])('rejects unauthorized account status changes: %j', async ({ owner, current, next }) => {
  const id = owner ? 'u' : 'r'; deps.db.user.findUniqueOrThrow.mockResolvedValue(user({ id, status: current }));
  expect((await users.updateAccountStatus({ userId: id, status: next as any }, viewer)).status).toBe(403);
  expect(deps.db.user.update).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'SUPER'])('allows %s moderation', async role => {
  expect((await users.updateAccountStatus({ userId: 'r', status: 'SUSPENDED' }, user({ role }))).status).toBe(200);
});
it.each(['ACTIVE', 'PRIVATE', 'DEACTIVATED'])('allows an unrestricted owner to set status %s', async status => {
  deps.db.user.findUniqueOrThrow.mockResolvedValue(user({ id: 'u' }));
  expect((await users.updateAccountStatus({ userId: 'u', status: status as any }, viewer)).status).toBe(200);
});
