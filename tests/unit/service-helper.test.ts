import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const deps = vi.hoisted(() => ({ exists: vi.fn(), hash: vi.fn(), set: vi.fn(), update: vi.fn(), ranking: vi.fn(), rank: vi.fn() }));
vi.mock('@/db', () => ({ default: { wallet: { update: deps.update } } }));
vi.mock('@/redis', () => ({ default: { exists: deps.exists, hGetAll: deps.hash, hSet: deps.set, zRangeWithScores: deps.ranking, zRevRank: deps.rank } }));
vi.mock('wordlist-english', () => ({ default: { english: ['cat', 'act', 'tact', 'dog'] } }));
import * as h from '@/services/helper';
import { GameType, GameCatType } from '@/types';
beforeEach(() => { resetMocks(deps); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
it('returns null for empty Redis hashes and parses numeric balances', async () => {
  deps.hash.mockResolvedValue({}); expect(await h.getRedisHashKey('key')).toBeNull();
  deps.hash.mockResolvedValue({ amount: '12.5', id: 'w' }); expect(await h.getRedisHashKey('key')).toEqual({ amount: 12.5, id: 'w' });
});
it('syncs cached wallet values into Prisma only when present', async () => {
  deps.exists.mockResolvedValue(0); expect((await h.syncRedisUserWalletToPrisma('u')).isError).toBe(false); expect(deps.update).not.toHaveBeenCalled();
  deps.exists.mockResolvedValue(1); deps.hash.mockResolvedValue({ id: 'w', userId: 'u', amount: '10', bonus: '2', credit: '3' });
  await h.syncRedisUserWalletToPrisma('u');
  expect(deps.update).toHaveBeenCalledWith({ where: { id: 'w', userId: 'u' }, data: { coins: 10, bonus: 2, credit: 3 } });
});
it('does not overwrite database balances from an empty cache hash', async () => {
  deps.exists.mockResolvedValue(1); deps.hash.mockResolvedValue({}); await h.syncRedisUserWalletToPrisma('u'); expect(deps.update).not.toHaveBeenCalled();
});
it('formats cached balances to two decimals and skips absent caches', async () => {
  const wallet: any = { userId: 'u', credit: 1.234, coins: 10, bonus: 2.5 };
  deps.exists.mockResolvedValue(0); await h.syncPrismaUserWalletToRedis('u', wallet); expect(deps.set).not.toHaveBeenCalled();
  deps.exists.mockResolvedValue(1); await h.syncPrismaUserWalletToRedis('u', wallet);
  expect(deps.set.mock.calls).toEqual([['user:u:wallet', 'credit', '1.23'], ['user:u:wallet', 'amount', '10.00'], ['user:u:wallet', 'bonus', '2.50']]);
});
it.each(['syncRedisUserWalletToPrisma', 'syncPrismaUserWalletToRedis'] as const)('%s reports cache failures', async name => {
  deps.exists.mockRejectedValue(new Error('cache unavailable'));
  expect(await (h[name] as any)('u', {})).toEqual({ isError: true, message: 'cache unavailable' });
});
it('syncs both parties and reports which cached wallets existed', async () => {
  deps.exists.mockResolvedValue(1);
  deps.hash.mockResolvedValueOnce({ id: 's-wallet', userId: 's', amount: '10', bonus: '2', credit: '3' })
    .mockResolvedValueOnce({ id: 'r-wallet', userId: 'r', amount: '5', bonus: '0', credit: '0' });
  expect(await h.syncRedisSenderRecipientWalletToPrisma('s', 'r')).toMatchObject({ isError: false, data: { isSenderExists: true, isRecipientExists: true } });
  expect(deps.update).toHaveBeenCalledTimes(2);
  expect(deps.update.mock.calls[1][0]).toEqual({ where: { id: 'r-wallet', userId: 'r' }, data: { coins: 5, bonus: 0, credit: 0 } });
});
it('skips uncached parties and reports multi-wallet sync errors', async () => {
  deps.exists.mockResolvedValue(0); await h.syncRedisSenderRecipientWalletToPrisma('s', 'r'); expect(deps.update).not.toHaveBeenCalled();
  deps.exists.mockRejectedValue(new Error('cache')); expect((await h.syncRedisSenderRecipientWalletToPrisma('s', 'r')).isError).toBe(true);
});
it.each([[true, true, 6], [true, false, 3], [false, false, 0]])('updates only existing caches: sender=%s recipient=%s', async (sender, recipient, calls) => {
  await h.syncPrismaSenderRecipientWalletToRedis({ isSenderExists: Boolean(sender), isRecipientExists: Boolean(recipient),
    senderWallet: { userId: 's', credit: 0, coins: 10, bonus: 0 } as any, recipientWallet: { userId: 'r', credit: 0, coins: 5, bonus: 0 } as any });
  expect(deps.set).toHaveBeenCalledTimes(Number(calls));
});
it.each(['MONTH', 'WEEK', 'DAY'] as const)('returns %s reward leaderboard with one-based ranks and parsed stats', async period => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  deps.ranking.mockResolvedValue([{ value: 'u', score: 100 }]); deps.rank.mockResolvedValue(0);
  deps.hash.mockResolvedValueOnce({ name: 'Ada' }).mockResolvedValueOnce({ score: '100', numPlayed: '3' });
  expect(await h.getRewardTopRankingPlayers({ page: 2, limit: 5, catId: 'cat', mode: 'single', rankingKey: 'rank' }, period)).toEqual([{ name: 'Ada', score: 100, numPlayed: 3, rank: 1 }]);
  expect(deps.ranking).toHaveBeenCalledWith('rank', expect.any(String), '0', { LIMIT: { offset: 5, count: 5 }, BY: 'SCORE', REV: true });
});
it.each(['MONTH', 'WEEK', 'DAY'] as const)('returns %s category leaderboard with safe defaults for missing statistics', async period => {
  deps.ranking.mockResolvedValue([{ value: 'u', score: 100 }]); deps.rank.mockResolvedValue(null); deps.hash.mockResolvedValue({});
  expect(await h.getCategoryRankingPlayerData({ offset: 0, limit: 5, catId: 'cat', mode: 'multi', rankingKey: 'rank' }, period)).toEqual([{ score: 0, numPlayed: 0, rank: 0 }]);
});
it.each(Object.values(GameType))('detects game type %s case-insensitively', name => expect(h.getGameType(`${name.toLowerCase()} challenge`)).toBe(name));
it.each(Object.values(GameCatType))('detects category %s case-insensitively', name => expect(h.getGameCatType(name.toLowerCase())).toBe(name));
it('defaults unknown games and rejects unknown categories', () => {
  expect(h.getGameType('unknown')).toBe('TRIVIA'); expect(h.getGameCatType('unknown')).toBeUndefined();
});
it.each(['ACRONYM', 'TRIVIA'])('composes %s answers from authoritative room and player data', type => {
  const result = h.composeGameAnswer({ params: { gameType: type, playerId: 'spoofed', score: 999 } as any,
    room: { id: 'room', name: 'Room', catId: 'cat', mode: 'MULTI' } as any, user: { id: 'u', name: 'Ada' } as any });
  expect(result).toMatchObject({ playerId: 'u', roomId: 'room', catId: 'cat', name: 'Ada', mode: 'MULTI' });
  if (type === 'ACRONYM') expect(result).toMatchObject({ score: 0, votes: [], voted: false, answerId: expect.any(String) });
});
it('scores only dictionary words that fit the base letter counts and exceed two letters', () => {
  expect(h.calculateWordMakerPlayerScore('CAT', [
    { text: 'cat', timer: 5 }, { text: 'act', timer: 2 }, { text: 'at', timer: 100 },
    { text: 'tact', timer: 100 }, { text: 'dog', timer: 100 }, { text: 'tac', timer: 100 },
  ])).toEqual({ score: 37, answer: 'cat,act' });
  expect(h.calculateWordMakerPlayerScore('cat', []).score).toBe(0);
});
