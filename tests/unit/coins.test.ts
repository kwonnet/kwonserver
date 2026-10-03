import { setupWalletTransaction } from './wallet-fixture';
import { markVerifiedPayment } from '@/services/walletLedger/verifiedPayment';
import { beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ coinPackage: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  wallet: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, user: { findFirst: vi.fn() },
  transaction: { findFirst: vi.fn(), create: vi.fn() }, transactionLogs: { create: vi.fn() }, $transaction: vi.fn() }));
const sync = vi.hoisted(() => ({ from: vi.fn(), to: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/helper', () => ({ syncRedisUserWalletToPrisma: sync.from, syncPrismaUserWalletToRedis: sync.to }));
import * as c from '@/services/v1/coins';
const viewer: any = { id: 'u' };
const coin = { id: 'pack', name: 'Starter', amount: 100, bonus: 10, ngnBonus: 15, price: 5, isActive: true };
const wallet = { id: 'wallet', userId: 'u', credit: 5, coins: 0, bonus: 0, isLocked: false };
const item: any = { idempotencyKey: 'purchase-test-1', id: 'pack', currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT', userId: 'u',
  txnRef: 'external-ref', coin, meta: { amount: 5, currency: 'USD', txnRef: 'external-ref', txn: { amount: 5 } } };
beforeEach(() => {
  resetMocks(db); resetMocks(sync); vi.spyOn(console, 'log').mockImplementation(() => {});
  db.coinPackage.findUnique.mockResolvedValue(coin); db.wallet.findFirst.mockResolvedValue(wallet);
  db.user.findFirst.mockResolvedValue(viewer); db.wallet.update.mockResolvedValue({ ...wallet, coins: 100 });
  setupWalletTransaction(db); db.wallet.findUniqueOrThrow.mockResolvedValue(wallet); db.coinPackage.findUniqueOrThrow.mockResolvedValue(coin); sync.from.mockResolvedValue({ isError: false });
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

it.each(['token','flutterwave'])('rejects unverified %s payment JSON before crediting',async kind=>{
 const result=kind==='token'?await c.purchaseCoinsWithToken(item,viewer):await c.purchaseCoinsWithFlutterwave(item);
 expect(result.status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([null,{...coin,isActive:false},{...coin,endDate:new Date('2000-01-01')}])('rejects unavailable wallet packages',async value=>{
 db.coinPackage.findUnique.mockResolvedValue(value);expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX'},viewer)).status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([{credit:4.99},{isLocked:true}])('rejects insufficient or locked wallets %j',async override=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({...wallet,...override});expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX'},viewer)).status).toBe(400);
});
it('atomically debits catalog price and records the full coin and bonus credit',async()=>{
 expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX',amount:0.01},viewer)).status).toBe(200);
 expect(db.wallet.update).toHaveBeenCalledWith({where:{id:'wallet'},data:{credit:0,coins:{increment:100},bonus:{increment:10}}});
 const entries=db.transaction.create.mock.calls.map(([q])=>q.data);
 expect(entries).toEqual([expect.objectContaining({amount:5,type:'DEBIT'}),expect.objectContaining({amount:110,type:'CREDIT',metadata:{coins:100,bonus:10}})]);
 expect(entries[0].txnRef).toBe(entries[1].txnRef);
});
it('credits server-verified Flutterwave payments with a stable provider ID',async()=>{
 expect((await c.purchaseCoinsWithFlutterwave(markVerifiedPayment(item,'provider-1'))).status).toBe(200);
 expect(db.transaction.create).toHaveBeenCalledTimes(2);
});
it('recognizes historical provider references without paying twice',async()=>{
 db.transaction.findFirst.mockResolvedValue({id:'prior'});expect((await c.purchaseCoinsWithFlutterwave(markVerifiedPayment(item,'provider-1'))).status).toBe(200);expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(['TON','XTR','USD'])('rejects %s for internal wallet purchases',async currency=>{
 expect((await c.purchaseCoinsWithWallet({...item,currency},viewer)).status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('does not use Redis availability as a condition for a committed purchase',async()=>{
 sync.from.mockRejectedValue(new Error('redis'));expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX'},viewer)).status).toBe(200);expect(sync.from).not.toHaveBeenCalled();
});
it('leaves lock ownership to the transaction on failure',async()=>{
 db.$transaction.mockRejectedValue(new Error('private'));expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX'},viewer)).status).toBe(500);expect(db.wallet.update).not.toHaveBeenCalled();
});

it('records coins-only purchases without a bonus component', async () => {
 db.coinPackage.findUnique.mockResolvedValue({...coin, bonus:0});
 expect((await c.purchaseCoinsWithWallet({...item,currency:'TZX'},viewer)).status).toBe(200);
 expect(db.transaction.create.mock.calls[1][0].data).toMatchObject({amount:100,source:'COINS'});
});
it.each(['NGN','USD'])('settles verified %s using the catalog bonus',async currency=>{
 db.coinPackage.findUniqueOrThrow.mockResolvedValue({...coin,bonus:0});
 expect((await c.purchaseCoinsWithFlutterwave(markVerifiedPayment({...item,currency},'provider-2'))).status).toBe(200);
 expect(db.transaction.create.mock.calls[1][0].data).toMatchObject({amount:currency==='NGN'?115:100,source:currency==='NGN'?'COINS_BONUS':'COINS'});
});
it('refuses verified payments into a locked wallet without minting',async()=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({...wallet,isLocked:true});
 expect((await c.purchaseCoinsWithFlutterwave(markVerifiedPayment({...item},'provider-3'))).status).toBe(400);
 expect(db.wallet.update).not.toHaveBeenCalled();
});
it('rejects unsupported provider currencies',async()=>{
 expect((await c.purchaseCoinsWithFlutterwave({...item,currency:'TON'})).status).toBe(400);
 expect(db.wallet.update).not.toHaveBeenCalled();
});
