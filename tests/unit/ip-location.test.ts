import { afterEach, expect, it, vi } from 'vitest';
import { createIpLookup } from '@/utils/ipLocation';
afterEach(() => vi.useRealTimers());
it('does not load geolocation during construction and shares initialization', async () => {
  const api = { reload: vi.fn().mockResolvedValue(undefined), lookup: vi.fn().mockReturnValue({ country: 'NG' }) };
  const load = vi.fn(() => api as any);
  const lookup = createIpLookup(load);
  expect(load).not.toHaveBeenCalled();
  expect(await Promise.all([lookup('1.2.3.4'), lookup('2.3.4.5')])).toEqual([{country:'NG'}, {country:'NG'}]);
  expect(api.reload).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
});
it('returns null on timeout and uses the database once initialization completes', async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const api = { reload: vi.fn(() => new Promise<void>(r => { resolve = r; })), lookup: vi.fn(() => ({country:'NG'})) };
  const lookup = createIpLookup(() => api as any, 25);
  const first = lookup('1.2.3.4');
  await vi.advanceTimersByTimeAsync(25);
  expect(await first).toBeNull();
  resolve();
  expect(await lookup('1.2.3.4')).toEqual({country:'NG'});
  expect(api.reload).toHaveBeenCalledTimes(1);
});
it('treats initialization failure as missing location without retry storms', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const load = vi.fn(() => { throw new Error('unavailable'); });
  const lookup = createIpLookup(load);
  expect(await lookup('1.2.3.4')).toBeNull();
  expect(await lookup('1.2.3.4')).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
});
