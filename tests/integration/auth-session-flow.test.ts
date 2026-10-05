import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
const verify = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({OAuth2Client: class {verifyIdToken = verify;}}));
vi.mock('@/utils/webpush', () => ({default: {}}));
import {createUser, loginUser, loginGoogleUser, startAuthSession, validateAuthSession, touchAuthSession, revokeAuthSession, listAuthSessions, listLoginEvents, cleanupAuthHistory} from '@/services/v1/auth';
const db = new PrismaClient();
const prefix = 'login-security-fixture-';
let owner = '', googleOnly = '', sid = '';
const metadata = {device: {browser: 'Chrome', browserVersion: '129.0', os: 'Mac', osVersion: '10.15', type: 'desktop'}, location: {country: 'NG', city: 'Lagos'}, ipAddress: '198.51.100.0/24', ipHash: null, metadataSource: 'SIGNED_WEB'};
beforeAll(async () => {
 vi.stubEnv('AUTH_GOOGLE_ID', 'integration-google-client');
 const signup = await createUser({email: prefix + 'password@gmail.com', name: 'Password user', password: 'test-only-password'});
 expect(signup.status).toBe(200); owner = (signup.data as any).id;
});
afterAll(async () => {
 await db.user.deleteMany({where: {email: {startsWith: prefix}}});
 await db.country.deleteMany({where: {id: {startsWith: prefix}}});
 await db.continent.deleteMany({where: {id: {startsWith: prefix}}});
 await db.$disconnect(); vi.unstubAllEnvs();
});
it('preserves the password account/wallet when Google links and records the verified provider', async () => {
 expect((await loginUser({email: prefix + 'password@gmail.com', password: 'test-only-password'})).status).toBe(200);
 const original = await db.user.findUniqueOrThrow({where: {id: owner}, include: {wallet: true}});
 verify.mockResolvedValue({getPayload: () => ({sub: prefix + 'google-sub', email: prefix + 'password@gmail.com', name: 'Google user', email_verified: true, picture: 'https://avatar.invalid/google.png'})});
 expect((await loginGoogleUser('mock-verified-token')).data).toMatchObject({id: owner});
 sid = await startAuthSession(owner, 'GOOGLE', metadata);
 const current = await db.user.findUniqueOrThrow({where: {id: owner}, include: {wallet: true}});
 expect(current.password).toBe(original.password); expect(current.wallet!.id).toBe(original.wallet!.id);
 expect(await db.authIdentity.findUnique({where: {userId_provider: {userId: owner, provider: 'GOOGLE'}}})).toMatchObject({providerAccountId: prefix + 'google-sub'});
 expect(await db.loginEvent.findMany({where: {userId: owner}})).toHaveLength(1);
 expect(await validateAuthSession({id: owner, sessionId: sid})).toBe(true);
 await touchAuthSession({id: owner, sessionId: sid});
 expect(await db.loginEvent.count({where: {userId: owner}})).toBe(1); // Refresh is not a new login.
});
it('creates new Google users through normal transactional registration and keeps secrets out of telemetry', async () => {
 verify.mockResolvedValue({getPayload: () => ({sub: prefix + 'new-sub', email: prefix + 'new@gmail.com', name: 'New Google', email_verified: true, picture: 'https://avatar.invalid/new.png'})});
 const result = await loginGoogleUser('mock-verified-token'); expect(result.status).toBe(200); googleOnly = (result.data as any).id;
 const account = await db.user.findUniqueOrThrow({where: {id: googleOnly}, include: {wallet: true}});
 expect(account).toMatchObject({name: 'New Google', avatar: 'https://avatar.invalid/new.png', password: null}); expect(account.wallet).not.toBeNull();
 expect(await db.transaction.count({where: {userId: googleOnly, category: 'COIN_RECEIVED'}})).toBe(1);
 const newSid = await startAuthSession(googleOnly, 'GOOGLE', {...metadata, location: null});
 expect((await listAuthSessions(googleOnly, newSid)).sessions).toHaveLength(1);
 expect((await listLoginEvents(googleOnly)).events).toHaveLength(1);
 const records = JSON.stringify(await db.loginEvent.findMany({where: {userId: googleOnly}}));
 expect(records).not.toContain('mock-verified-token'); expect(records).not.toContain('latitude'); expect(records).not.toContain('198.51.100.12');
 expect((await listAuthSessions(owner)).sessions.every(session => session.id !== newSid)).toBe(true);
});
it('revocation is owner-scoped, idempotent and immediately invalidates the signed session ID', async () => {
 expect(await revokeAuthSession(googleOnly, sid)).toBe(false); expect(await validateAuthSession({id: owner, sessionId: sid})).toBe(true);
 expect(await revokeAuthSession(owner, sid)).toBe(true); expect(await revokeAuthSession(owner, sid)).toBe(false);
 expect(await validateAuthSession({id: owner, sessionId: sid})).toBe(false);
 expect(await validateAuthSession({id: googleOnly, sessionId: sid})).toBe(false);
 expect((await listAuthSessions(owner)).sessions).toEqual([]);
 expect((await listLoginEvents(owner)).events).toHaveLength(1); // Revocation preserves the audit record.
});
it('legacy upgrade attribution remains unknown, and expiry/retention cannot resurrect sessions', async () => {
 const legacy = await startAuthSession(owner, 'LEGACY', metadata, 'LEGACY_UPGRADE');
 expect(await db.userSession.findUnique({where: {id: legacy}})).toMatchObject({provider: 'LEGACY', identityId: null});
 await db.userSession.update({where: {id: legacy}, data: {expiresAt: new Date(0), retainUntil: new Date(0)}});
 await db.loginEvent.updateMany({where: {sessionId: legacy}, data: {retainUntil: new Date(0)}});
 expect(await validateAuthSession({id: owner, sessionId: legacy})).toBe(false);
 await cleanupAuthHistory(); expect(await db.userSession.findUnique({where: {id: legacy}})).toBeNull();
 expect(await db.loginEvent.count({where: {sessionId: legacy}})).toBe(0);
 expect(await db.user.count({where: {id: owner}})).toBe(1);
});
it('session and audit insertion roll back together on failure', async () => {
 const before = await db.userSession.count({where: {userId: owner}});
 await expect(startAuthSession(owner, 'PASSWORD', {...metadata, device: undefined} as any)).rejects.toThrow();
 expect(await db.userSession.count({where: {userId: owner}})).toBe(before);
});


