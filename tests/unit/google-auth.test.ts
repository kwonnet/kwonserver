import {beforeEach, afterEach, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({verify: vi.fn(), identity: vi.fn(), compose: vi.fn(), hash: vi.fn(),
  db: {user: {findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn()}, wallet: {findUniqueOrThrow: vi.fn()}, transaction: {create: vi.fn()}, $transaction: vi.fn()}}));
vi.mock('google-auth-library', () => ({OAuth2Client: class {verifyIdToken = mocks.verify;}}));
vi.mock('@/db', () => ({default: mocks.db}));
vi.mock('@/services/v1/utils', () => ({getAuthUser: mocks.identity, composeAuthUser: mocks.compose, getUserStatusMessage: () => 'Unavailable'}));
vi.mock('@/utils', () => ({getRandomNumber: () => 12}));
vi.mock('bcrypt', () => ({default: {hash: mocks.hash}}));
import {loginGoogleUser} from '@/services/v1/auth';
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
