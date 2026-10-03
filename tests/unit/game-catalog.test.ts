import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const deps = vi.hoisted(() => {
  const model = () => ({ create: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() });
  return { db: { game: model(), gameCategory: model(), gameRoom: model() }, redis: { get: vi.fn(), hGetAll: vi.fn(), del: vi.fn() } };
});
vi.mock('@/db', () => ({ default: deps.db }));
vi.mock('@/redis', () => ({ default: deps.redis }));
vi.mock('@/services/helper', () => ({ calculateWordMakerPlayerScore: vi.fn(), getGameCatType: vi.fn(), getGameType: vi.fn(), syncPrismaUserWalletToRedis: vi.fn(), syncRedisUserWalletToPrisma: vi.fn() }));
vi.mock('@/utils/ai', () => ({ generateRoomQuestion: vi.fn(), shuffleArray: vi.fn() }));
import * as games from '@/services/v1/games';
beforeEach(() => resetMocks(deps));
for (const [name, run, model, data] of [
  ['game', games.createGame, deps.db.game, { name: 'Words', description: 'Word game', userId: 'u' }],
  ['category', games.createGameCategory, deps.db.gameCategory, { name: 'Words', description: 'category', userId: 'u', gameId: 'g' }],
  ['room', games.createGameCategoryRoom, deps.db.gameRoom, { name: 'Room', description: 'room', userId: 'u', catId: 'cat' }],
] as const) {
  it(`persists a ${name} with its creator and parent`, async () => {
    model.create.mockResolvedValue({ id: 'created', ...data }); expect((await (run as any)(data)).status).toBe(200); expect(model.create).toHaveBeenCalledWith({ data });
  });
  it(`handles ${name} creation failure`, async () => { model.create.mockRejectedValue(new Error('db')); expect((await (run as any)(data)).status).toBe(500); });
}
it.each([{ rows: [] }, { rows: [{ id: 'g' }] }])('lists available games', async ({ rows }) => {
  deps.db.game.findMany.mockResolvedValue(rows); expect(await games.getGames()).toMatchObject({ status: 200, data: rows });
});
it('loads categories for an existing game', async () => {
  deps.db.game.findUniqueOrThrow.mockResolvedValue({ id: 'g' }); deps.db.gameCategory.findMany.mockResolvedValue([{ id: 'cat' }]);
  expect(await games.getGameCategories('g')).toMatchObject({ status: 200, data: { game: { id: 'g' }, categories: [{ id: 'cat' }] } });
  expect(deps.db.gameCategory.findMany).toHaveBeenCalledWith({ where: { gameId: 'g' } });
});
it('does not query categories for a missing game', async () => {
  deps.db.game.findUniqueOrThrow.mockRejectedValue(new Error('missing')); expect((await games.getGameCategories('g')).status).toBe(500); expect(deps.db.gameCategory.findMany).not.toHaveBeenCalled();
});
it('adds participant counts to rooms for the selected mode', async () => {
  deps.db.gameRoom.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]); deps.redis.get.mockResolvedValueOnce('8').mockResolvedValueOnce(null);
  expect(await games.getGameCategoryRooms('cat', 'multi')).toMatchObject({ status: 200, data: [{ id: 'r1', participants: 8 }, { id: 'r2', participants: 0 }] });
  expect(deps.redis.get.mock.calls).toEqual([['room:multi-r1:participants'], ['room:multi-r2:participants']]);
});
it('returns a room and loads its game ancestry when checking it', async () => {
  deps.db.gameRoom.findUniqueOrThrow.mockResolvedValue({ id: 'r' });
  expect(await games.getGameCategoryRoom('r')).toEqual({ status: 200, data: { id: 'r' } });
  expect(await games.checkGameRoom('r')).toEqual({ id: 'r' });
  expect(deps.db.gameRoom.findUniqueOrThrow).toHaveBeenLastCalledWith({ where: { id: 'r' }, include: { category: { include: { game: true } } } });
});
it('returns null for a missing game room', async () => { deps.db.gameRoom.findUniqueOrThrow.mockRejectedValue(new Error('missing')); expect(await games.checkGameRoom('r')).toBeNull(); });
it.each(['games', 'rooms', 'room'])('handles %s lookup failure', async kind => {
  deps.db.game.findMany.mockRejectedValue(new Error('db')); deps.db.gameRoom.findMany.mockRejectedValue(new Error('db')); deps.db.gameRoom.findUniqueOrThrow.mockRejectedValue(new Error('db'));
  expect((await (kind === 'games' ? games.getGames() : kind === 'rooms' ? games.getGameCategoryRooms('c', 'multi') : games.getGameCategoryRoom('r'))).status).toBe(500);
});
it.each([{ value: {}, expected: null }, { value: { score: '12', name: 'Ada' }, expected: { score: 12, name: 'Ada' } }])('decodes a cached game hash', async ({ value, expected }) => {
  deps.redis.hGetAll.mockResolvedValue(value); expect(await games.getRedisHashKey('key')).toEqual(expected);
});

it('clears quiz room history only on room lifecycle cleanup',async()=>{
 await games.cleanUpGameRoom('r');
 expect(deps.redis.del).toHaveBeenCalledWith('room:r:question-history');
});
