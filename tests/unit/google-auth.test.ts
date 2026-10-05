import {beforeEach, afterEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({verify: vi.fn(), identity: vi.fn(), compose: vi.fn(), hash: vi.fn(),
  db: {user: {findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn()}, country: {findFirst: vi.fn()}, wallet: {findUniqueOrThrow: vi.fn()}, transaction: {create: vi.fn()}, $transaction: vi.fn()}}));
vi.mock('google-auth-library', () => ({OAuth2Client: class {verifyIdToken = mocks.verify;}}));
vi.mock('@/db', () => ({default: mocks.db}));
vi.mock('@/services/v1/utils', () => ({getAuthUser: mocks.identity, composeAuthUser: mocks.compose, getUserStatusMessage: () => 'Unavailable'}));
vi.mock('@/utils', () => ({getRandomNumber: () => 12}));
vi.mock('bcrypt', () => ({default: {hash: mocks.hash}}));
import {loginGoogleUser, createUser} from '@/services/v1/auth';
const claims = {sub: 'google-sub', email: 'ada@gmail.com', email_verified: true, name: 'Ada', picture: 'https://google.test/avatar'};
const account = {id: 'kwon-id', status: 'ACTIVE', googleSubject: 'google-sub', deletedAt: null, deactivatedAt: null};
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('AUTH_GOOGLE_ID', 'client-id');
  mocks.verify.mockResolvedValue({getPayload: () => claims});
  mocks.identity.mockResolvedValue({status: 200, data: {id: 'kwon-id'}});
  mocks.db.user.updateMany.mockResolvedValue({count: 1});
});
afterEach(() => vi.unstubAllEnvs());
it('verifies the configured audience and resolves the stable Google subject', async () => {
  mocks.db.user.findUnique.mockResolvedValue(account);
  expect(await loginGoogleUser('signed-token')).toEqual({status: 200, data: {id: 'kwon-id'}});
  expect(mocks.verify).toHaveBeenCalledWith({idToken: 'signed-token', audience: 'client-id'});
  expect(mocks.identity).toHaveBeenCalledWith('kwon-id', {includeEmail: true});
});
it('rejects forged/expired tokens and unverified emails before touching accounts', async () => {
  mocks.verify.mockRejectedValueOnce(new Error('bad signature'));
  expect((await loginGoogleUser('forged')).status).toBe(401);
  mocks.verify.mockResolvedValue({getPayload: () => ({...claims, email_verified: false})});
  expect((await loginGoogleUser('unverified')).status).toBe(401);
  expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
});
it('fails closed when the client ID is absent', async () => {
  vi.stubEnv('AUTH_GOOGLE_ID', '');
  expect((await loginGoogleUser('token')).status).toBe(503);
  expect(mocks.verify).not.toHaveBeenCalled();
});
it.each(['BANNED', 'SUSPENDED'])('does not sign in %s identities', async status => {
  mocks.db.user.findUnique.mockResolvedValue({...account, status});
  expect((await loginGoogleUser('token')).status).toBe(401);
  expect(mocks.identity).not.toHaveBeenCalled();
});
it('links existing authoritative Gmail accounts atomically without resetting passwords or avatars', async () => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null});
  expect((await loginGoogleUser('token')).status).toBe(200);
  expect(mocks.db.user.updateMany).toHaveBeenCalledWith({where: {id: 'kwon-id', googleSubject: null}, data: {googleSubject: 'google-sub', isVerified: true}});
  expect(mocks.db.user.create).not.toHaveBeenCalled();
});
it('never takes over an existing account via a third-party email claim', async () => {
  mocks.verify.mockResolvedValue({getPayload: () => ({...claims, email: 'ada@third-party.test'})});
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null});
  expect((await loginGoogleUser('token')).status).toBe(409);
  expect(mocks.db.user.updateMany).not.toHaveBeenCalled();
});
it('refuses a conflicting provider identity', async () => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: 'other-sub'});
  expect((await loginGoogleUser('token')).status).toBe(409);
});
it('uses existing transactional registration and creates a passwordless account with its bonus ledger', async () => {
  mocks.db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
  mocks.db.user.findFirst.mockResolvedValue(null);
  mocks.db.$transaction.mockImplementation(async work => work(mocks.db));
  mocks.db.user.create.mockResolvedValue(account);
  mocks.db.wallet.findUniqueOrThrow.mockResolvedValue({id: 'wallet'});
  expect((await loginGoogleUser('token')).status).toBe(200);
  expect(mocks.db.user.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({password: null, googleSubject: 'google-sub', isVerified: true, wallet: {create: {bonus: 12}}})}));
  expect(mocks.db.transaction.create).toHaveBeenCalledOnce();
  expect(mocks.hash).not.toHaveBeenCalled();
});


