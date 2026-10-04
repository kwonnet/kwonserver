import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ lookup: vi.fn(), detect: vi.fn(), parseBot: vi.fn(), hints: vi.fn(), pipeline: vi.fn() }));
vi.mock('@/utils/ipLocation', () => ({ lookup: deps.lookup }));
vi.mock('node-device-detector', () => ({ default: class { detect = deps.detect; parseBot = deps.parseBot; } }));
vi.mock('node-device-detector/client-hints', () => ({ default: class { parse = deps.hints; } }));
vi.mock('@huggingface/transformers', () => ({ pipeline: deps.pipeline }));
import * as h from '@/utils/helpers';
beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset());
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());
it('omits a property without mutating its source', () => {
  const input = { id: 'u', email: 'private' }; expect(h.removeProperty(input, 'email')).toEqual({ id: 'u' }); expect(input.email).toBe('private');
});
it('uses the explicitly selected bearer account before query or historical cookies', () => {
  const req: any = { cookies: { x_a_t: 'cookie' }, query: { token: 'query' }, headers: { authorization: 'Bearer header' } };
  expect(h.getAuthorizationToken(req)).toBe('header'); delete req.headers.authorization;
  expect(h.getAuthorizationToken(req)).toBe('query'); delete req.query.token;
  expect(h.getAuthorizationToken(req)).toBe('cookie'); delete req.cookies.x_a_t;
  expect(h.getAuthorizationToken(req)).toBeNull();
});
it.each(['', 'Basic invalid', 'Bearer '])('does not fall back to a different cookie account for invalid explicit authorization %s', authorization => {
  expect(h.getAuthorizationToken({ cookies: { tx_a_t: 'old-account' }, query: {}, headers: { authorization } } as any)).toBeNull();
});
it.each([undefined, '::1', '::ffff:1.2.3.4', '1.2.3.4'])('normalizes geolocation IP %s', async ip => {
  deps.lookup.mockResolvedValue({ country: 'NG' });
  expect(await h.getReqIPInfo(ip)).toEqual({ country: 'NG' });
  expect(deps.lookup).toHaveBeenCalledWith(!ip || ip === '::1' ? '8.8.8.8' : '1.2.3.4');
});
it('returns null on geolocation failure', async () => {
  deps.lookup.mockRejectedValue(new Error('unavailable')); expect(await h.getReqIPInfo('1.2.3.4')).toBeNull();
});
it.each([{}, { name: 'crawler' }])('composes device and bot information', async bot => {
  deps.detect.mockReturnValue({ client: 'browser' }); deps.parseBot.mockReturnValue(bot); deps.lookup.mockResolvedValue({ country: 'NG' });
  const result = await h.getReqInfo({ headers: { 'user-agent': 'UA' }, ip: '1.2.3.4' } as any);
  expect(result).toEqual({ device: { client: 'browser' }, ipInfo: { country: 'NG' }, isBot: Object.keys(bot).length > 0 });
});
it('formats numbers and operational errors', () => {
  expect(h.formatNumberWithCommas(12345.678)).toBe('12,345.68');
  expect(new h.AppError('Not found', 404)).toMatchObject({ name: 'AppError', statusCode: 404, isOperational: true });
  expect(new h.AppError('Failure')).toBeInstanceOf(Error);
});
it.each([undefined, null, ''])('cleans absent text %s', text => {
  expect(h.cleanTextContent(text)).toBe(''); expect(h.cleanTextContentWithHashtag(text)).toBe('');
});
it('cleans mentions and whitespace, optionally retains hashtags, and enforces length', () => {
  expect(h.cleanTextContent(' Hello @ada \n #news world ')).toBe('Hello world');
  expect(h.cleanTextContentWithHashtag(' Hello @ada \n #news world ')).toBe('Hello #news world');
  expect(h.cleanTextContent('abcdef', 3)).toBe('abc');
});
it('returns immediately after a successful retry attempt', async () => {
  const task = vi.fn().mockResolvedValue('ok'); expect(await h.retryExecution(task, 3)).toBe('ok'); expect(task).toHaveBeenCalledOnce();
});
it('delays failed attempts and stops once successful', async () => {
  vi.useFakeTimers(); const task = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('ok');
  const result = h.retryExecution(task, 3, 100);
  await vi.advanceTimersByTimeAsync(99); expect(task).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect(await result).toBe('ok'); expect(task).toHaveBeenCalledTimes(2);
});
it('throws the last error after exactly the allowed attempts', async () => {
  vi.useFakeTimers(); const error = new Error('failed'); const task = vi.fn().mockRejectedValue(error);
  const assertion = expect(h.retryExecution(task, 3, 10)).rejects.toBe(error);
  await vi.runAllTimersAsync(); await assertion; expect(task).toHaveBeenCalledTimes(3);
});
it('rejects a zero retry budget without executing the task', async () => {
  const task = vi.fn(); await expect(h.retryExecution(task, 0)).rejects.toThrow(); expect(task).not.toHaveBeenCalled();
});
it('runs embedding inference through a lazy cached pipeline', async () => {
  const model = vi.fn().mockResolvedValue({ data: new Float32Array([0.25, 0.5]) }); deps.pipeline.mockResolvedValue(model);
  expect(await h.generateEmbedding('hello')).toEqual([0.25, 0.5]); await h.generateEmbedding('again');
  expect(deps.pipeline).toHaveBeenCalledOnce(); expect(model).toHaveBeenCalledWith('hello', { pooling: 'mean', normalize: true });
});
it('extracts the classifier result through a mocked model', async () => {
  deps.pipeline.mockResolvedValue(vi.fn().mockResolvedValue([{ label: 'safe', score: 0.9 }]));
  expect(await h.commentClassifier('hello')).toEqual({ label: 'safe', score: 0.9 });
});
it('accepts the cookie issued by signup and signin', () => {
  expect(h.getAuthorizationToken({ cookies: { tx_a_t: 'issued-token' }, query: {}, headers: {} } as any)).toBe('issued-token');
});
it('handles requests without parsed cookies', () => {
  expect(h.getAuthorizationToken({ query: {}, headers: { authorization: 'Bearer token' } } as any)).toBe('token');
});
