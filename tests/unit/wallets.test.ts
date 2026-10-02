import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ wallet: { findFirst: vi.fn(), update: vi.fn() }, user: { findFirst: vi.fn() },
  transaction: { create: vi.fn() }, $transaction: vi.fn() }));
const sync = vi.hoisted(() => ({ fromRedis: vi.fn(), toRedis: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/v1/games', () => ({ getRedisHashKey: vi.fn() }));
vi.mock('@/services/helper', () => ({ syncRedisSenderRecipientWalletToPrisma: sync.fromRedis,
  syncPrismaSenderRecipientWalletToRedis: sync.toRedis, syncPrismaUserWalletToRedis: vi.fn(), syncRedisUserWalletToPrisma: vi.fn() }));
import { transferCoins, getUserCoinsWallet } from '@/services/v1/wallets';
beforeEach(() => {
  db.user.findFirst.mockReset(); db.wallet.findFirst.mockReset(); db.wallet.update.mockReset(); db.transaction.create.mockReset();
  db.$transaction.mockReset().mockImplementation((queries: any[]) => Promise.all(queries));
  sync.fromRedis.mockReset().mockResolvedValue({ isError: false, data: { isSenderExists: true, isRecipientExists: true } });
  sync.toRedis.mockReset();
});
const args = { senderId: 's', recipientId: 'r', amount: 100 };
function accounts(balance = 200) {
  db.user.findFirst.mockResolvedValueOnce({ id: 's', name: 'Sender', wallet: { id: 'sw', coins: balance } })
    .mockResolvedValueOnce({ id: 'r', name: 'Recipient', wallet: { id: 'rw', coins: 0 } });
}
it('looks up a wallet by user and handles not found or storage errors', async () => {
  db.wallet.findFirst.mockResolvedValue({ coins: 12 }); expect((await getUserCoinsWallet('u')).data).toEqual({ coins: 12 });
  expect(db.wallet.findFirst).toHaveBeenCalledWith({ where: { userId: 'u' } });
  db.wallet.findFirst.mockResolvedValue(null); expect((await getUserCoinsWallet('u')).status).toBe(404);
  db.wallet.findFirst.mockRejectedValue(new Error('db')); expect((await getUserCoinsWallet('u')).status).toBe(500);
});
it('aborts transfers if cache synchronization fails', async () => {
  sync.fromRedis.mockResolvedValue({ isError: true, message: 'sync failed' }); expect((await transferCoins(args)).status).toBe(500);
  expect(db.user.findFirst).not.toHaveBeenCalled();
});
it.each([['sender', null, { wallet: {} }], ['recipient', { wallet: {} }, null]])('requires a %s wallet', async (_name, sender, recipient) => {
  db.user.findFirst.mockResolvedValueOnce(sender).mockResolvedValueOnce(recipient);
  expect((await transferCoins(args)).status).toBe(404); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([[99, 200, 'Minimun'], [100, 99, 'Insufficient balance'], [100, 149, 'transaction fees']])('rejects amount %s with balance %s before mutations', async (amount, balance, message) => {
  accounts(Number(balance)); const result = await transferCoins({ ...args, amount: Number(amount) });
  expect(result.status).toBe(400); expect(result.message).toContain(message); expect(db.wallet.update).not.toHaveBeenCalled();
});
it('debits amount plus the current 50% fee and creates matching ledger entries', async () => {
  accounts(150); db.wallet.update.mockResolvedValue({ userId: 'u', coins: 0 });
  expect((await transferCoins(args)).status).toBe(200);
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 's' }, data: { isLocked: false, coins: { decrement: 150 } } });
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'r' }, data: { isLocked: false, coins: { increment: 100 } } });
  const entries = db.transaction.create.mock.calls.map(([query]) => query.data);
  expect(entries).toEqual([expect.objectContaining({ type: 'DEBIT', amount: 150, userId: 's', status: 'COMPLETED' }),
    expect.objectContaining({ type: 'CREDIT', amount: 100, userId: 'r', status: 'COMPLETED' })]);
  expect(entries[0].txnRef).toBe(entries[1].txnRef); expect(sync.toRedis).toHaveBeenCalledOnce();
});
it('does not sync balances back to Redis if the transaction fails', async () => {
  accounts(); db.$transaction.mockRejectedValueOnce(new Error('db'));
  expect((await transferCoins(args)).status).toBe(500); expect(sync.toRedis).not.toHaveBeenCalled();
});
