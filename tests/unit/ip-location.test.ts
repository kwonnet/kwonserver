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

it('retries a failed database initialization after cooldown without concurrent retry storms', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {});
  const api = {reload: vi.fn().mockRejectedValueOnce(new Error('download unavailable')).mockResolvedValue(undefined), lookup: vi.fn(() => ({country: 'NG'}))};
  const load = vi.fn(() => api as any);
  const lookup = createIpLookup(load, 25, 100);
  expect(await lookup('1.2.3.4')).toBeNull(); expect(lookup.status().state).toBe('failed');
  expect(await lookup('1.2.3.4')).toBeNull(); expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(await Promise.all([lookup('1.2.3.4'), lookup('2.3.4.5')])).toEqual([{country: 'NG'}, {country: 'NG'}]);
  expect(load).toHaveBeenCalledTimes(2); expect(lookup.status()).toMatchObject({state: 'ready', failures: 1});
});
it('warmup initializes before the first login, and IPv6 is looked up using the full unmasked address', async () => {
  const ip = '2605:59c0:e65:1234::1';
  const api = {reload: vi.fn().mockResolvedValue(undefined), lookup: vi.fn(() => ({country: 'CA'}))};
  const lookup = createIpLookup(() => api as any);
  await lookup.warmup(); expect(await lookup(ip)).toEqual({country: 'CA'});
  expect(api.lookup).toHaveBeenCalledWith(ip); expect(api.reload).toHaveBeenCalledOnce();
  expect(lookup.status().lastLookup).toBe('matched');
});
it('distinguishes absent range coverage from database/lookup failure without logging an IP', async () => {
  const api = {reload: vi.fn().mockResolvedValue(undefined), lookup: vi.fn().mockReturnValueOnce(null).mockRejectedValueOnce(new Error('lookup unavailable'))};
  const lookup = createIpLookup(() => api as any);
  expect(await lookup('1.2.3.4')).toBeNull(); expect(lookup.status().lastLookup).toBe('no_match');
  expect(await lookup('1.2.3.4')).toBeNull(); expect(lookup.status().lastLookup).toBe('lookup_failed');
  expect(JSON.stringify(lookup.status())).not.toContain('1.2.3.4');
});