it('persists inferred country and returns it for new password and Google registrations without changing existing Google users', async () => {
 const continent = await db.continent.create({data: {id: prefix + 'country-continent', code: 'XR', name: 'Registration Fixture'}});
 const country = await db.country.create({data: {id: prefix + 'country', name: 'Registration Country', iso2: 'XR', iso3: 'XRG', emoji: '', continentId: continent.id}});
 const passwordUser = await createUser({name: 'Country User', email: prefix + 'country-password@example.invalid', password: 'test-only-password'}, {country: ' xr ', city: 'Test city'});
 expect(passwordUser.status).toBe(200); expect(passwordUser.data).toMatchObject({country: {id: country.id, iso2: 'XR'}});
 expect(await db.user.findUnique({where: {id: (passwordUser.data as any).id}})).toMatchObject({countryId: country.id});
 verify.mockResolvedValue({getPayload: () => ({sub: prefix + 'country-google', email: prefix + 'country-google@gmail.com', name: 'Google Country', email_verified: true})});
 const resolveLocation = vi.fn(async () => ({country: 'XR', city: 'Test city'}));
 const first = await loginGoogleUser('verified-token', resolveLocation);
 expect(first.status).toBe(200); expect(first.data).toMatchObject({country: {id: country.id, iso2: 'XR'}}); expect(resolveLocation).toHaveBeenCalledOnce();
 expect(await db.user.findUnique({where: {id: (first.data as any).id}})).toMatchObject({countryId: country.id});
 const laterLocation = vi.fn(async () => ({country: 'US'}));
 expect((await loginGoogleUser('verified-token', laterLocation)).data).toMatchObject({country: {id: country.id}});
 expect(laterLocation).not.toHaveBeenCalled();
 const unknown = await createUser({name: 'Unknown Country', email: prefix + 'country-missing@example.invalid', password: 'test-only-password'}, null);
 expect(unknown.status).toBe(200); expect(await db.user.findUnique({where: {id: (unknown.data as any).id}})).toMatchObject({countryId: null});
});
