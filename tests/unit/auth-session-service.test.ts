import {beforeEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({disconnect: vi.fn(), db: {
 user: {findUnique: vi.fn(), findUniqueOrThrow: vi.fn()}, authIdentity: {upsert: vi.fn()}, userSession: {create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn()}, loginEvent: {create: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn()}, $transaction: vi.fn(),
}}));
vi.mock('@/db', () => ({default: mocks.db}));
vi.mock('@/utils/auth-session-sockets', () => ({disconnectAuthSession: mocks.disconnect}));
import {startAuthSession, validateAuthSession, touchAuthSession, listAuthSessions, listLoginEvents, revokeAuthSession, cleanupAuthHistory, sessionProvider} from '@/services/v1/auth';
const metadata = {device: {browser: 'Chrome', browserVersion: '129.0', os: 'Mac', osVersion: '10.15', type: 'desktop'}, location: {country: 'NG'}, ipAddress: '198.51.100.0/24', ipHash: null, metadataSource: 'SIGNED_WEB'};
beforeEach(() => {
 vi.resetAllMocks();
 mocks.db.$transaction.mockImplementation(work => typeof work === 'function' ? work(mocks.db) : Promise.all(work));
 mocks.db.user.findUnique.mockResolvedValue({passwordChangedAt: null, emailVerifiedAt: new Date()});
 mocks.db.user.findUniqueOrThrow.mockResolvedValue({googleSubject: 'sub'});
 mocks.db.authIdentity.upsert.mockImplementation(async args => ({id: 'identity', providerAccountId: args.create.providerAccountId}));
 mocks.db.userSession.create.mockImplementation(async args => ({id: args.data.id}));
});
it.each(['PASSWORD', 'GOOGLE', 'LEGACY'] as const)('records %s once with a session and a bounded audit record', async provider => {
 const id = await startAuthSession('user', provider, metadata);
 expect(id).toEqual(expect.any(String));
 expect(mocks.db.userSession.create).toHaveBeenCalledWith({data: expect.objectContaining({id, userId: 'user', provider, location: {country: 'NG'}, expiresAt: expect.any(Date), retainUntil: expect.any(Date)})});
 expect(mocks.db.loginEvent.create).toHaveBeenCalledWith({data: expect.objectContaining({sessionId: id, userId: 'user', provider, kind: 'SIGN_IN'})});
 if (provider === 'LEGACY') expect(mocks.db.authIdentity.upsert).not.toHaveBeenCalled();
 else expect(mocks.db.authIdentity.upsert).toHaveBeenCalledWith(expect.objectContaining({create: expect.objectContaining({providerAccountId: provider === 'GOOGLE' ? 'sub' : 'user'})}));
});
it('permits missing location but fails closed for missing or inconsistent provider identities', async () => {
 await startAuthSession('user', 'PASSWORD', {...metadata, location: null});
 mocks.db.user.findUniqueOrThrow.mockResolvedValue({googleSubject: null});
 await expect(startAuthSession('user', 'GOOGLE', metadata)).rejects.toThrow('identity unavailable');
 mocks.db.authIdentity.upsert.mockResolvedValue({id: 'identity', providerAccountId: 'wrong'});
 await expect(startAuthSession('user', 'PASSWORD', metadata)).rejects.toThrow('identity mismatch');
});
it('supports old tokens temporarily and rejects revoked, expired, missing or foreign sessions', async () => {
 expect(await validateAuthSession({id: 'user'})).toBe(true);
 mocks.db.userSession.findFirst.mockResolvedValue(null); expect(await validateAuthSession({id: 'user', sessionId: 'session'})).toBe(false);
 mocks.db.userSession.findFirst.mockResolvedValue({id: 'session'}); expect(await validateAuthSession({id: 'user', sessionId: 'session'})).toBe(true);
 expect(mocks.db.userSession.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({where: expect.objectContaining({id: 'session', userId: 'user', revokedAt: null, expiresAt: {gt: expect.any(Date)}, user: expect.objectContaining({deletedAt: null})})}));
 mocks.db.userSession.findFirst.mockRejectedValue(new Error('offline'));
 await expect(validateAuthSession({id: 'user', sessionId: 'session'})).rejects.toThrow('offline');
});
it('throttles last-active writes and ignores legacy sessions', async () => {
 await touchAuthSession({id: 'user'}); expect(mocks.db.userSession.updateMany).not.toHaveBeenCalled();
 await touchAuthSession({id: 'user', sessionId: 'session'});
 expect(mocks.db.userSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({where: expect.objectContaining({id: 'session', userId: 'user', lastActiveAt: {lt: expect.any(Date)}})}));
});
it('lists only owned sessions and audit events without exposing hashes/identity subjects', async () => {
 mocks.db.userSession.findMany.mockResolvedValue([{id: 'current'}, {id: 'other'}]); mocks.db.userSession.count.mockResolvedValue(43);
 expect(await listAuthSessions('user', 'current', 2)).toMatchObject({sessions: [{id: 'current', current: true}, {id: 'other', current: false}], hasMore: true});
 const args = mocks.db.userSession.findMany.mock.calls[0][0]; expect(args.where.userId).toBe('user'); expect(args.skip).toBe(21); expect(args.select).not.toHaveProperty('ipHash');
 mocks.db.loginEvent.findMany.mockResolvedValue([]); mocks.db.loginEvent.count.mockResolvedValue(0);
 expect(await listLoginEvents('user')).toEqual({events: [], page: 1, hasMore: false});
 expect(mocks.db.loginEvent.findMany.mock.calls[0][0].where.userId).toBe('user');
});
it('revokes only owned sessions and disconnects sockets only on successful mutation', async () => {
 mocks.db.userSession.updateMany.mockResolvedValue({count: 0}); expect(await revokeAuthSession('user', 'session')).toBe(false); expect(mocks.disconnect).not.toHaveBeenCalled();
 mocks.db.userSession.updateMany.mockResolvedValue({count: 1}); expect(await revokeAuthSession('user', 'session')).toBe(true); expect(mocks.disconnect).toHaveBeenCalledWith('session');
 expect(mocks.db.userSession.updateMany).toHaveBeenCalledWith({where: {id: 'session', userId: 'user', revokedAt: null}, data: {revokedAt: expect.any(Date), revokedReason: 'USER_REVOKED'}});
});
it('gets provider attribution from the existing session, never from a client claim', async () => {
 mocks.db.userSession.findFirst.mockResolvedValue({provider: 'GOOGLE'}); expect(await sessionProvider('user', 'session')).toBe('GOOGLE');
 mocks.db.userSession.findFirst.mockResolvedValue(null); await expect(sessionProvider('user', 'session')).rejects.toThrow('revoked');
});
it('purges expired telemetry using retention fields without deleting active sessions or users', async () => {
 mocks.db.loginEvent.deleteMany.mockResolvedValue({count: 2}); mocks.db.userSession.deleteMany.mockResolvedValue({count: 1});
 expect(await cleanupAuthHistory()).toEqual({events: 2, sessions: 1});
 expect(mocks.db.userSession.deleteMany).toHaveBeenCalledWith({where: {retainUntil: {lt: expect.any(Date)}, OR: [{revokedAt: {not: null}}, {expiresAt: {lt: expect.any(Date)}}]}});
});

it('rejects old sessionless tokens after a password change or account removal', async () => {
 mocks.db.user.findUnique.mockResolvedValue({passwordChangedAt: new Date()}); expect(await validateAuthSession({id: 'user'})).toBe(false);
 mocks.db.user.findUnique.mockResolvedValue(null); expect(await validateAuthSession({id: 'user'})).toBe(false);
});
