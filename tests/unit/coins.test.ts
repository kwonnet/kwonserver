import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ coinPackage: { findMany: vi.fn(), findUnique: vi.fn() },
  wallet: { findFirst: vi.fn(), update: vi.fn() }, user: { findFirst: vi.fn() },
  transaction: { create: vi.fn() }, transactionLogs: { create: vi.fn() }, $transaction: vi.fn() }));
const sync = vi.hoisted(() => ({ from: vi.fn(), to: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/helper', () => ({ syncRedisUserWalletToPrisma: sync.from, syncPrismaUserWalletToRedis: sync.to }));
import * as c from '@/services/v1/coins';
const viewer: any = { id: 'u' };
const coin = { id: 'pack', name: 'Starter', amount: 100, bonus: 10, price: 5 };
const wallet = { id: 'wallet', userId: 'u', credit: 5, coins: 0, isLocked: false };
const item: any = { id: 'pack', currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT', userId: 'u',
  txnRef: 'external-ref', coin, meta: { amount: 5, currency: 'USD', txnRef: 'external-ref', txn: { amount: 5 } } };
beforeEach(() => {
  resetMocks(db); resetMocks(sync); vi.spyOn(console, 'log').mockImplementation(() => {});
  db.coinPackage.findUnique.mockResolvedValue(coin); db.wallet.findFirst.mockResolvedValue(wallet);
  db.user.findFirst.mockResolvedValue(viewer); db.wallet.update.mockResolvedValue({ ...wallet, coins: 100 });
  db.$transaction.mockImplementation((queries: any[]) => Promise.all(queries)); sync.from.mockResolvedValue({ isError: false });
});
it.each([{ rows: [] }, { rows: [coin] }])('returns the catalog with no retired addresses', async ({ rows }) => {
  db.coinPackage.findMany.mockResolvedValue(rows); expect(await c.getCoinPackages()).toEqual({ status: 200, data: { packages: rows, addresses: [] } });
});
it('handles catalog failure', async () => {
  db.coinPackage.findMany.mockRejectedValue(new Error('private')); expect((await c.getCoinPackages()).status).toBe(500);
});
it('attributes payment logs to the authenticated user', async () => {
  db.transactionLogs.create.mockResolvedValue({ id: 'log' }); expect((await c.saveTxnLog(item, viewer)).status).toBe(200);
  expect(db.transactionLogs.create).toHaveBeenCalledWith({ data: { userId: 'u', coinPackageId: 'pack', meta: { currency: 'USD', coinId: 'pack', ...item.meta } } });
});
it('reports logging failures', async () => {
  db.transactionLogs.create.mockRejectedValue(new Error('failed')); expect((await c.saveTxnLog(item, viewer)).status).toBe(500);
});
const purchases = [
  { name: 'wallet', run: () => c.purchaseCoinsWithWallet({ ...item, currency: 'TZX' }, viewer) },
  { name: 'token', run: () => c.purchaseCoinsWithToken(item, viewer) },
  { name: 'flutterwave', run: () => c.purchaseCoinsWithFlutterwave(item) },
];
it.each(purchases)('$name rejects missing packages', async ({ run }) => {
  db.coinPackage.findUnique.mockResolvedValue(null); expect((await run()).status).toBe(400); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(purchases)('$name rejects missing wallets', async ({ run }) => {
  db.wallet.findFirst.mockResolvedValue(null); expect((await run()).status).toBe(400); expect(db.transaction.create).not.toHaveBeenCalled();
});
it('rejects a missing external-purchase user', async () => {
  db.user.findFirst.mockResolvedValue(null); expect((await c.purchaseCoinsWithFlutterwave(item)).status).toBe(404); expect(db.coinPackage.findUnique).not.toHaveBeenCalled();
});
it.each([{ isLocked: true, credit: 100 }, { isLocked: false, credit: 4.99 }])('rejects unavailable or underfunded wallet purchases %j', async override => {
  db.wallet.findFirst.mockResolvedValue({ ...wallet, ...override });
  expect((await c.purchaseCoinsWithWallet(item, viewer)).status).toBe(400); expect(db.$transaction).not.toHaveBeenCalled();
});
it.each(purchases)('$name records balanced purchase entries and refreshes the cache', async ({ run, name }) => {
  expect((await run()).status).toBe(200);
  const entries = db.transaction.create.mock.calls.map(([q]) => q.data);
  expect(entries).toEqual([expect.objectContaining({ type: 'DEBIT', amount: 5, userId: 'u', status: 'COMPLETED' }),
    expect.objectContaining({ type: 'CREDIT', amount: 100, currency: 'COINS', userId: 'u', status: 'COMPLETED' })]);
  expect(entries[0].txnRef).toBe(entries[1].txnRef);
  if (name !== 'wallet') expect(entries.map(row => row.exTxnRef)).toEqual(['external-ref', 'external-ref']);
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'u' }, data: {
    isLocked: false, coins: { increment: 100 }, bonus: { increment: 10 }, ...(name === 'wallet' ? { credit: { decrement: 5 } } : {}),
  } });
  expect(sync.to).toHaveBeenCalledWith('u', expect.objectContaining({ coins: 100 }));
});
it.each(purchases)('$name stops if cache reconciliation fails', async ({ run }) => {
  sync.from.mockResolvedValue({ isError: true, message: 'cache unavailable' });
  expect((await run()).status).toBe(500); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(purchases)('$name returns a generic transaction failure without updating Redis', async ({ run }) => {
  db.$transaction.mockRejectedValue(new Error('private database detail'));
  expect(await run()).toMatchObject({ status: 500, data: expect.not.stringContaining('private database detail') }); expect(sync.to).not.toHaveBeenCalled();
});
it.each(['TON', 'XTR'])('rejects retired %s payment methods before any database work', async currency => {
  expect((await c.purchaseCoinsWithToken({ ...item, currency }, viewer)).status).toBe(400);
  expect((await c.purchaseCoinsWithFlutterwave({ ...item, currency })).status).toBe(400);
  expect(db.coinPackage.findUnique).not.toHaveBeenCalled();
});
it.each(purchases)('$name respects a preexisting wallet lock', async ({ run }) => {
  db.wallet.findFirst.mockResolvedValue({ ...wallet, isLocked: true });
  expect((await run()).status).toBe(400); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(purchases)('$name releases its lock after transaction failure', async ({ run }) => {
  db.$transaction.mockRejectedValue(new Error('db'));
  expect((await run()).status).toBe(500);
  expect(db.wallet.update).toHaveBeenLastCalledWith({ where: { userId: 'u' }, data: { isLocked: false } });
});
it.each(purchases)('$name does not change locks after an early lookup failure', async ({ run }) => {
  db.coinPackage.findUnique.mockRejectedValue(new Error('db'));
  expect((await run()).status).toBe(500); expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(purchases)('$name returns an error even when lock cleanup also fails', async ({ run }) => {
  db.wallet.update.mockResolvedValueOnce(wallet).mockResolvedValueOnce(wallet).mockRejectedValueOnce(new Error('cleanup'));
  db.$transaction.mockRejectedValue(new Error('transaction'));
  expect((await run()).status).toBe(500); expect(sync.to).not.toHaveBeenCalled();
});
