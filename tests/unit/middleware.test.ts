import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
const deps = vi.hoisted(() => ({ token: vi.fn(), verify: vi.fn(), decrypt: vi.fn(), user: vi.fn(), info: vi.fn(), routes: vi.fn(), session: vi.fn(), touch: vi.fn() }));
vi.mock('@/utils', () => ({ jwtVerify: deps.verify, decryptString: deps.decrypt }));
vi.mock('@/utils/helpers', () => ({ getAuthorizationToken: deps.token, getReqInfo: deps.info,
  removeProperty: (obj: any, key: string) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) }));
vi.mock('@/services/v1/auth', () => ({validateAuthSession: deps.session, touchAuthSession: deps.touch}));
vi.mock('@/routes/v1', () => ({ default: deps.routes }));
vi.mock('@/services/v1/utils', async importOriginal => ({ ...await importOriginal<any>(), getAuthUser: deps.user }));
import { authMiddleware, detectBotMiddleware, bigintConverterMiddleware, versionMiddleware } from '@/middleware';
beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset()); deps.token.mockReturnValue('token'); deps.verify.mockReturnValue({ data: 'encrypted' });
  deps.decrypt.mockReturnValue({ id: 'u' }); deps.session.mockResolvedValue(true); deps.touch.mockResolvedValue(undefined); deps.info.mockResolvedValue({ isBot: false });
});
it('rejects missing authentication by default', async () => {
  deps.token.mockReturnValue(null); const res = response(); const next = vi.fn();
  await authMiddleware()({} as any, res, next);
  expect(res.statusCode).toBe(401); expect(next).not.toHaveBeenCalled();
});
it.each([null, false])('allows optional anonymous requests', async token => {
  deps.token.mockReturnValue(token); const next = vi.fn();
  await authMiddleware({ required: false })({} as any, response(), next);
  expect(next).toHaveBeenCalledOnce(); expect(deps.verify).not.toHaveBeenCalled();
});
it.each([true, false])('handles missing verified payload with required=%s', async required => {
  deps.verify.mockReturnValue(null); const res = response(); const next = vi.fn();
  await authMiddleware({ required })({} as any, res, next);
  expect(required ? res.statusCode : next.mock.calls.length).toBe(required ? 401 : 1);
});
it('attaches the verified session user', async () => {
  const req: any = {}; const next = vi.fn();
  await authMiddleware()(req, response(), next);
  expect(req.user).toEqual({ id: 'u' }); expect(next).toHaveBeenCalledOnce();
});
it.each([false, true])('loads current permissions and controls email exposure (%s)', async includeEmail => {
  deps.user.mockResolvedValue({ status: 200, data: { id: 'u', email: 'private@example.test', role: 'USER' } });
  const req: any = {}; const next = vi.fn();
  await authMiddleware({ checkPermission: true, checkPermWithEmail: includeEmail })(req, response(), next);
  expect(deps.user).toHaveBeenCalledWith('u', { includeEmail: true });
  expect(req.user.email).toBe(includeEmail ? 'private@example.test' : undefined);
  expect(next).toHaveBeenCalledOnce();
});
it('propagates account permission denial', async () => {
  deps.user.mockResolvedValue({ status: 401, data: 'Account banned' }); const res = response(); const next = vi.fn();
  await authMiddleware({ checkPermission: true })({} as any, res, next);
  expect(res.statusCode).toBe(401); expect(res.body).toBe('Account banned'); expect(next).not.toHaveBeenCalled();
});
it.each(['verify', 'decrypt', 'user'])('fails closed on %s exceptions', async key => {
  deps[key as 'verify' | 'decrypt' | 'user'].mockImplementation(() => { throw new Error('invalid'); });
  const res = response(); const next = vi.fn();
  await authMiddleware({ checkPermission: true })({} as any, res, next);
  expect(res.statusCode).toBe(503); expect(next).not.toHaveBeenCalled();
});
it.each([[true, true, 400], [true, false, 200], [false, true, 200]])('bot=%s required=%s gives %s', async (bot, required, status) => {
  deps.info.mockResolvedValue({ isBot: bot }); const res = response(); const next = vi.fn();
  await detectBotMiddleware(required as boolean)({} as any, res, next);
  expect(res.statusCode).toBe(status); expect(next.mock.calls.length).toBe(status === 200 ? 1 : 0);
});
it('returns a client error on bot detection failure', async () => {
  deps.info.mockRejectedValue(new Error('lookup failed')); const res = response();
  await detectBotMiddleware()({} as any, res, vi.fn()); expect(res.statusCode).toBe(400);
});
it('serializes nested bigint response values without changing dates or input', () => {
  const res = response(); const next = vi.fn(); const date = new Date(); const body = { n: 2n, items: [3n, { date }] };
  bigintConverterMiddleware({} as any, res, next); res.json(body);
  expect(res.body).toEqual({ n: 2, items: [3, { date }] }); expect(body.n).toBe(2n); expect(next).toHaveBeenCalledOnce();
});
it('dispatches API version requests to the v1 router', () => {
  const req = { url: '/api/v1/posts' }; const res = response(); const next = vi.fn();
  versionMiddleware(req as any, res, next); expect(deps.routes).toHaveBeenCalledWith(req, res, next);
});


it('rejects revoked sessions and keeps valid session IDs when hydrating permissions', async () => {
  deps.decrypt.mockReturnValue({id: 'u', sessionId: 'sid'});
  deps.session.mockResolvedValue(false); let res = response(); const next = vi.fn();
  await authMiddleware()({} as any, res, next); expect(res.statusCode).toBe(401); expect(next).not.toHaveBeenCalled();
  deps.session.mockResolvedValue(true); deps.touch.mockRejectedValue(new Error('activity write unavailable'));
  deps.user.mockResolvedValue({status: 200, data: {id: 'u', email: 'private@example.test'}});
  const req: any = {}; res = response(); await authMiddleware({checkPermission: true})(req, res, next);
  expect(req.user.sessionId).toBe('sid'); expect(req.user.email).toBeUndefined(); expect(next).toHaveBeenCalledOnce();
});

it.each(['TokenExpiredError','JsonWebTokenError','NotBeforeError','SyntaxError'])('rejects %s as authentication failure rather than a service outage',async name=>{
 deps.verify.mockImplementation(()=>{throw Object.assign(new Error('invalid token'),{name});});
 const res=response();const next=vi.fn();await authMiddleware()({} as any,res,next);expect(res.statusCode).toBe(401);expect(next).not.toHaveBeenCalled();
});
it('does not classify database session-validation outages as revocation',async()=>{
 deps.session.mockRejectedValue(new Error('database unavailable'));const res=response();const next=vi.fn();
 await authMiddleware()({} as any,res,next);expect(res.statusCode).toBe(503);expect(next).not.toHaveBeenCalled();
});
