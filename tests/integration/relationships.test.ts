import { afterAll, beforeAll, expect, it } from 'vitest';
import prisma from '@/db';
import { followUser, blockUser, muteUser } from '@/services/v1/users';
import { UserFollowAction } from '@/types';
let actor: any;
beforeAll(async () => {
  actor = await prisma.user.create({ data: { id: 'integration-actor', name: 'Actor', username: 'integration_actor', email: 'actor@test.invalid' } });
  await prisma.user.create({ data: { id: 'integration-target', name: 'Target', username: 'integration_target', email: 'target@test.invalid', status: 'PRIVATE' } });
});
afterAll(async () => { await prisma.$disconnect(); });
it('persists a pending follow and its history, then cancels without unfollow history', async () => {
  const args = { senderId: actor.id, recipientId: 'integration-target', action: UserFollowAction.FOLLOW };
  expect((await followUser(args, actor)).status).toBe(200);
  expect(await prisma.follow.findFirst({ where: { followerId: actor.id } })).toMatchObject({ status: 'PENDING' });
  expect(await prisma.followHistory.count({ where: { followerId: actor.id, action: 'FOLLOW' } })).toBe(1);
  expect((await followUser({ ...args, action: UserFollowAction.CANCEL }, actor)).status).toBe(200);
  expect(await prisma.follow.count({ where: { followerId: actor.id } })).toBe(0);
  expect(await prisma.followHistory.count({ where: { followerId: actor.id, action: 'UNFOLLOW' } })).toBe(0);
});
it('rolls back follow and history when a later notification insert fails', async () => {
  await prisma.notification.deleteMany({ where: { senderId: actor.id } });
  await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test notification failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION test_reject_notification()`);
  try {
    const before = await prisma.followHistory.count();
    expect((await followUser({ senderId: actor.id, recipientId: 'integration-target', action: UserFollowAction.FOLLOW }, actor)).status).toBe(500);
    expect(await prisma.follow.count({ where: { followerId: actor.id } })).toBe(0);
    expect(await prisma.followHistory.count()).toBe(before);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_notification ON "Notification"');
    await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_notification()');
  }
});
it('toggles persistent block and mute records with matching histories', async () => {
  for (const run of [blockUser, muteUser]) {
    expect((await run('integration-target', actor)).status).toBe(200);
    expect((await run('integration-target', actor)).status).toBe(200);
  }
  expect(await prisma.blockUser.count({ where: { blockerId: actor.id } })).toBe(0);
  expect(await prisma.muteUser.count({ where: { muterId: actor.id } })).toBe(0);
  expect(await prisma.blockHistory.count({ where: { blockerId: actor.id } })).toBe(2);
  expect(await prisma.muteHistory.count({ where: { muterId: actor.id } })).toBe(2);
});
