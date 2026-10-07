import {PrismaPg} from "@prisma/adapter-pg";
import {moneyJson} from '@/services/walletLedger';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
vi.mock('@/services/v1/games',()=>({syncUserRedisWalletToPrisma:vi.fn()}));
vi.mock('@/cron/utils',()=>({addSubscriptionCronJob:vi.fn().mockResolvedValue(undefined),removeSubscriptionCronJob:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/db', async () => { const { PrismaClient } = await import('@prisma/client'); return { default: new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})}) }; });
import db from '@/db';
import { walletOperation } from '@/services/walletLedger';
import { transferCoins, updateWalletBonus, rewardDailyTask, fundCoins } from '@/services/v1/wallets';
import { chargeGameAction, monthlyGameSpend } from '@/services/walletLedger/game';
import { purchaseCoinsWithWallet, purchaseCoinsWithFlutterwave } from '@/services/v1/coins';
import { markVerifiedPayment } from '@/services/walletLedger/verifiedPayment';
import { BonusTypeEnum, GameActionEnum } from '@/types';
vi.mock('@/services/helper', () => ({ syncPrismaUserWalletToRedis: vi.fn().mockResolvedValue({isError:true}), syncRedisUserWalletToPrisma: vi.fn().mockRejectedValue(new Error('redis unavailable')) }));
const ids=['wallet-test-s','wallet-test-r','wallet-test-x'];
let coinId:string,taskId:string;
beforeAll(async()=>{
 for(const id of ids) await db.user.create({data:{id,name:id,username:id,email:`${id}@example.test`,wallet:{create:{coins:300,bonus:0,credit:10}}}});
 coinId=(await db.coinPackage.create({data:{name:'Test',amount:100,bonus:10,price:5,ngnPrice:5000,ngnBonus:15}})).id;
 taskId=(await db.task.create({data:{userId:ids[0],reward:5,rewardType:'BONUS',title:'Task',description:'Task',url:'https://example.test',code:'proof'}})).id;
});
beforeEach(async()=>{
 await db.walletOperation.deleteMany({});await db.transaction.deleteMany({where:{userId:{in:ids}}});
 await db.userTask.deleteMany({where:{userId:{in:ids}}});await db.userTaskSettings.deleteMany({where:{userId:{in:ids}}});
 await db.wallet.updateMany({where:{userId:{in:ids}},data:{coins:300,bonus:0,credit:10,isLocked:false}});
});
afterAll(async()=>{
 await db.walletOperation.deleteMany({});await db.user.deleteMany({where:{id:{in:ids}}});await db.coinPackage.delete({where:{id:coinId}});await db.$disconnect();
});
const balance=()=>db.wallet.findUniqueOrThrow({where:{userId:ids[0]}});
it('serializes competing transfers so only funded debits commit',async()=>{
 const results=await Promise.all(Array.from({length:8},(_,i)=>transferCoins({senderId:ids[0],recipientId:ids[1],amount:100,idempotencyKey:`transfer-${i}`})));
 expect(results.filter(r=>r.status===200)).toHaveLength(2);expect(moneyJson((await balance()).coins)).toBe(0);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where:{userId:ids[1]}})).coins)).toBe(500);
 expect(await db.transaction.count({where:{userId:ids[0]}})).toBe(2);
});
it('replays a simultaneous request once and rejects key reuse with a changed amount',async()=>{
 const arg={senderId:ids[0],recipientId:ids[1],amount:100,idempotencyKey:'retry-transfer-1'};
 const results=await Promise.all(Array.from({length:10},()=>transferCoins(arg)));
 expect(results.every(r=>r.status===200)).toBe(true);expect(moneyJson((await balance()).coins)).toBe(150);
 expect(await db.transaction.count({where:{userId:{in:ids}}})).toBe(2);
 expect((await transferCoins({...arg,amount:101})).status).toBe(409);
});
it('opposing transfers lock wallets in a consistent order',async()=>{
 const results=await Promise.all([transferCoins({senderId:ids[0],recipientId:ids[1],amount:100,idempotencyKey:'opposing-key-1'}),transferCoins({senderId:ids[1],recipientId:ids[0],amount:100,idempotencyKey:'opposing-key-2'})]);
 expect(results.map(r=>r.status)).toEqual([200,200]);expect(moneyJson((await balance()).coins)).toBe(250);
});
it('rolls back the balance and receipt if a ledger insert fails',async()=>{
 await expect(walletOperation('failure','same-key',{},[ids[0]],async tx=>{
 await tx.wallet.update({where:{userId:ids[0]},data:{coins:{decrement:10}}});
 await tx.transaction.create({data:{userId:'missing-user',amount:10,txnRef:'fail',description:'Rollback probe',currency:'COINS',gateway:'WALLET',source:'COINS',type:'DEBIT',status:'COMPLETED',category:'COIN_TRANSFER'}});
 })).rejects.toThrow();expect(moneyJson((await balance()).coins)).toBe(300);expect(moneyJson(await db.walletOperation.count())).toBe(0);
 await expect(walletOperation('failure','same-key',{},[ids[0]],async()=>({ok:true}))).resolves.toEqual({ok:true});
});
it('allows one daily claim despite concurrent requests and forged past dates',async()=>{
 const results=await Promise.all(Array.from({length:8},()=>updateWalletBonus({userId:ids[0],type:BonusTypeEnum.BONUS,amount:10,isTask:false,date:'2000-01-01'})));
 expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(moneyJson((await balance()).bonus)).toBe(10);
 expect(await db.transaction.count({where:{userId:ids[0]}})).toBe(1);
});
it('awards a task once under concurrent retries',async()=>{
 const results=await Promise.all(Array.from({length:8},()=>rewardDailyTask({id:taskId,userId:ids[0],code:'proof'})));
 expect(results.every(r=>r.status===200)).toBe(true);expect(moneyJson((await balance()).bonus)).toBe(5);
 expect(await db.userTask.count({where:{userId:ids[0],taskId}})).toBe(1);
});
it('purchases coins using authoritative prices without a functioning Redis cache',async()=>{
 const arg={id:coinId,currency:'TZX' as const,idempotencyKey:'coin-purchase-1',meta:{price:0.01,amount:999999}};
 const user={id:ids[0]} as any;
 const results=await Promise.all(Array.from({length:8},()=>purchaseCoinsWithWallet(arg,user)));
 expect(results.every(r=>r.status===200)).toBe(true);expect(moneyJson(await balance())).toMatchObject({coins:400,bonus:10,credit:5});
 expect(await db.transaction.count({where:{userId:ids[0]}})).toBe(2);
});
it('settles repeated verified provider callbacks exactly once',async()=>{
 const item=markVerifiedPayment({userId:ids[0],id:coinId,currency:'USD',txnRef:'external-ref',meta:{txn:{amount:5}}},'provider-1') as any;
 const results=await Promise.all(Array.from({length:8},()=>purchaseCoinsWithFlutterwave(item)));
 expect(results.every(r=>r.status===200)).toBe(true);expect(moneyJson((await balance()).coins)).toBe(400);
 expect(await db.transaction.count({where:{exTxnRef:'external-ref'}})).toBe(2);
});
it('game charges atomically consume bonus first and cannot overspend',async()=>{
 await db.wallet.update({where:{userId:ids[0]},data:{coins:1,bonus:0.5}});
 const params={playerId:ids[0],action:GameActionEnum.ANSWER,catId:'cat',mode:'MULTI'};
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>chargeGameAction({...params,operationId:`round-${i}`},1,0.75)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);expect(moneyJson(await balance())).toMatchObject({coins:0,bonus:0});
 const now=new Date(),spent=await monthlyGameSpend('cat','MULTI',now.getUTCFullYear(),now.getUTCMonth()+1);
 expect(spent).toEqual({coins:1,bonus:0.5});
});
it('a repeated game action returns its original receipt even if the random price changes',async()=>{
 const params={playerId:ids[0],action:GameActionEnum.ANSWER,operationId:'same-round'};
 const first=await chargeGameAction(params,1,0.75),second=await chargeGameAction(params,2,0.9);
 expect(second).toEqual(first);expect(moneyJson((await balance()).coins)).toBe(299.25);
});
it('database constraints reject negative and non-finite balances',async()=>{
 for(const coins of [-1,Infinity,NaN]) await expect(db.wallet.update({where:{userId:ids[0]},data:{coins}})).rejects.toThrow();
 expect(moneyJson((await balance()).coins)).toBe(300);
});
it('admin funding also has a durable retry receipt',async()=>{
 const arg={userId:ids[0],amount:10,bonus:2,idempotencyKey:'funding-request-1'};
 await Promise.all(Array.from({length:5},()=>fundCoins(arg,{id:ids[2],role:'ADMIN'} as any)));
 expect(moneyJson(await balance())).toMatchObject({coins:310,bonus:2});
});

