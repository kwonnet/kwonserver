import { beforeEach, expect, it, vi } from 'vitest';
import { response, user } from './fixtures';
const deps = vi.hoisted(() => ({ create: vi.fn(), login: vi.fn(), google: vi.fn(), generate: vi.fn(), decode: vi.fn(), getUser: vi.fn(), lookup: vi.fn() }));
vi.mock('@/services/v1/auth', () => ({ createUser: deps.create, loginUser: deps.login, loginGoogleUser: deps.google }));
vi.mock('@/services/v1/utils', () => ({ getAuthUser: deps.getUser }));
vi.mock('@/utils', () => ({ generateToken: deps.generate, getAuthTokenUser: deps.decode }));
vi.mock('@/utils/ipLocation', () => ({ lookup: deps.lookup }));
import { signInController, signUpController, refreshTokenController, getMeController, logoutController, googleSignInController } from '@/controllers/v1/auth';
const body = { name: 'Ada', email: 'ADA@example.test', password: 'password123' };
it('logout clears both historical API cookies even without a working authenticated session', () => {
  const res = response(); res.clearCookie = vi.fn(() => res);
  logoutController({ get: () => undefined } as any, res);
  expect(res.statusCode).toBe(204);
  expect(res.clearCookie).toHaveBeenCalledWith('tx_a_t', { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
  expect(res.clearCookie).toHaveBeenCalledWith('x_a_t', { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
});
it('rejects cross-origin logout attempts', () => {
  const res = response(); res.clearCookie = vi.fn(() => res);
  logoutController({ get: () => 'https://attacker.invalid' } as any, res);
  expect(res.statusCode).toBe(403); expect(res.clearCookie).not.toHaveBeenCalled();
});
beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset());
  deps.create.mockResolvedValue({ status: 200, data: user() }); deps.login.mockResolvedValue({ status: 200, data: user() });
  deps.generate.mockReturnValue('signed-token'); deps.decode.mockReturnValue({ id: 'u' });
  deps.getUser.mockResolvedValue({ status: 200, data: user() }); deps.lookup.mockResolvedValue({ country: 'NG' });
});
it.each([['signin', signInController], ['signup', signUpController]] as const)('%s validates before calling services', async (_name, controller) => {
  const res = response(); await controller({ body: { email: 5, password: 'short' } } as any, res);
  expect(res.statusCode).toBe(400); expect(deps.login).not.toHaveBeenCalled(); expect(deps.create).not.toHaveBeenCalled();
});
it.each([['signin', signInController], ['signup', signUpController]] as const)('%s issues a minimal encrypted-token payload and secure cookie', async (_name, controller) => {
  const res = response(); await controller({ body, ip: '::ffff:1.2.3.4' } as any, res);
  expect(res.body.accessToken).toBe('signed-token');
  expect(deps.generate).toHaveBeenCalledWith({ id: 'user-1', name: 'Ada', email: 'ada@example.test', username: 'ada', role: 'USER' }, { expiresIn: '24h' });
  expect(res.cookie).toHaveBeenCalledWith('tx_a_t', 'signed-token', { httpOnly: true, secure: true, sameSite: 'none', maxAge: 86400000 });
});
it.each([['signin', signInController, 'login'], ['signup', signUpController, 'create']] as const)('%s forwards service rejections without issuing tokens', async (_name, controller, service) => {
  deps[service].mockResolvedValue({ status: 401, data: 'Denied' }); const res = response();
  await controller({ body } as any, res); expect(res.statusCode).toBe(401); expect(res.body).toBe('Denied');
  expect(deps.generate).not.toHaveBeenCalled(); expect(res.cookie).not.toHaveBeenCalled();
});
it.each([['signin', signInController, 'login'], ['signup', signUpController, 'create']] as const)('%s masks unexpected service errors', async (_name, controller, service) => {
  deps[service].mockRejectedValue(new Error('secret')); const res = response();
  await controller({ body } as any, res); expect(res.statusCode).toBe(500); expect(res.body).not.toContain('secret');
});
it.each([['::ffff:1.2.3.4', '1.2.3.4'], ['::1', '8.8.8.8'], [undefined, '8.8.8.8']])('signup resolves client IP %s', async (ip, expected) => {
  await signUpController({ body, ip } as any, response()); expect(deps.lookup).toHaveBeenCalledWith(expected);
  expect(deps.create).toHaveBeenCalledWith({ ...body, name: 'ada', email: 'ada@example.test' }, { country: 'NG' });
});
it('returns the authenticated user for /me', async () => {
  const res = response(); const viewer = user(); await getMeController({ user: viewer } as any, res);
  expect(res.body).toBe(viewer); expect(res.statusCode).toBe(200);
});
it('rejects refresh requests without a token', async () => {
  const res = response(); await refreshTokenController({ body: {} } as any, res);
  expect(res.statusCode).toBe(401); expect(deps.decode).not.toHaveBeenCalled();
});
it('rejects refresh requests without a valid decoded user', async () => {
  deps.decode.mockReturnValue(null); const res = response(); await refreshTokenController({ body: { token: 'bad' } } as any, res);
  expect(res.statusCode).toBe(401); expect(deps.getUser).not.toHaveBeenCalled();
});
it('checks current account status before refreshing', async () => {
  deps.getUser.mockResolvedValue({ status: 401, data: 'Banned' }); const res = response();
  await refreshTokenController({ body: { token: 'old' } } as any, res);
  expect(res.statusCode).toBe(401); expect(deps.generate).not.toHaveBeenCalled();
});
it('refreshes a valid token from current account data', async () => {
  const res = response(); await refreshTokenController({ body: { token: 'old' } } as any, res);
  expect(deps.getUser).toHaveBeenCalledWith('u', { includeEmail: true });
  expect(res.body).toMatchObject({ accessToken: 'signed-token', user: { id: 'user-1' } });
});
it('handles decoder exceptions without issuing tokens', async () => {
  deps.decode.mockImplementation(() => { throw new Error('invalid signature'); }); const res = response();
  await refreshTokenController({ body: { token: 'bad' } } as any, res);
  expect(res.statusCode).toBe(500); expect(deps.generate).not.toHaveBeenCalled();
});


it.each([undefined, null, 42, '', 'short', 'a'.repeat(16385)])('Google rejects invalid token input before authentication', async idToken => {
  const res = response();
  await googleSignInController({body: {idToken}} as any, res);
  expect(res.statusCode).toBe(400);
  expect(res.headers['Cache-Control']).toBe('private, no-store');
  expect(deps.google).not.toHaveBeenCalled(); expect(deps.generate).not.toHaveBeenCalled();
});
it('Google rejects a request with no body', async () => {
  const res = response(); await googleSignInController({} as any, res);
  expect(res.statusCode).toBe(400); expect(deps.google).not.toHaveBeenCalled();
});
it('Google issues a Kwonnet token containing only the trusted API identity', async () => {
  const identity = user(); deps.google.mockResolvedValue({status: 200, data: identity});
  const res = response(); const idToken = 'signed-google-id-token';
  await googleSignInController({body: {idToken, id: 'attacker', role: 'ADMIN'}} as any, res);
  expect(deps.google).toHaveBeenCalledWith(idToken);
  expect(deps.generate).toHaveBeenCalledWith({id: 'user-1', name: 'Ada', email: 'ada@example.test', username: 'ada', role: 'USER'}, {expiresIn: '24h'});
  expect(res.body).toEqual({user: identity, accessToken: 'signed-token'});
  expect(res.cookie).not.toHaveBeenCalled();
});
it.each([{status: 401, data: 'Invalid token'}, {status: 503, data: {reason: 'Unavailable'}}, {status: 200, data: 'Invalid identity'}])('Google never issues tokens for a rejected service result %j', async result => {
  deps.google.mockResolvedValue(result); const res = response();
  await googleSignInController({body: {idToken: 'signed-google-id-token'}} as any, res);
  expect(res.statusCode).toBe(result.status); expect(res.body).toEqual(result.data);
  expect(deps.generate).not.toHaveBeenCalled();
});
it.each(['verification', 'signing'])('Google masks unexpected %s errors without issuing credentials', async stage => {
  deps.google.mockResolvedValue({status: 200, data: user()});
  if (stage === 'verification') deps.google.mockRejectedValue(new Error('private verification detail'));
  else deps.generate.mockImplementation(() => {throw new Error('private signing secret');});
  const res = response(); await googleSignInController({body: {idToken: 'signed-google-id-token'}} as any, res);
  expect(res.statusCode).toBe(500); expect(res.body).not.toContain('private');
  expect(res.body).not.toHaveProperty('accessToken');
});
