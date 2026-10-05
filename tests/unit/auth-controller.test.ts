import { beforeEach, expect, it, vi } from 'vitest';
import { response, user } from './fixtures';
const deps = vi.hoisted(() => ({ create: vi.fn(), login: vi.fn(), google: vi.fn(), generate: vi.fn(), decode: vi.fn(), getUser: vi.fn(), lookup: vi.fn(), startSession: vi.fn(), validateSession: vi.fn(), touch: vi.fn(), provider: vi.fn(), revoke: vi.fn(), sessions: vi.fn(), events: vi.fn(), account: vi.fn(), password: vi.fn() }));
vi.mock('@/services/v1/auth', () => ({ getAccountSettings: deps.account, updateAccountPassword: deps.password, createUser: deps.create, loginUser: deps.login, loginGoogleUser: deps.google, startAuthSession: deps.startSession, validateAuthSession: deps.validateSession, touchAuthSession: deps.touch, sessionProvider: deps.provider, revokeAuthSession: deps.revoke, listAuthSessions: deps.sessions, listLoginEvents: deps.events }));
vi.mock('@/services/v1/utils', () => ({ getAuthUser: deps.getUser }));
vi.mock('@/utils', () => ({ generateToken: deps.generate, getAuthTokenUser: deps.decode }));
vi.mock('@/utils/ipLocation', () => ({ lookup: deps.lookup }));
import { accountSettingsController, passwordUpdateController, signInController, signUpController, refreshTokenController, getMeController, logoutController, googleSignInController, authSessionsController, loginEventsController, revokeAuthSessionController, guardAuthStream } from '@/controllers/v1/auth';
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
  deps.generate.mockReturnValue('signed-token'); deps.decode.mockReturnValue({ id: 'u', sessionId: 'existing-session' });
  deps.validateSession.mockResolvedValue(true); deps.startSession.mockResolvedValue('new-session'); deps.provider.mockResolvedValue('GOOGLE');
  deps.getUser.mockResolvedValue({ status: 200, data: user() }); deps.lookup.mockResolvedValue({ country: 'NG' });
});
it.each([['signin', signInController], ['signup', signUpController]] as const)('%s validates before calling services', async (_name, controller) => {
  const res = response(); await controller({ body: { email: 5, password: 'short' } } as any, res);
  expect(res.statusCode).toBe(400); expect(deps.login).not.toHaveBeenCalled(); expect(deps.create).not.toHaveBeenCalled();
});
it.each([['signin', signInController], ['signup', signUpController]] as const)('%s issues a minimal encrypted-token payload and secure cookie', async (_name, controller) => {
  const res = response(); await controller({ body, ip: '::ffff:1.2.3.4' } as any, res);
  expect(res.body.accessToken).toBe('signed-token');
  expect(deps.generate).toHaveBeenCalledWith({ id: 'user-1', name: 'Ada', email: 'ada@example.test', username: 'ada', role: 'USER', sessionId: expect.any(String) }, { expiresIn: '24h' });
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
it.each([['::ffff:1.2.3.4', '1.2.3.4'], ['::1', null], [undefined, null]])('signup resolves client IP %s', async (ip, expected) => {
  await signUpController({ body, ip } as any, response()); if (expected) expect(deps.lookup).toHaveBeenCalledWith(expected); else expect(deps.lookup).not.toHaveBeenCalled();
  expect(deps.create).toHaveBeenCalledWith({ ...body, name: 'ada', email: 'ada@example.test' }, expected ? {country: 'NG'} : null);
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
  expect(deps.google).toHaveBeenCalledWith(idToken, null);
  expect(deps.generate).toHaveBeenCalledWith({id: 'user-1', name: 'Ada', email: 'ada@example.test', username: 'ada', role: 'USER', sessionId: expect.any(String)}, {expiresIn: '24h'});
  expect(res.body).toEqual({user: {...identity, sessionId: expect.any(String)}, accessToken: 'signed-token'});
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


it.each([['PASSWORD', signInController], ['GOOGLE', googleSignInController]] as const)('attributes %s successful logins without persisting credentials', async (provider, controller) => {
  deps.google.mockResolvedValue({status: 200, data: user()});
  await controller({body: {...body, idToken: 'signed-google-id-token'}, ip: '127.0.0.1'} as any, response());
  expect(deps.startSession).toHaveBeenCalledWith('user-1', provider, expect.objectContaining({location: null, metadataSource: 'API_REQUEST'}), 'SIGN_IN', expect.any(String));
  const json = JSON.stringify(deps.startSession.mock.calls);
  expect(json).not.toContain(body.password); expect(json).not.toContain('signed-google-id-token');
});
it('refresh checks revocation and does not create another login event', async () => {
  const res = response(); await refreshTokenController({body: {token: 'old'}} as any, res);
  expect(deps.validateSession).toHaveBeenCalledWith({id: 'u', sessionId: 'existing-session'});
  expect(deps.startSession).not.toHaveBeenCalled(); expect(deps.touch).toHaveBeenCalled();
  expect(res.body.user.sessionId).toBe('existing-session');
});
it('refuses a revoked session before loading user data', async () => {
  deps.validateSession.mockResolvedValue(false); const res = response();
  await refreshTokenController({body: {token: 'old'}} as any, res);
  expect(res.statusCode).toBe(401); expect(deps.getUser).not.toHaveBeenCalled();
});
it.each([false, true])('upgrades legacy tokens or records a saved-account switch (%s)', async switchAccount => {
  deps.decode.mockReturnValue({id: 'u', ...(switchAccount && {sessionId: 'old-session'})});
  await refreshTokenController({body: {token: 'old', newSession: switchAccount}} as any, response());
  expect(deps.startSession).toHaveBeenCalledWith('user-1', switchAccount ? 'GOOGLE' : 'LEGACY', expect.any(Object), switchAccount ? 'ACCOUNT_SWITCH' : 'LEGACY_UPGRADE', expect.any(String));
});
it('tracking failure returns an error and never sends a token or cookie', async () => {
  deps.startSession.mockRejectedValue(new Error('private storage details')); const res = response();
  await signInController({body} as any, res); expect(res.statusCode).toBe(500);
  expect(res.cookie).not.toHaveBeenCalled(); expect(res.body).not.toHaveProperty('accessToken');
});
it.each([['sessions', authSessionsController], ['events', loginEventsController]] as const)('scopes %s history to the authenticated user and validates pagination', async (kind, controller) => {
  deps[kind].mockResolvedValue({data: []});
  let res = response(); await controller({query: {page: '2', userId: 'other'}, user: {id: 'owner', sessionId: 'current'}} as any, res);
  expect(res.headers['Cache-Control']).toBe('private, no-store');
  expect(deps[kind]).toHaveBeenCalledWith(...(kind === 'sessions' ? ['owner', 'current', 2] : ['owner', 2]));
  res = response(); await controller({query: {page: '0'}, user: {id: 'owner'}} as any, res); expect(res.statusCode).toBe(400);
  deps[kind].mockRejectedValue(new Error('storage')); res = response();
  await controller({query: {}, user: {id: 'owner'}} as any, res); expect(res.statusCode).toBe(503);
});
it('revokes owned sessions and returns safe errors for invalid, missing and failed revocations', async () => {
  const request = {params: {id: 'cfad39b0-29f5-4ffc-aabc-607aaed1e740'}, user: {id: 'owner'}} as any;
  for (const [exists, code] of [[true, 204], [false, 404]] as const) {
    deps.revoke.mockResolvedValue(exists); const res = response(); await revokeAuthSessionController(request, res); expect(res.statusCode).toBe(code);
    expect(deps.revoke).toHaveBeenCalledWith('owner', request.params.id);
  }
  let res = response(); await revokeAuthSessionController({...request, params: {id: 'invalid'}}, res); expect(res.statusCode).toBe(400);
  deps.revoke.mockRejectedValue(new Error('storage')); res = response(); await revokeAuthSessionController(request, res); expect(res.statusCode).toBe(503);
});
it('logout revokes the bearer session but still clears cookies on decoding or database errors', async () => {
  for (const broken of [false, true]) {
    if (broken) deps.decode.mockImplementation(() => {throw new Error('bad token');});
    const res = response(); res.clearCookie = vi.fn();
    await logoutController({get: (name: string) => name === 'authorization' ? 'Bearer token' : undefined} as any, res);
    expect(res.statusCode).toBe(204); expect(res.clearCookie).toHaveBeenCalledTimes(2);
  }
  expect(deps.revoke).toHaveBeenCalledWith('u', 'existing-session', 'LOGOUT');
});
it('closes revoked SSE sessions and clears timers on disconnect', async () => {
  vi.useFakeTimers();
  try {
    let close: () => void = () => {};
    const res = response(); res.end = vi.fn(); res.on = (_name: string, fn: () => void) => {close = fn;};
    const next = vi.fn(); guardAuthStream({user: {id: 'u', sessionId: 'session'}} as any, res, next);
    deps.validateSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(30_000); expect(res.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000); expect(res.end).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000); expect(res.end).toHaveBeenCalledTimes(2);
    close(); expect(vi.getTimerCount()).toBe(0);
    guardAuthStream({user: {id: 'legacy'}} as any, res, next); expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});


it('reports failed server revocation while still clearing local API cookies', async () => {
  deps.revoke.mockRejectedValue(new Error('storage offline'));
  const res = response(); res.clearCookie = vi.fn();
  await logoutController({get: (name: string) => name === 'authorization' ? 'Bearer token' : undefined} as any, res);
  expect(res.statusCode).toBe(503); expect(res.clearCookie).toHaveBeenCalledTimes(2);
});


it('explicit invalid logout authorization never falls back to another account cookie', async () => {
  const res = response(); res.clearCookie = vi.fn();
  await logoutController({get: (name: string) => name === 'authorization' ? 'Bearer ' : undefined, cookies: {tx_a_t: 'other-account-token'}} as any, res);
  expect(deps.decode).not.toHaveBeenCalled(); expect(deps.revoke).not.toHaveBeenCalled(); expect(res.statusCode).toBe(204);
});
it('cookie-only logout can revoke the historical API session safely', async () => {
  const res = response(); res.clearCookie = vi.fn();
  await logoutController({get: () => undefined, cookies: {tx_a_t: 'cookie-token'}} as any, res);
  expect(deps.decode).toHaveBeenCalledWith('cookie-token', true); expect(deps.revoke).toHaveBeenCalledWith('u', 'existing-session', 'LOGOUT');
});


it('Google registration and the login event share one trusted location lookup', async () => {
  deps.google.mockImplementation(async (_token, location) => {
    expect(location).toEqual({country: 'NG'});
    return {status: 200, data: user()};
  });
  const res = response();
  await googleSignInController({body: {idToken: 'signed-google-id-token', country: 'US'}, ip: '198.51.100.12'} as any, res);
  expect(res.statusCode).toBe(200); expect(deps.lookup).toHaveBeenCalledOnce();
  expect(deps.startSession).toHaveBeenCalledWith('user-1', 'GOOGLE', expect.objectContaining({location: {country: 'NG'}}), 'SIGN_IN', expect.any(String));
});

it('loads account settings for the authenticated owner and handles failure', async () => {
 deps.account.mockResolvedValue({username: 'owner', hasPassword: true}); const res = response(); await accountSettingsController({user: {id: 'owner'}} as any, res); expect(deps.account).toHaveBeenCalledWith('owner');
 deps.account.mockRejectedValue(new Error('private')); await accountSettingsController({user: {id: 'owner'}} as any, res); expect(res.statusCode).toBe(503);
});
it('validates password updates and binds the active session to the authenticated owner', async () => {
 const res = response(); await passwordUpdateController({user: {id: 'owner'}, body: {newPassword: 'short'}} as any, res); expect(res.statusCode).toBe(400);
 deps.password.mockResolvedValue({status: 200, data: {updated: true}}); await passwordUpdateController({user: {id: 'owner', sessionId: 'current'}, body: {currentPassword: 'old-password', newPassword: 'new-password'}} as any, res); expect(deps.password).toHaveBeenCalledWith('owner', 'current', {currentPassword: 'old-password', newPassword: 'new-password'});
 deps.password.mockResolvedValue({status: 403, data: 'Incorrect'}); await passwordUpdateController({user: {id: 'owner'}, body: {newPassword: 'new-password'}} as any, res); expect(res.statusCode).toBe(403);
 deps.password.mockRejectedValue(new Error('private')); await passwordUpdateController({user: {id: 'owner'}, body: {newPassword: 'new-password'}} as any, res); expect(res.statusCode).toBe(500);
});