it('settles a pending tip once and updates its ledger atomically',async()=>{
 const {settleTip}=await import('@/services/walletLedger/tips');
 const wallet=await balance();
 const pkg=await db.tipPackage.create({data:{name:'test-tip',price:30}});
 const txn=await db.transaction.create({data:{userId:ids[0],walletId:wallet.id,amount:5.5,currency:'TZX',gateway:'WALLET',source:'CREDIT',type:'CREDIT',status:'PENDING',category:'POST_TIP',txnRef:'tip-test',description:'Pending tip',metadata:{settlementVersion:1}}});
 const postTip=await db.postTip.create({data:{senderId:ids[1],recipientId:ids[0],tipId:pkg.id}});
 const tip=await db.rewardTip.create({data:{userId:ids[0],walletId:wallet.id,postTipId:postTip.id,txnId:txn.id,amount:5.5,source:'POST',availableAt:new Date(Date.now()-1)}});
 try{
 await Promise.all(Array.from({length:8},()=>settleTip(tip.id,ids[0])));
 expect(moneyJson((await balance()).credit)).toBe(15.5);
 expect((await db.rewardTip.findUniqueOrThrow({where:{id:tip.id}})).status).toBe('SETTLED');
 expect(moneyJson((await db.transaction.findUniqueOrThrow({where:{id:txn.id}})).status)).toBe('COMPLETED');
 }finally{await db.rewardTip.delete({where:{id:tip.id}});await db.postTip.delete({where:{id:postTip.id}});await db.tipPackage.delete({where:{id:pkg.id}});}
});

