import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('@/utils/webpush', () => ({ default: {} }));
import prisma from '@/db';
import { updatePostReactions, updatePostBookmarks, deletePost, restorePost } from '@/services/v1/posts';
let author: any;
let reader: any;
beforeAll(async () => {
  author = await prisma.user.create({ data: { id: 'post-author', name: 'Author', username: 'post_author', email: 'post_author@test.invalid' } });
  reader = await prisma.user.create({ data: { id: 'post-reader', name: 'Reader', username: 'post_reader', email: 'post_reader@test.invalid' } });
  await prisma.post.create({ data: { id: 'integration-post', userId: author.id, content: 'Hello', type: 'CONTENT', kind: 'ROOT' } });
});
afterAll(async () => prisma.$disconnect());
it('toggles likes and bookmarks with persisted counters and deduplicated notifications', async () => {
  for (const run of [() => updatePostReactions('integration-post', reader), () => updatePostBookmarks('integration-post', reader.id)]) {
    expect((await run()).status).toBe(200); expect((await run()).status).toBe(200);
  }
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ totalLikes: 0n, totalBookmarks: 0n });
  expect(await prisma.likedPost.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect(await prisma.bookmark.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect(await prisma.notification.count({ where: { postId: 'integration-post', action: 'LIKE' } })).toBe(1);
});
it('denies another user deletion, then persists owner deletion/restoration with audit history', async () => {
  expect((await deletePost('integration-post', reader)).status).toBe(500);
  expect(await prisma.postHistory.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect((await deletePost('integration-post', author)).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ status: 'DELETED', deletedAt: expect.any(Date) });
  expect((await restorePost('integration-post', author)).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ status: 'PUBLISHED', deletedAt: null });
  expect(await prisma.postHistory.count({ where: { postId: 'integration-post' } })).toBe(2);
});
it('rolls back a new like if its counter update fails', async () => {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_post_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test post failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_post_update BEFORE UPDATE ON "Post" FOR EACH ROW EXECUTE FUNCTION test_reject_post_update()`);
  try {
    expect((await updatePostReactions('integration-post', reader)).status).toBe(500);
    expect(await prisma.likedPost.count({ where: { postId: 'integration-post' } })).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_post_update ON "Post"');
    await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_post_update()');
  }
});
