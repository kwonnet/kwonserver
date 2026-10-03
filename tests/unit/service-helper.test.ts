import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const deps = vi.hoisted(() => ({ del: vi.fn(), exists: vi.fn(), hash: vi.fn(), set: vi.fn(), update: vi.fn(), ranking: vi.fn(), rank: vi.fn() }));
vi.mock('@/db', () => ({ default: { wallet: { update: deps.update } } }));
vi.mock('@/redis', () => ({ default: { del: deps.del, exists: deps.exists, hGetAll: deps.hash, hSet: deps.set, zRangeWithScores: deps.ranking, zRevRank: deps.rank } }));
vi.mock('wordlist-english', () => ({ default: { english: ['cat', 'act', 'tact', 'dog'] } }));
import * as h from '@/services/helper';
import { GameType, GameCatType } from '@/types';
beforeEach(() => { resetMocks(deps); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
it('returns null for empty Redis hashes and parses numeric balances', async () => {
  deps.hash.mockResolvedValue({}); expect(await h.getRedisHashKey('key')).toBeNull();
  deps.hash.mockResolvedValue({ amount: '12.5', id: 'w' }); expect(await h.getRedisHashKey('key')).toEqual({ amount: 12.5, id: 'w' });
});
it('never overwrites PostgreSQL from stale Redis snapshots', async () => {
 deps.hash.mockResolvedValue({ id: 'w', amount: '99999' });
 await h.syncRedisUserWalletToPrisma('u'); await h.syncRedisSenderRecipientWalletToPrisma('s','r');
 expect(deps.update).not.toHaveBeenCalled(); expect(deps.hash).not.toHaveBeenCalled();
});
it('invalidates old cache entries without publishing stale balances', async () => {
 await h.syncPrismaUserWalletToRedis('u', {} as any);
 expect(deps.del).toHaveBeenCalledWith('user:u:wallet'); expect(deps.set).not.toHaveBeenCalled();
});
it('reports invalidation failure without writing balances', async () => {
 deps.del.mockRejectedValue(new Error('cache unavailable'));
 expect((await h.syncPrismaUserWalletToRedis('u', {} as any)).isError).toBe(true);
 expect((await h.syncRedisUserWalletToPrisma('u')).isError).toBe(false);
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

it('invalidates both transfer participants without copying balances',async()=>{
 await h.syncPrismaSenderRecipientWalletToRedis({isSenderExists:true,isRecipientExists:true,senderWallet:{userId:'sender'} as any,recipientWallet:{userId:'recipient'} as any});
 expect(deps.del).toHaveBeenCalledWith('user:sender:wallet');expect(deps.del).toHaveBeenCalledWith('user:recipient:wallet');expect(deps.update).not.toHaveBeenCalled();
});