it.each([undefined, {...claims, sub: ''}, {...claims, email: ''}])('rejects missing identity claims without database access', async payload => {
  mocks.verify.mockResolvedValue({getPayload: () => payload});
  expect((await loginGoogleUser('token')).status).toBe(401);
  expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
});
it.each([{deletedAt: new Date()}, {deactivatedAt: new Date()}])('rejects unavailable linked accounts %j', async state => {
  mocks.db.user.findUnique.mockResolvedValue({...account, ...state});
  expect((await loginGoogleUser('token')).status).toBe(401); expect(mocks.identity).not.toHaveBeenCalled();
});
it.each(['BANNED', 'SUSPENDED'])('does not link an existing %s password account', async status => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null, status});
  expect((await loginGoogleUser('token')).status).toBe(401); expect(mocks.db.user.updateMany).not.toHaveBeenCalled();
});
it.each([{deletedAt: new Date()}, {deactivatedAt: new Date()}])('does not link a closed existing email account %j', async state => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null, ...state});
  expect((await loginGoogleUser('token')).status).toBe(401); expect(mocks.db.user.updateMany).not.toHaveBeenCalled();
});
it('accepts an existing private account without changing its established Google link', async () => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, status: 'PRIVATE'});
  expect((await loginGoogleUser('token')).status).toBe(200); expect(mocks.db.user.updateMany).not.toHaveBeenCalled();
});
it('allows authoritative Workspace email linking', async () => {
  mocks.verify.mockResolvedValue({getPayload: () => ({...claims, email: 'ada@workspace.test', hd: 'workspace.test'})});
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, status: 'PRIVATE', googleSubject: null});
  expect((await loginGoogleUser('token')).status).toBe(200); expect(mocks.db.user.updateMany).toHaveBeenCalledOnce();
});
it('recovers a concurrent successful link without creating another account or bonus', async () => {
  mocks.db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null});
  mocks.db.user.updateMany.mockResolvedValue({count: 0});
  expect((await loginGoogleUser('token')).status).toBe(200); expect(mocks.db.user.create).not.toHaveBeenCalled();
});
it('fails closed when a link race cannot resolve the verified subject', async () => {
  mocks.db.user.findUnique.mockResolvedValue(null);
  mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null});
  mocks.db.user.updateMany.mockResolvedValue({count: 0});
  expect((await loginGoogleUser('token')).status).toBe(409); expect(mocks.identity).not.toHaveBeenCalled();
});
it('returns registration failures without constructing an authenticated identity', async () => {
  mocks.verify.mockResolvedValue({getPayload: () => ({...claims, name: undefined, picture: undefined})});
  mocks.db.user.findUnique.mockResolvedValue(null); mocks.db.user.findFirst.mockResolvedValue(null);
  mocks.db.$transaction.mockRejectedValue(new Error('database secret'));
  expect(await loginGoogleUser('token')).toEqual({status: 500, data: 'Error occurred, please try again'});
  expect(mocks.identity).not.toHaveBeenCalled();
});
it('masks account lookup errors', async () => {
  mocks.db.user.findUnique.mockRejectedValue(new Error('database secret'));
  expect(await loginGoogleUser('token')).toEqual({status: 500, data: 'Unable to sign in with Google. Please try again'});
});
it('requires a password when registration is not a verified Google registration', async () => {
  mocks.db.user.findFirst.mockResolvedValue(null);
  expect(await createUser({name: 'Ada', email: 'ada@example.test'})).toEqual({status: 400, data: 'Password required'});
  expect(mocks.db.user.create).not.toHaveBeenCalled();
});


it('infers country for a new Google account before committing normal registration', async () => {
  mocks.db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
  mocks.db.user.findFirst.mockResolvedValue(null);
  mocks.db.country.findFirst.mockResolvedValue({id: 'nigeria'});
  mocks.db.$transaction.mockImplementation(async work => work(mocks.db));
  mocks.db.user.create.mockResolvedValue(account); mocks.db.wallet.findUniqueOrThrow.mockResolvedValue({id: 'wallet'});
  const resolve = vi.fn(async () => ({country: 'NG', city: 'Lagos'}));
  expect((await loginGoogleUser('token', resolve)).status).toBe(200);
  expect(resolve).toHaveBeenCalledOnce();
  expect(mocks.db.user.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({country: {connect: {id: 'nigeria'}}, location: {create: {latitude: 0, longitude: 0, meta: {country: 'NG', city: 'Lagos'}}}})}));
});
it('never infers or overwrites an existing account country during Google signin/linking', async () => {
  const resolve = vi.fn(async () => ({country: 'NG'}));
  mocks.db.user.findUnique.mockResolvedValue({...account, countryId: 'chosen-country'});
  expect((await loginGoogleUser('token', resolve)).status).toBe(200); expect(resolve).not.toHaveBeenCalled();
  mocks.db.user.findUnique.mockResolvedValue(null); mocks.db.user.findFirst.mockResolvedValue({...account, googleSubject: null, countryId: 'chosen-country'});
  expect((await loginGoogleUser('token', resolve)).status).toBe(200); expect(resolve).not.toHaveBeenCalled();
  expect(mocks.db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({data: {googleSubject: 'google-sub', isVerified: true}}));
});
