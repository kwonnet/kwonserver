import {PrismaPg} from "@prisma/adapter-pg";
import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})})};});
vi.mock('@/redis',async()=>{const {createClient}=await import('redis');const client=createClient({url:'redis://127.0.0.1:16379'});await client.connect();return {default:client};});
import db from '@/db';
import redis from '@/redis';
import {chargeGameAction} from '@/services/walletLedger/game';
import {dispatchGameAction,recoverGameActions,GameDelivery} from '@/services/walletLedger/gameDelivery';
import {GameActionEnum} from '@/types';
const userId='delivery-test-user',roomId='delivery-test-room';
const wallet=()=>db.wallet.findUniqueOrThrow({where:{userId}});
const deliver=(kind:GameDelivery['kind']='ANSWER',payload:any={answer:'hello',playerId:userId,votes:[]})=>({kind,roomId,roundId:'round-1',payload});
const charge=(key='delivery-op-1',delivery=deliver())=>chargeGameAction({playerId:userId,operationId:key,action:GameActionEnum.ANSWER},10,5,delivery);
beforeAll(async()=>{await db.user.create({data:{id:userId,name:'Delivery',username:userId,email:'delivery@test.invalid',wallet:{create:{coins:100,bonus:2}}}});});
beforeEach(async()=>{
 await db.gameWalletAction.deleteMany({where:{userId}});await db.walletOperation.deleteMany({});await db.transaction.deleteMany({where:{userId}});
 await db.wallet.update({where:{userId},data:{coins:100,bonus:2}});
 const keys=await redis.keys('*');if(keys.length) await redis.del(keys);
 await redis.hSet(`room:${roomId}`,{status:'PLAY'});
 await redis.set(`room:${roomId}:question`,JSON.stringify({roundId:'round-1',answerUntil:Date.now()+60000,voteUntil:Date.now()+120000}));
});
afterAll(async()=>{await db.gameWalletAction.deleteMany({where:{userId}});await db.walletOperation.deleteMany({});await db.user.delete({where:{id:userId}});await redis.quit();await db.$disconnect();});
it('recovers a crash after the debit commit and delivers only once under competing retries',async()=>{
 const result=await charge();expect(Number((await wallet()).coins)).toBe(97);expect(Number((await wallet()).bonus)).toBe(0);
 expect(await redis.hGet(`room:${roomId}:answers`,userId)).toBeNull();
 await Promise.all([dispatchGameAction(result.actionId!),recoverGameActions(),dispatchGameAction(result.actionId!)]);
 expect(JSON.parse((await redis.hGet(`room:${roomId}:answers`,userId))!).answer).toBe('hello');
 expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId}})).status).toBe('DELIVERED');
 expect(await db.transaction.count({where:{userId}})).toBe(1);
});
it('replays a lost Redis acknowledgement even after the room has closed without refunding a delivered action',async()=>{
 const result=await charge();const original=redis.eval.bind(redis);
 const spy=vi.spyOn(redis,'eval').mockImplementationOnce(async(...args:any[])=>{await (original as any)(...args);throw new Error('connection lost after commit');});
 await expect(dispatchGameAction(result.actionId!)).rejects.toThrow('connection lost');spy.mockRestore();
 expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId}})).status).toBe('PENDING');
 await redis.del([`room:${roomId}`,`room:${roomId}:question`]);
 expect((await dispatchGameAction(result.actionId!)).status).toBe('DELIVERED');
 expect(Number((await wallet()).coins)).toBe(97);expect(await db.transaction.count({where:{userId}})).toBe(1);
});
it('refunds the exact original coin and bonus split once when the round expires',async()=>{
 const result=await charge();await redis.set(`room:${roomId}:question`,JSON.stringify({roundId:'next-round'}));
 await Promise.all(Array.from({length:6},()=>dispatchGameAction(result.actionId!)));
 expect(Number((await wallet()).coins)).toBe(100);expect(Number((await wallet()).bonus)).toBe(2);
 expect(await db.transaction.count({where:{userId,type:'CREDIT'}})).toBe(1);
 expect((await dispatchGameAction(result.actionId!)).status).toBe('REFUNDED');
});
it('keeps unavailable or malformed Redis state pending without a blind refund',async()=>{
 const result=await charge();await redis.set(`room:${roomId}:answers`,'wrong type');
 await expect(dispatchGameAction(result.actionId!)).rejects.toThrow('Invalid game storage type');
 expect(Number((await wallet()).coins)).toBe(97);
 expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId}})).status).toBe('PENDING');
 await redis.del(`room:${roomId}:answers`);expect((await dispatchGameAction(result.actionId!)).status).toBe('DELIVERED');
});
it('does not charge for an acronym already accepted into the room',async()=>{
 const result=await charge('acronym-op-1',deliver('ACRONYM'));
 await redis.sAdd(`room:${roomId}:u-answers`,'hello');
 expect((await dispatchGameAction(result.actionId!)).status).toBe('REFUNDED');
 expect(Number((await wallet()).coins)).toBe(100);
});
it('stores paid chat once and retains history for recovery after a missed broadcast',async()=>{
 const result=await charge('chat-operation',deliver('CHAT',{id:'message-1',content:'hi'}));
 await Promise.all([dispatchGameAction(result.actionId!),dispatchGameAction(result.actionId!)]);
 expect(await redis.lRange(`room:${roomId}:paid-messages`,0,-1)).toHaveLength(1);
});
it('stores fractional currency exactly across repeated changes',async()=>{
 await db.wallet.update({where:{userId},data:{credit:0}});
 for(let i=0;i<10;i++)await db.wallet.update({where:{userId},data:{credit:{increment:'0.10'}}});
 expect((await wallet()).credit.toFixed(2)).toBe('1.00');
});
it('moves a vote atomically and refunds a duplicate target without duplicating votes',async()=>{
 await redis.hSet(`room:${roomId}`,{status:'VOTE'});
 await redis.hSet(`room:${roomId}:answers`,{a:JSON.stringify({answerId:'answer-a',votes:[]}),b:JSON.stringify({answerId:'answer-b',votes:[]}),[userId]:JSON.stringify({answerId:'own',votes:[],voted:false})});
 const first=await charge('vote-target-a',deliver('VOTE',{answerId:'answer-a',votedUserId:'a'}));
 await dispatchGameAction(first.actionId!);
 const second=await charge('vote-target-b',deliver('VOTE',{answerId:'answer-b',votedUserId:'b'}));
 await dispatchGameAction(second.actionId!);
 const a=JSON.parse((await redis.hGet(`room:${roomId}:answers`,'a'))!),b=JSON.parse((await redis.hGet(`room:${roomId}:answers`,'b'))!);
 expect(a.votes).toEqual([]);expect(b.votes).toEqual([userId]);
 const duplicate=await charge('duplicate-vote-b',deliver('VOTE',{answerId:'answer-b',votedUserId:'b'}));
 expect((await dispatchGameAction(duplicate.actionId!)).status).toBe('REFUNDED');
 expect(JSON.parse((await redis.hGet(`room:${roomId}:answers`,userId))!).voted).toBe(true);
});
it('stores wordmaker guesses without losing prior guesses on retry',async()=>{
 const first=await charge('wordmaker-first',deliver('WORDMAKER',{playerId:userId,answer:'hello',timer:4,votes:[]}));
 await dispatchGameAction(first.actionId!);await dispatchGameAction(first.actionId!);
 const second=await charge('wordmaker-second',deliver('WORDMAKER',{playerId:userId,answer:'help',timer:3,votes:[]}));
 await dispatchGameAction(second.actionId!);
 expect(await redis.hLen(`room:${roomId}:player:${userId}:guesses`)).toBe(2);
 expect(JSON.parse((await redis.hGet(`room:${roomId}:answers`,userId))!).answer).toBe('');
});
