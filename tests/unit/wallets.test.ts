import { beforeEach, expect, it, vi } from 'vitest';
import { setupWalletTransaction } from './wallet-fixture';
const db = vi.hoisted(() => ({ wallet: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() }, transaction: { create: vi.fn() }, $transaction: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
import { transferCoins, getUserCoinsWallet } from '@/services/v1/wallets';
const args = { idempotencyKey: 'transfer-test-1', senderId: 's', recipientId: 'r', amount: 100 };
beforeEach(() => {
 vi.clearAllMocks(); setupWalletTransaction(db);
 db.wallet.findUniqueOrThrow.mockImplementation(async ({where}) => ({id:where.userId,coins:where.userId==='s'?150:0,isLocked:false}));
 db.wallet.update.mockResolvedValue({}); db.transaction.create.mockResolvedValue({});
});
it('reads authoritative wallet and handles absence', async()=>{
 db.wallet.findUnique.mockResolvedValue({coins:12}); expect((await getUserCoinsWallet('u')).data).toEqual({coins:12});
 db.wallet.findUnique.mockResolvedValue(null); expect((await getUserCoinsWallet('u')).status).toBe(404);
 db.wallet.findUnique.mockRejectedValue(new Error('db')); expect((await getUserCoinsWallet('u')).status).toBe(500);
});
it.each([NaN,Infinity,-100,0,99,100.001])('rejects invalid transfer amount %s',async amount=>{
 expect((await transferCoins({...args,amount})).status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('rejects self transfers',async()=>{expect((await transferCoins({...args,recipientId:'s'})).status).toBe(400);});
it('checks the fee inside the locked transaction',async()=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({id:'w',coins:149});expect((await transferCoins(args)).status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('keeps sender, recipient, fee and both ledger records together',async()=>{
 expect((await transferCoins(args)).status).toBe(200);
 expect(db.wallet.update).toHaveBeenCalledWith({where:{id:'s'},data:{coins:0}});
 expect(db.wallet.update).toHaveBeenCalledWith({where:{id:'r'},data:{coins:{increment:100}}});
 const entries=db.transaction.create.mock.calls.map(([q])=>q.data);
 expect(entries).toEqual([expect.objectContaining({amount:150,userId:'s',type:'DEBIT'}),expect.objectContaining({amount:100,userId:'r',type:'CREDIT'})]);
 expect(entries[0].txnRef).toBe(entries[1].txnRef);
});
it('rejects locked wallets and invalid keys',async()=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({id:'w',coins:1000,isLocked:true});expect((await transferCoins(args)).status).toBe(400);
 expect((await transferCoins({...args,idempotencyKey:'bad'})).status).toBe(400);
});
it('returns a generic database failure without leaking details',async()=>{
 db.$transaction.mockRejectedValue(new Error('secret'));expect(await transferCoins(args)).toMatchObject({status:500,data:expect.not.stringContaining('secret')});
});
