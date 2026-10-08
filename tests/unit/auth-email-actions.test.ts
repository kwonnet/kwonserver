import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {user} from './fixtures';
const mocks = vi.hoisted(() => ({enqueue: vi.fn(), disconnect: vi.fn(), hash: vi.fn(), db: {
 user: {findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn()},
 authEmailToken: {findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn()},
 emailMessage: {create: vi.fn(), upsert: vi.fn()}, userSession: {findMany: vi.fn(), updateMany: vi.fn()},
 pushNotification: {deleteMany: vi.fn()}, $queryRaw: vi.fn(), $transaction: vi.fn(),
}}));
vi.mock('@/db', () => ({default: mocks.db}));
vi.mock('@/services/email', () => ({enqueueEmailMessage: mocks.enqueue}));
vi.mock('@/utils/auth-session-sockets', () => ({disconnectAuthSession: mocks.disconnect}));
vi.mock('bcrypt', () => ({default: {hash: mocks.hash}}));
import {consumeAuthEmail, issueAuthEmail, requestAuthEmail} from '@/services/v1/auth';
import {decryptEmailToken, hashEmailToken} from '@/utils/auth-security';
const token = 'a'.repeat(43);
beforeEach(() => {
 vi.resetAllMocks();
 vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET', 'unit-test-secret-with-more-than-32-characters');
 vi.stubEnv('WEB_APP_URL', 'https://kwonnet.test');
 vi.stubEnv('EMAIL_VERIFICATION_TTL_MINUTES', ''); vi.stubEnv('PASSWORD_RESET_TTL_MINUTES', '');
 mocks.db.$transaction.mockImplementation(work => work(mocks.db));
 mocks.db.user.findFirst.mockResolvedValue(user({emailVerifiedAt: null}));
 mocks.db.user.findUniqueOrThrow.mockResolvedValue(user({emailVerifiedAt: null}));
 mocks.db.authEmailToken.create.mockImplementation(async ({data}) => data);
 mocks.db.authEmailToken.findUnique.mockResolvedValue({id: 'action', userId: 'user-1', purpose: 'VERIFY_EMAIL', usedAt: null, expiresAt: new Date(Date.now() + 60000)});
 mocks.db.authEmailToken.updateMany.mockResolvedValue({count: 1});
 mocks.db.emailMessage.create.mockResolvedValue({id: 'mail'}); mocks.db.emailMessage.upsert.mockResolvedValue({id: 'welcome'});
 mocks.db.userSession.findMany.mockResolvedValue([{id: 'session-1'}, {id: 'session-2'}]);
 mocks.hash.mockResolvedValue('new-hash');
});
afterEach(() => vi.unstubAllEnvs());
it.each([['VERIFY_EMAIL', 1440], ['PASSWORD_RESET', 30]] as const)('issues %s as an encrypted, expiring outbox action', async (purpose, minutes) => {
 const started = Date.now(); await issueAuthEmail(mocks.db as any, 'user-1', purpose);
 const data = mocks.db.authEmailToken.create.mock.calls[0][0].data;
 const secret = decryptEmailToken(data.encryptedToken);
 expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(data.tokenHash).toBe(hashEmailToken(secret));
 expect(JSON.stringify(data)).not.toContain(secret);
 expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(started + minutes * 60000);
 expect(mocks.db.authEmailToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({where: {userId: 'user-1', purpose, usedAt: null}}));
 expect(mocks.db.emailMessage.create).toHaveBeenCalledWith({data: {userId: 'user-1', eventKey: `auth:${data.id}`, kind: purpose, actionTokenId: data.id}});
});
it.each(['4', '10081', 'NaN', '5.5'])('rejects invalid token lifetime %s before persisting', async value => {
 vi.stubEnv('EMAIL_VERIFICATION_TTL_MINUTES', value);
 await expect(issueAuthEmail(mocks.db as any, 'user-1', 'VERIFY_EMAIL')).rejects.toThrow('lifetime');
 expect(mocks.db.authEmailToken.create).not.toHaveBeenCalled();
});
it('uses configured reset lifetime and rejects insecure app origins', async () => {
 vi.stubEnv('PASSWORD_RESET_TTL_MINUTES', '60');
 await issueAuthEmail(mocks.db as any, 'user-1', 'PASSWORD_RESET');
 expect(mocks.db.authEmailToken.create.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3590000);
 vi.stubEnv('WEB_APP_URL', 'http://kwonnet.test');
 await expect(issueAuthEmail(mocks.db as any, 'user-1', 'VERIFY_EMAIL')).rejects.toThrow('HTTPS');
});
it.each([null, user(), user({password: null})])('avoids issuing actions to unknown, already verified or passwordless accounts', async row => {
 mocks.db.user.findFirst.mockResolvedValue(row);
 expect((await requestAuthEmail('ada@example.test', 'VERIFY_EMAIL')).status).toBe(row && !row.password ? 400 : 202);
 expect(mocks.db.$transaction).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
});
it('locks the account and throttles resends without replacing the current token', async () => {
 mocks.db.authEmailToken.findFirst.mockResolvedValue({id: 'recent'});
 expect((await requestAuthEmail('ada@example.test', 'VERIFY_EMAIL')).status).toBe(202);
 expect(mocks.db.$queryRaw).toHaveBeenCalled(); expect(mocks.db.authEmailToken.create).not.toHaveBeenCalled();
});
it.each(['VERIFY_EMAIL', 'PASSWORD_RESET'] as const)('queues eligible %s actions and preserves the outbox if Redis fails', async purpose => {
 mocks.enqueue.mockRejectedValue(new Error('Redis unavailable'));
 expect((await requestAuthEmail('ada@example.test', purpose)).status).toBe(202);
 expect(mocks.enqueue).toHaveBeenCalledWith('mail'); expect(mocks.db.emailMessage.create).toHaveBeenCalledOnce();
});
it.each(['', 'short', '!'.repeat(43)])('rejects malformed tokens before querying: %s', async input => {
 expect((await consumeAuthEmail(input, 'VERIFY_EMAIL')).status).toBe(400); expect(mocks.db.$transaction).not.toHaveBeenCalled();
});
it.each([null, {purpose: 'PASSWORD_RESET'}, {purpose: 'VERIFY_EMAIL', usedAt: new Date()}, {purpose: 'VERIFY_EMAIL', expiresAt: new Date(0)}])('rejects unknown, wrong-purpose, used or expired links', async overrides => {
 const action = await mocks.db.authEmailToken.findUnique();
 mocks.db.authEmailToken.findUnique.mockResolvedValue(overrides ? {...action, ...overrides} : null);
 expect((await consumeAuthEmail(token, 'VERIFY_EMAIL')).status).toBe(400); expect(mocks.db.user.update).not.toHaveBeenCalled();
});
it.each([{deletedAt: new Date()}, {deactivatedAt: new Date()}, {status: 'BANNED'}])('does not verify unavailable accounts %j', async state => {
 mocks.db.user.findUniqueOrThrow.mockResolvedValue(user(state));
 expect((await consumeAuthEmail(token, 'VERIFY_EMAIL')).status).toBe(400); expect(mocks.db.authEmailToken.updateMany).not.toHaveBeenCalled();
});
it('does not apply an action when another request wins the claim', async () => {
 mocks.db.authEmailToken.updateMany.mockResolvedValue({count: 0});
 expect((await consumeAuthEmail(token, 'VERIFY_EMAIL')).status).toBe(400); expect(mocks.db.user.update).not.toHaveBeenCalled();
});
it.each([null, new Date('2025-01-01')])('verifies once and queues a deduplicated welcome while preserving prior verification %s', async emailVerifiedAt => {
 mocks.db.user.findUniqueOrThrow.mockResolvedValue(user({emailVerifiedAt}));
 expect((await consumeAuthEmail(token, 'VERIFY_EMAIL')).status).toBe(200);
 expect(mocks.db.user.update).toHaveBeenCalledWith({where: {id: 'user-1'}, data: {emailVerifiedAt: emailVerifiedAt || expect.any(Date)}});
 expect(mocks.db.emailMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({where: {eventKey: 'welcome:user-1'}, update: {}}));
 expect(mocks.enqueue).toHaveBeenCalledWith('welcome'); expect(mocks.disconnect).not.toHaveBeenCalled();
});
it.each([null, 'hash'])('rejects resets without an existing password or a new password (%s)', async password => {
 mocks.db.authEmailToken.findUnique.mockResolvedValue({id: 'action', userId: 'user-1', purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 60000)});
 mocks.db.user.findUniqueOrThrow.mockResolvedValue(user({password}));
 expect((await consumeAuthEmail(token, 'PASSWORD_RESET', password ? undefined : 'new-password')).status).toBe(400);
 expect(mocks.db.user.update).not.toHaveBeenCalled();
});
it.each([null, new Date('2025-01-01')])('resets passwords, revokes sessions and endpoints, and queues a security notice (%s)', async emailVerifiedAt => {
 mocks.db.authEmailToken.findUnique.mockResolvedValue({id: 'action', userId: 'user-1', purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + 60000)});
 mocks.db.user.findUniqueOrThrow.mockResolvedValue(user({emailVerifiedAt}));
 expect((await consumeAuthEmail(token, 'PASSWORD_RESET', 'new-password')).status).toBe(200);
 expect(mocks.hash).toHaveBeenCalledWith('new-password', 10);
 expect(mocks.db.user.update).toHaveBeenCalledWith({where: {id: 'user-1'}, data: {password: 'new-hash', passwordChangedAt: expect.any(Date), emailVerifiedAt: emailVerifiedAt || expect.any(Date)}});
 expect(mocks.db.userSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({data: {revokedAt: expect.any(Date), revokedReason: 'PASSWORD_RESET'}}));
 expect(mocks.db.pushNotification.deleteMany).toHaveBeenCalledWith({where: {userId: 'user-1'}});
 expect(mocks.disconnect.mock.calls).toEqual([['session-1'], ['session-2']]);
 expect(mocks.db.emailMessage.create).toHaveBeenCalledWith({data: {eventKey: 'reset-completed:action', userId: 'user-1', kind: 'PASSWORD_CHANGED'}});
 expect(mocks.enqueue).toHaveBeenCalledWith('mail');
});