it('concurrent subscription purchase retries charge once, and renewal repeats do not charge twice',async()=>{
 const {purchaseAppSubscriptionWithWallet,renewAppSubscriptionWithWallet}=await import('@/services/v1/subscriptions');
 const plan=await db.subscriptionPlan.create({data:{name:'Test',price:2,ngnPrice:2000,discount:0,accountType:'PERSONAL'}});
 try{
 const item={planId:plan.id,amount:0.01,currency:'TZX' as const,planType:'MONTHLY' as const,isRecurring:true,idempotencyKey:'subscription-retry'};
 const results=await Promise.all(Array.from({length:5},()=>purchaseAppSubscriptionWithWallet(item,ids[0])));
 expect(results.every(r=>r.status===200)).toBe(true);expect(moneyJson((await balance()).credit)).toBe(8);
 const sub=await db.subscription.findFirstOrThrow({where:{userId:ids[0],planId:plan.id}});
 await db.subscription.update({where:{id:sub.id},data:{endDate:new Date(Date.now()-1000)}});
 const renewals=await Promise.all(Array.from({length:5},()=>renewAppSubscriptionWithWallet(sub.id)));
 expect(renewals.every(r=>r.status===200)).toBe(true);expect(moneyJson((await balance()).credit)).toBe(6);
 expect(await db.transaction.count({where:{subscriptionId:sub.id}})).toBe(2);
 await renewAppSubscriptionWithWallet(sub.id);expect(moneyJson((await balance()).credit)).toBe(6);
 }finally{await db.transaction.deleteMany({where:{subPlanId:plan.id}});await db.subscription.deleteMany({where:{planId:plan.id}});await db.subscriptionPlan.delete({where:{id:plan.id}});}
});
