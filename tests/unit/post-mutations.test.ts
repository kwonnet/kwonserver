import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks, user } from './fixtures';
const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  return { post: model(), likedPost: model(), bookmark: model(), notification: model(), postHistory: model(), postShare: model(), $transaction: vi.fn() };
});
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/utils/webpush', () => ({ default: {} }));
vi.mock('@/db/clickhouse', () => ({ clickHouseClient: {} }));
vi.mock('@/db/timescaleDb', () => ({ prismaAnalytics: {}, sequelizeAnalytics: {} }));
vi.mock('@/utils/helpers', () => ({ AppError: class extends Error {} }));
import * as posts from '@/services/v1/posts';
const actor = user({ id: 'actor' });
beforeEach(() => {
  resetMocks(db); db.$transaction.mockImplementation(work => typeof work === 'function' ? work(db) : Promise.all(work));
  db.post.findUniqueOrThrow.mockResolvedValue({ id: 'p', user: { id: 'actor', role: 'USER' } });
  db.post.update.mockImplementation(async ({ data }) => ({ id: 'p', kind: 'POST', ...data }));
  db.likedPost.create.mockResolvedValue({ id: 'like', post: { id: 'p', userId: 'author', kind: 'POST' } });
});
it.each([false, true])('toggles bookmarks with matching counters: existing=%s', async existing => {
  db.bookmark.findUnique.mockResolvedValue(existing ? { id: 'b' } : null);
  expect(await posts.updatePostBookmarks('p', 'actor')).toMatchObject({ status: 200, data: { isBookmarked: !existing } });
  expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { totalBookmarks: existing ? { decrement: 1 } : { increment: 1 } } });
  if (existing) expect(db.bookmark.delete).toHaveBeenCalledWith({ where: { id: 'b' } });
  else expect(db.bookmark.create).toHaveBeenCalledWith({ data: { postId: 'p', userId: 'actor' } });
});
it.each(['POST', 'REPLY'])('notifies another author of a new %s reaction', async kind => {
  db.likedPost.create.mockResolvedValue({ id: 'like', post: { id: 'p', userId: 'author', kind } });
  expect(await posts.updatePostReactions('p', actor)).toMatchObject({ status: 200, data: { liked: true, data: { id: 'like' } } });
  expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { totalLikes: { increment: 1 } } });
  expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientId: 'author', action: 'LIKE', message: expect.stringContaining(kind === 'REPLY' ? 'comment' : 'post') }) });
});
it.each(['self', 'existing'])('does not notify for %s reaction', async scenario => {
  if (scenario === 'self') db.likedPost.create.mockResolvedValue({ id: 'like', post: { id: 'p', userId: 'actor' } });
  else db.notification.findFirst.mockResolvedValue({ id: 'n' });
  await posts.updatePostReactions('p', actor); expect(db.notification.create).not.toHaveBeenCalled();
});
it('removes a reaction and decrements its counter without notification', async () => {
  const like = { id: 'like', post: { id: 'p', userId: 'author' } }; db.likedPost.findUnique.mockResolvedValue(like); db.likedPost.delete.mockResolvedValue(like);
  expect(await posts.updatePostReactions('p', actor)).toMatchObject({ status: 200, data: { liked: false } });
  expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { totalLikes: { decrement: 1 } } }); expect(db.notification.create).not.toHaveBeenCalled();
});
for (const [name, run, action, status] of [['delete', posts.deletePost, 'DELETE', 'DELETED'], ['restore', posts.restorePost, 'RESTORE', 'PUBLISHED']] as const) {
  it.each(['USER', 'ADMIN', 'SUPER'])(`${name} refuses a non-owner even when the post author is %s`, async role => {
    db.post.findUniqueOrThrow.mockResolvedValue({ id: 'p', user: { id: 'someone-else', role } });
    expect((await run('p', actor)).status).toBe(500); expect(db.post.update).not.toHaveBeenCalled();
  });
  it.each(['USER', 'ADMIN', 'SUPER'])(`${name} permits the owner with role %s`, async role => {
    expect((await run('p', user({ id: 'actor', role }))).status).toBe(200);
    expect(db.postHistory.create).toHaveBeenCalledWith({ data: { postId: 'p', userId: 'actor', action } });
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status, deletedAt: action === 'DELETE' ? expect.any(Date) : null } });
  });
  it.each(['ADMIN', 'SUPER'])(`${name} permits a %s moderator`, async role => {
    db.post.findUniqueOrThrow.mockResolvedValue({ id: 'p', user: { id: 'other', role: 'USER' } });
    expect((await run('p', user({ id: 'moderator', role }))).status).toBe(200);
  });
  it.each([['REPLY', 'totalReplies'], ['QUOTE', 'totalQuotes'], ['REPOST', 'totalReposts']])(`${name} updates parent %s counters`, async (kind, counter) => {
    db.post.update.mockResolvedValueOnce({ id: 'p', parentId: 'parent', kind, status }); await run('p', actor);
    expect(db.post.update).toHaveBeenLastCalledWith({ where: { id: 'parent' }, data: { [counter]: { [action === 'DELETE' ? 'decrement' : 'increment']: 1 } } });
  });
}
it.each(['reaction', 'bookmark', 'delete', 'restore', 'share'])('handles %s transaction failures', async kind => {
  db.$transaction.mockRejectedValue(new Error('private'));
  const result = kind === 'reaction' ? await posts.updatePostReactions('p', actor) : kind === 'bookmark' ? await posts.updatePostBookmarks('p', 'actor') : kind === 'delete' ? await posts.deletePost('p', actor) : kind === 'restore' ? await posts.restorePost('p', actor) : await posts.createAndUpdatePostShares({ postId: 'p' } as any);
  expect(result.status).toBe(500); expect(result.data).not.toContain('private');
});
it('records shares and increments the counter in one transaction', async () => {
  const data: any = { postId: 'p', userId: 'actor', sessionId: 's', timestamp: 'now' };
  expect(await posts.createAndUpdatePostShares(data)).toEqual({ status: 200, data: { id: 'p', userId: 'actor' } });
  expect(db.postShare.create).toHaveBeenCalledWith({ data }); expect(db.$transaction.mock.calls[0][0]).toHaveLength(2);
});
