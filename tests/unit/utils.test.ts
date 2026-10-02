import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as u from '@/utils';
import { get_tzx_usd_rate, get_usd_tzx_rate } from '@/utils/payment';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00Z')); });
afterEach(() => vi.useRealTimers());
it('roundtrips signed encrypted auth payloads without plaintext leakage', () => {
  const viewer = { id: 'u', email: 'private@example.test' };
  const token = u.generateToken(viewer, { expiresIn: '24h' });
  expect(token).not.toContain(viewer.email); expect(u.getAuthTokenUser(token)).toEqual(viewer);
  expect(u.jwtDecode(token)).toHaveProperty('data'); expect(u.getAuthTokenUser()).toBeNull();
});
it('rejects tampered and expired JWTs', () => {
  const token = u.jwtSign({ id: 'u' }, { expiresIn: 1 });
  expect(() => u.jwtVerify(token + 'tampered')).toThrow();
  vi.advanceTimersByTime(2000); expect(() => u.jwtVerify(token)).toThrow('jwt expired');
});
it('decrypts structured payloads and rejects the wrong key', () => {
  const encrypted = u.encryptString('{"id":"u"}', 'key');
  expect(u.decryptString(encrypted, 'key')).toEqual({ id: 'u' });
  expect(() => u.decryptString(encrypted, 'wrong')).toThrow();
});
it('returns transformed Zod values and field or array validation errors', () => {
  const schema = z.object({ count: z.coerce.number().min(1), name: z.string() });
  expect(u.validateZodInput({ count: '2', name: 'Ada' }, schema).data).toEqual({ count: 2, name: 'Ada' });
  expect(u.validateZodInput({ count: 0, name: 5 }, schema)).toMatchObject({ data: null, errors: { count: expect.any(String), name: expect.any(String) } });
  expect(u.validateZodInput({}, schema, true).errors).toHaveLength(2);
});
it.each([[0, false], [3600000, false], [3600001, true]])('hour threshold offset %s', (age, expected) => {
  expect(u.isDateHourElapsed(new Date(Date.now() - Number(age)).toISOString(), 1)).toBe(expected);
});
it.each([[60000, false], [60001, true]])('minute threshold offset %s', (age, expected) => {
  expect(u.isDateMinuteElapsed(new Date(Date.now() - Number(age)), 1)).toBe(expected);
});
it('handles leap-year February and year rollover in reward dates', () => {
  vi.setSystemTime(new Date('2024-02-28T12:00:00Z')); expect(u.getRemainingDaysInMonth()).toBe(1);
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  expect(u.getRewardDateInfo()).toMatchObject({ yearlyRewardYear: 2025, monthlyRewardYear: 2025, monthlyRewardMonth: 12,
    dailyRewardYear: 2025, dailyRewardMonth: 12, dailyRewardDay: 31 });
});
it('computes the previous calendar month even on the 31st', () => {
  vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
  expect(u.getRewardDateInfo()).toMatchObject({ monthlyRewardYear: 2026, monthlyRewardMonth: 2 });
});
it('uses UTC for current dates, week numbers and expiration boundaries', () => {
  expect(u.getCurrentDataInfo()).toEqual({ year: 2026, month: 10, day: 1, week: 40 });
  expect(u.getDateInfo()).toMatchObject({ currentYear: 2026, currentMonth: 10, currentDay: 1, previousMonth: 9, previousDay: 30 });
  expect(u.getWeekNumber(new Date('2026-10-01T00:00:00Z'))).toBe(1);
  expect(u.getExpiryAtUTC(1)).toBe(Date.parse('2026-10-02T00:00:00Z') / 1000);
  expect(u.getMonthlyExpiration()).toBe(Math.floor((Date.parse('2026-11-01T00:00:00Z') - 1 - Date.now()) / 1000));
});
it('namespaces ranking and player keys by user, category, mode and period', () => {
  expect(u.getRankingKeys('cat', 'single').today).toBe('ranking:cat:cat:mode:single:2026:10:today:1');
  const player = u.getPlayerRedisKeys('u', 'cat', 'multi');
  for (const ranking of ['today', 'week', 'month']) expect(u.getPlayerRankingKey({ playerId: 'u', catId: 'cat', mode: 'multi', ranking })).toBe(player[ranking as keyof typeof player]);
  expect(u.getUserRedisKeys('u')).toEqual({ session: 'user:u:session', wallet: 'user:u:wallet', txn: 'user:u:transactions' });
  expect(u.getRankingRewardKeys('cat', 'single').rewardMonth).toContain(':2026:9:month:9');
  expect(u.getPlayerRewardKeys('u', 'cat', 'single').month).toContain(':2026:9:month:9');
  expect(u.getSpentCoinsKey({ gameId: 'g', catId: 'cat', mode: 'SINGLE' as any })).toBe('game:g:category:cat:single:2026:10:spent');
  expect(u.getSpentCoinsKey({ gameId: 'g', catId: 'cat', mode: 'MULTI' as any, dateInfo: { year: 2025, month: 2 } })).toBe('game:g:category:cat:multi:2025:2:spent');
});
it('chooses both ends of the configured game timer range', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0); expect(u.getGameRandomTimer()).toBe(18);
  vi.mocked(Math.random).mockReturnValue(0.999999); expect(u.getGameRandomTimer()).toBe(10);
});
it('rounds random values predictably and formats month names', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  expect(u.getRandomNumber(10, 15)).toBe(11.3); expect(u.getRandomNumber(10, 15, true)).toBe(11);
  expect(u.getStringMonth(12)).toBe('december'); expect(u.getStringMonth(0)).toBeUndefined();
});
it('converts numeric Redis hash values without mutating input', () => {
  const input = { amount: '12.5', bonus: '0', id: 'user-a' };
  expect(u.parseStringNumbers(input)).toEqual({ amount: 12.5, bonus: 0, id: 'user-a' }); expect(input.amount).toBe('12.5');
});
it('creates numeric references and message identifiers', () => {
  expect(u.generateUniqueRef()).toMatch(/^\d{16}$/); expect(u.generateUniqueRef(10)).toMatch(/^\d{10}$/);
  const message = u.composeMessage({ content: 'hi' }); expect(message).toMatchObject({ content: 'hi', playerName: 'SWEN', createdAt: new Date().toISOString() });
  expect(message.id).not.toBe(message.playerId);
  expect(u.composeMessage({ content: 'hi', playerId: 'p', playerName: 'Ada' })).toMatchObject({ playerId: 'p', playerName: 'Ada' });
});
it('extracts IDs or returns null when absent', () => {
  expect(u.extractCatId('ranking:cat:abc123:mode:single')).toBe('abc123'); expect(u.extractCatId('other')).toBeNull();
  expect(u.extractId('file_0123456789abcdef01234567_end')).toBe('0123456789abcdef01234567'); expect(u.extractId('file')).toBeNull();
});
it('sleeps only for the requested time', async () => {
  const done = vi.fn(); const pending = u.sleep(100).then(done);
  await vi.advanceTimersByTimeAsync(99); expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending; expect(done).toHaveBeenCalledOnce();
});
it('converts currency amounts with two-decimal rounding', () => {
  expect(get_tzx_usd_rate(100)).toBe(1.3); expect(get_usd_tzx_rate(1.3)).toBe(100);
  expect(get_usd_tzx_rate(1)).toBe(76.92); expect(get_tzx_usd_rate(0)).toBe(0);
});
