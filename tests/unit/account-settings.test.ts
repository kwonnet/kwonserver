import {beforeEach, expect, it, vi} from 'vitest';
const deps = vi.hoisted(() => ({db: {authEmailToken: {updateMany: vi.fn()}, user: {findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn()}, userSession: {findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn()}, authIdentity: {upsert: vi.fn()}, pushNotification: {deleteMany: vi.fn()}, $transaction: vi.fn(), $queryRaw: vi.fn()}, compare: vi.fn(), hash: vi.fn(), disconnect: vi.fn()}));
vi.mock('@/db', () => ({default: deps.db}));
vi.mock('bcrypt', () => ({default: {compare: deps.compare, hash: deps.hash}}));
vi.mock('@/utils/auth-session-sockets', () => ({disconnectAuthSession: deps.disconnect}));
import {getAccountSettings, updateAccountPassword} from '@/services/v1/auth';
import {PasswordUpdateSchema} from '@/schema/auth';
beforeEach(() => {
 vi.resetAllMocks(); deps.db.user.findUnique.mockResolvedValue({password: 'old-hash', googleSubject: 'google-sub'});
 deps.db.user.findUniqueOrThrow.mockResolvedValue({password: 'old-hash', username: 'owner'});
 deps.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false); deps.hash.mockResolvedValue('new-hash');
 deps.db.$transaction.mockImplementation(fn => fn(deps.db)); deps.db.userSession.findMany.mockResolvedValue([{id: 'other'}]);
});
it('returns safe account settings without the password hash', async () => {expect(await getAccountSettings('owner')).toEqual({username: 'owner', hasPassword: true});});
it('updates a verified password atomically and revokes only other sessions', async () => {
 expect(await updateAccountPassword('owner', 'current', {currentPassword: 'correct', newPassword: 'new-password'})).toEqual({status: 200, data: {updated: true, reloginRequired: false}});
 expect(deps.db.user.update).toHaveBeenCalledWith({where: {id: 'owner'}, data: {password: 'new-hash', passwordChangedAt: expect.any(Date)}});
 expect(deps.db.userSession.findMany).toHaveBeenCalledWith({where: {userId: 'owner', revokedAt: null, id: {not: 'current'}}, select: {id: true}});
 expect(deps.disconnect).toHaveBeenCalledWith('other');
});
it('rejects wrong or absent current passwords', async () => {
 deps.compare.mockReset().mockResolvedValue(false);
 expect((await updateAccountPassword('owner', 'current', {currentPassword: 'wrong', newPassword: 'new-password'})).status).toBe(403);
 expect((await updateAccountPassword('owner', 'current', {newPassword: 'new-password'})).status).toBe(403);
 expect(deps.db.user.update).not.toHaveBeenCalled();
});
it('rejects reusing the existing password', async () => {deps.compare.mockReset().mockResolvedValue(true); expect((await updateAccountPassword('owner', 'current', {currentPassword: 'same', newPassword: 'same'})).status).toBe(400);});
it('rejects missing accounts', async () => {deps.db.user.findUnique.mockResolvedValue(null); expect((await updateAccountPassword('owner', 'current', {newPassword: 'new-password'})).status).toBe(404);});
it.each([undefined, 'current'])('requires a recent Google session to set the first password: %s', async sessionId => {
 deps.db.user.findUnique.mockResolvedValue({password: null, googleSubject: 'google-sub'}); deps.db.userSession.findFirst.mockResolvedValue(null);
 expect((await updateAccountPassword('owner', sessionId, {newPassword: 'new-password'})).status).toBe(403);
});
it('does not allow a passwordless account without a linked Google identity to set a password', async () => {
 deps.db.user.findUnique.mockResolvedValue({password: null, googleSubject: null}); expect((await updateAccountPassword('owner', 'current', {newPassword: 'new-password'})).status).toBe(403);
});
it('sets a first password for a recently reauthenticated Google user', async () => {
 deps.db.user.findUnique.mockResolvedValue({password: null, googleSubject: 'google-sub'}); deps.db.user.findUniqueOrThrow.mockResolvedValue({password: null}); deps.db.userSession.findFirst.mockResolvedValue({id: 'current'});
 expect((await updateAccountPassword('owner', 'current', {newPassword: 'new-password'})).status).toBe(200);
 expect(deps.db.userSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({events: {some: {provider: 'GOOGLE', kind: 'SIGN_IN'}}})}));
 expect(deps.db.authIdentity.upsert).toHaveBeenCalledWith(expect.objectContaining({create: {userId: 'owner', provider: 'PASSWORD', providerAccountId: 'owner'}}));
});
it('rejects concurrent stale password checks without writing or revoking', async () => {
 deps.db.user.findUniqueOrThrow.mockResolvedValue({password: 'different-hash'});
 expect((await updateAccountPassword('owner', 'current', {currentPassword: 'correct', newPassword: 'new-password'})).status).toBe(409); expect(deps.db.user.update).not.toHaveBeenCalled();
});
it('revokes all tracked sessions when a legacy token has no current session ID', async () => {
 await updateAccountPassword('owner', undefined, {currentPassword: 'correct', newPassword: 'new-password'});
 expect(deps.db.userSession.findMany).toHaveBeenCalledWith({where: {userId: 'owner', revokedAt: null}, select: {id: true}});
});
it.each([{newPassword: 'short'}, {newPassword: 'x'.repeat(33)}, {newPassword: '🔒'.repeat(20)}, {newPassword: 'valid-password', userId: 'another'}])('rejects invalid or spoofed password inputs %j', input => {expect(PasswordUpdateSchema.safeParse(input).success).toBe(false);});
