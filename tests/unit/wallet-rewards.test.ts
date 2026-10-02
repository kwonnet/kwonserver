import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, wallet: { update: vi.fn() },
  transaction: { findMany: vi.fn(), create: vi.fn() }, task: { findFirst: vi.fn() },
  userTask: { create: vi.fn() }, userTaskSettings: { findFirst: vi.fn(), upsert: vi.fn() }, $transaction: vi.fn() }));
const sync = vi.hoisted(() => ({ from: vi.fn(), to: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/v1/games', () => ({ getRedisHashKey: vi.fn() }));
vi.mock('@/services/helper', () => ({ syncRedisUserWalletToPrisma: sync.from, syncPrismaUserWalletToRedis: sync.to }));
import { fundCoins, getTxnHistory, rewardDailyTask, updateWalletBonus } from '@/services/v1/wallets';
const wallet = { id: 'w', userId: 'u', coins: 100, bonus: 10, credit: 20 };
const bonus = () => ({ userId: 'u', amount: 5, type: 'BONUS' as any, isTask: false, date: '2026-10-02T00:00:00Z' });
const task = () => ({ id: 't', code: 'secret-code', reward: 10, rewardType: 'BONUS', performedBy: [] });
beforeEach(() => {
  resetMocks(db); resetMocks(sync); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  sync.from.mockResolvedValue({ isError: false }); db.user.findFirst.mockResolvedValue({ id: 'u', wallet });
  db.wallet.update.mockResolvedValue(wallet); db.task.findFirst.mockResolvedValue(task());
  db.$transaction.mockImplementation((queries: any[]) => Promise.all(queries));
});
afterEach(() => vi.useRealTimers());
it.each([[5, 0], [0, 5], [5, 5]])('funds coins=%s bonus=%s with an attributed ledger entry', async (amount, extra) => {
  expect(await fundCoins({ userId: 'u', amount, bonus: extra }, { id: 'admin', name: 'Admin', role: 'ADMIN' } as any)).toEqual({ status: 200, data: 'Funding successful' });
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'u' }, data: { coins: { increment: amount }, bonus: { increment: extra } } });
  expect(db.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount, senderId: 'admin', recipientId: 'u', type: 'CREDIT', status: 'COMPLETED' }) });
  expect(sync.to).toHaveBeenCalledWith('u', wallet);
});
it.each(['fund', 'bonus', 'task'])('%s stops on cache synchronization failure', async kind => {
  sync.from.mockResolvedValue({ isError: true, message: 'cache unavailable' });
  const result = await (kind === 'fund' ? fundCoins({ userId: 'u', amount: 1, bonus: 0 }, { role: 'ADMIN' } as any)
    : kind === 'bonus' ? updateWalletBonus(bonus()) : rewardDailyTask({ id: 't', code: 'secret-code', userId: 'u' }));
  expect(result.status).toBe(500); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(['fund', 'bonus', 'task'])('%s rejects missing wallets before any transaction', async kind => {
  db.user.findFirst.mockResolvedValue({ id: 'u', wallet: null });
  const result = await (kind === 'fund' ? fundCoins({ userId: 'u', amount: 1, bonus: 0 }, { role: 'ADMIN' } as any)
    : kind === 'bonus' ? updateWalletBonus(bonus()) : rewardDailyTask({ id: 't', code: 'secret-code', userId: 'u' }));
  expect(result.status).toBe(404); expect(db.$transaction).not.toHaveBeenCalled();
});
it('paginates history within the authenticated user account', async () => {
  db.transaction.findMany.mockResolvedValue([{ id: 'txn' }]);
  expect(await getTxnHistory({ userId: 'u', page: 3, limit: 10 })).toEqual({ status: 200, data: [{ id: 'txn' }] });
  expect(db.transaction.findMany).toHaveBeenCalledWith({ where: { userId: 'u' }, skip: 20, take: 10, orderBy: [{ createdAt: 'desc' }] });
});
it('handles empty and failed transaction history lookups', async () => {
  db.transaction.findMany.mockResolvedValue([]); expect((await getTxnHistory({ userId: 'u', page: 1, limit: 10 })).status).toBe(404);
  db.transaction.findMany.mockRejectedValue(new Error('private')); expect((await getTxnHistory({ userId: 'u', page: 1, limit: 10 })).status).toBe(500);
});
it.each(['BONUS', 'ADS'])('enforces the %s reward cooldown independently', async type => {
  const field = type === 'BONUS' ? 'dailyBonusDate' : 'adsBonusDate';
  db.userTaskSettings.findFirst.mockResolvedValue({ [field]: new Date(Date.now() + 1) });
  expect((await updateWalletBonus({ ...bonus(), type: type as any })).status).toBe(400);
  expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(['BONUS', 'ADS'])('allows %s at the exact expiry and updates its own timer', async type => {
  const field = type === 'BONUS' ? 'dailyBonusDate' : 'adsBonusDate';
  const otherField = type === 'BONUS' ? 'adsBonusDate' : 'dailyBonusDate';
  db.userTaskSettings.findFirst.mockResolvedValue({ [field]: new Date(), [otherField]: new Date(Date.now() + 10000) });
  expect((await updateWalletBonus({ ...bonus(), type: type as any })).status).toBe(200);
  expect(db.userTaskSettings.upsert).toHaveBeenCalledWith({ where: { userId: 'u' },
    update: { [field]: new Date(bonus().date) }, create: { userId: 'u', [field]: new Date(bonus().date) } });
});
it('records task metadata for a bonus reward', async () => {
  await updateWalletBonus({ ...bonus(), isTask: true, meta: { taskId: 't' } });
  expect(db.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: 'APP_TASK',
    metadata: { currency: 'COINS', item: { amount: 0, bonus: 5, recipient: 'u', item: { taskId: 't' } } } }) });
});
it.each([['missing', null, 404], ['completed', { ...task(), performedBy: [{ id: 'done' }] }, 422],
  ['wrong code', task(), 422]] as const)('rejects a %s task claim without rewarding it', async (_name, row, status) => {
  db.task.findFirst.mockResolvedValue(row); expect((await rewardDailyTask({ id: 't', userId: 'u', code: 'wrong' })).status).toBe(status);
  expect(sync.from).not.toHaveBeenCalled(); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([['CREDIT', 'credit', 'TZX'], ['COINS', 'coins', 'COINS'], ['BONUS', 'bonus', 'COINS']])('credits %s rewards to the correct wallet field', async (type, field, currency) => {
  db.task.findFirst.mockResolvedValue({ ...task(), rewardType: type });
  expect((await rewardDailyTask({ id: 't', userId: 'u', code: 'secret-code' })).status).toBe(200);
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'u' }, data: { [field]: { increment: 10 } } });
  expect(db.userTask.create).toHaveBeenCalledWith({ data: { taskId: 't', userId: 'u', status: 'COMPLETED' } });
  expect(db.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ currency, taskId: 't', amount: 10 }) });
  expect(sync.to).toHaveBeenCalledWith('u', wallet);
});
it('allows tasks that do not require a code', async () => {
  db.task.findFirst.mockResolvedValue({ ...task(), code: null }); expect((await rewardDailyTask({ id: 't', userId: 'u' })).status).toBe(200);
});
it.each(['fund', 'bonus', 'task'])('%s does not publish updated balances on transaction failure', async kind => {
  db.$transaction.mockRejectedValue(new Error('private db error'));
  const result = await (kind === 'fund' ? fundCoins({ userId: 'u', amount: 1, bonus: 0 }, { role: 'ADMIN' } as any)
    : kind === 'bonus' ? updateWalletBonus(bonus()) : rewardDailyTask({ id: 't', code: 'secret-code', userId: 'u' }));
  expect(result.status).toBe(500); expect(sync.to).not.toHaveBeenCalled();
});

it.each(['USER', undefined])('refuses wallet minting by role %s before cache or database access', async role => {
  expect((await fundCoins({ userId: 'u', amount: 100, bonus: 100 }, { role } as any)).status).toBe(403);
  expect(sync.from).not.toHaveBeenCalled(); expect(db.wallet.update).not.toHaveBeenCalled();
});
