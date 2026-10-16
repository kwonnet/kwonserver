import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {io as connectSocket} from 'socket.io-client';
import {PrismaPg} from "@prisma/adapter-pg";
import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
// This suite exercises wallet delivery, not the optional word/AI generators.
vi.mock('@/utils/ai',()=>({generateRoomQuestion:vi.fn(),shuffleArray:vi.fn()}));
vi.mock('@/services/helper',()=>({}));
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})})};});
vi.mock('@/redis',async()=>{const {createClient}=await import('redis');const client=createClient({url:'redis://127.0.0.1:16379'});await client.connect();return {default:client};});
import db from '@/db';
import redis from '@/redis';
import {chargeGameAction} from '@/services/walletLedger/game';
import {dispatchGameAction,recoverGameActions,GameDelivery} from '@/services/walletLedger/gameDelivery';
import {GameActionEnum} from '@/types';
import {GameMode} from '@prisma/client';
import {deductGameCoins, subscribeGamePresence} from '@/services/v1/games';
const userId='delivery-test-user',roomId='delivery-test-room';
const wallet=()=>db.wallet.findUniqueOrThrow({where:{userId}});
const deliver=(kind:GameDelivery['kind']='ANSWER',payload:any={answer:'hello',playerId:userId,votes:[]})=>({kind,roomId,roundId:'round-1',payload});
const charge=(key='delivery-op-1',delivery=deliver())=>chargeGameAction({playerId:userId,operationId:key,action:GameActionEnum.ANSWER},10,5,delivery);
beforeAll(async()=>{await db.user.create({data:{emailVerifiedAt: new Date(), id:userId,name:'Delivery',username:userId,email:'delivery@test.invalid',wallet:{create:{coins:100,bonus:2}}}});});
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
it.each(['Round closed','Answers closed','Voting closed','Room closed'])('keeps %s refunds unchanged while classifying only round timing as recoverable',async reason=>{
 const voting=reason==='Voting closed';
 if(reason==='Round closed') await redis.del(`room:${roomId}:question`);
 if(reason==='Room closed') await redis.del(`room:${roomId}`);
 if(reason==='Answers closed') await redis.set(`room:${roomId}:question`,JSON.stringify({roundId:'round-1',answerUntil:Date.now()-1000}));
 if(voting){await redis.hSet(`room:${roomId}`,{status:'VOTE'});await redis.set(`room:${roomId}:question`,JSON.stringify({roundId:'round-1',voteUntil:Date.now()-1000}));}
 const result=await deductGameCoins({playerId:userId,operationId:'late-action',action:voting?GameActionEnum.VOTE:GameActionEnum.ANSWER,roomId,catId:'cat',gameId:'game',mode:GameMode.MULTI},deliver(voting?'VOTE':'ANSWER'));
 expect(result).toMatchObject({isError:true,message:reason,recoverable:reason!=='Room closed',data:{amount:100,bonus:2}});
 expect(Number((await wallet()).coins)).toBe(100);expect(Number((await wallet()).bonus)).toBe(2);
 expect(await db.transaction.count({where:{userId,type:'CREDIT'}})).toBe(1);
 expect(await redis.hGet(`room:${roomId}:answers`,userId)).toBeNull();
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
it('publishes paid chat live once across replicas without retaining message bodies',async()=>{
 const message={id:'message-1',content:'live-only secret',playerId:userId,playerName:'Delivery',createdAt:new Date().toISOString()};
 const deliveries=[vi.fn(),vi.fn()];
 const stops: (()=>Promise<void>)[]=[];
 try {
  for(const emit of deliveries) stops.push(await subscribeGamePresence({local:{to:(id:string)=>{expect(id).toBe(roomId);return {emit};}}} as any));
  await redis.set(`room:${roomId}:paid-messages`,'legacy invalid replay buffer');
  const result=await chargeGameAction({playerId:userId,operationId:'chat-operation',action:GameActionEnum.CHAT,content:message.content},10,5,deliver('CHAT',message));
  await Promise.all([dispatchGameAction(result.actionId!,message),dispatchGameAction(result.actionId!,message)]);
  await vi.waitFor(()=>{for(const emit of deliveries)expect(emit).toHaveBeenCalledTimes(1);});
  for(const emit of deliveries) expect(emit).toHaveBeenCalledWith('message',message);
  expect(await redis.exists(`room:${roomId}:paid-messages`)).toBe(0);
  const action=await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId!}});
  expect(action.payload).toEqual({id:message.id});
  expect(JSON.stringify(await db.transaction.findMany({where:{userId}}))).not.toContain(message.content);
  expect(JSON.stringify(await db.walletOperation.findMany({}))).not.toContain(message.content);
  await dispatchGameAction(result.actionId!,message);
  for(const emit of deliveries)expect(emit).toHaveBeenCalledTimes(1);
 } finally {for(const stop of stops)await stop();}
});
it('refunds live chat that cannot be published and never replays it during recovery',async()=>{
 const result=await charge('undelivered-chat',deliver('CHAT',{id:'message-2',content:'not stored'}));
 await recoverGameActions();
 expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId!}})).status).toBe('REFUNDED');
 expect(Number((await wallet()).coins)).toBe(100);
 expect(Number((await wallet()).bonus)).toBe(2);
 expect(await redis.exists(`room:${roomId}:paid-messages`)).toBe(0);
});
it('refunds live chat when no game replica is listening',async()=>{
 const message={id:'message-3',content:'live only'};
 const result=await charge('no-chat-listeners',deliver('CHAT',message));
 expect((await dispatchGameAction(result.actionId!,message)).status).toBe('REFUNDED');
 expect(Number((await wallet()).coins)).toBe(100);
});
it('does not replay or refund chat after losing the publish acknowledgement',async()=>{
 const seen:unknown[]=[];
 const stop=await subscribeGamePresence({local:{to:()=>({emit:(_event:string,message:unknown)=>seen.push(message)})}} as any);
 try {
  const message={id:'message-4',content:'live only'};
  const result=await charge('lost-chat-ack',deliver('CHAT',message));
  const original=redis.eval.bind(redis);
  const spy=vi.spyOn(redis,'eval').mockImplementationOnce(async(...args:any[])=>{await (original as any)(...args);throw new Error('lost publish acknowledgement');});
  await expect(dispatchGameAction(result.actionId!,message)).rejects.toThrow('lost publish acknowledgement');spy.mockRestore();
  await recoverGameActions();
  await vi.waitFor(()=>expect(seen).toHaveLength(1));
  expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId!}})).status).toBe('DELIVERED');
  expect(Number((await wallet()).coins)).toBe(97);
 } finally {await stop();}
});
it('stores fractional currency exactly across repeated changes',async()=>{
 await db.wallet.update({where:{userId},data:{coins:0}});
 for(let i=0;i<10;i++)await db.wallet.update({where:{userId},data:{coins:{increment:'0.10'}}});
 expect((await wallet()).coins.toFixed(2)).toBe('1.00');

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

it('routes live chat to the same room on two servers and excludes other rooms',async()=>{
 const servers=[new Server(createServer()),new Server(createServer())];
 const sockets: ReturnType<typeof connectSocket>[]=[];
 const stops: (()=>Promise<void>)[]=[];
 const received: unknown[][]=[[],[],[]];
 try {
  for(const server of servers){
   const namespace=server.of('/games');
   namespace.on('connection',async socket=>{await socket.join(socket.handshake.auth.testRoom);socket.emit('test_ready');});
   stops.push(await subscribeGamePresence(namespace));
   await new Promise<void>(resolve=>server.httpServer.listen(0,'127.0.0.1',resolve));
  }
  for(const [index,serverIndex] of [0,1,1].entries()){
   const address=servers[serverIndex].httpServer.address() as {port:number};
   const socket=connectSocket(`http://127.0.0.1:${address.port}/games`,{autoConnect:false,transports:['websocket'],auth:{testRoom:index===2?'another-room':roomId}});
   sockets.push(socket);socket.on('message',message=>received[index].push(message));
   await new Promise<void>((resolve,reject)=>{socket.once('connect_error',reject);socket.once('test_ready',resolve);socket.connect();});
  }
  const message={id:'live-routing',content:'Only this room'};
  const result=await charge('live-routing-operation',deliver('CHAT',message));
  await dispatchGameAction(result.actionId!,message);
  await vi.waitFor(()=>{expect(received[0]).toHaveLength(1);expect(received[1]).toHaveLength(1);});
  expect(received[2]).toEqual([]);
  expect(received[0][0]).toMatchObject(message);expect(received[1][0]).toMatchObject(message);
  expect(await redis.exists(`room:${roomId}:paid-messages`)).toBe(0);
 } finally {
  for(const socket of sockets)socket.disconnect();
  for(const stop of stops)await stop();
  for(const server of servers)await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
it('redacts legacy message bodies while retaining the financial audit trail',async()=>{
 const message={id:'legacy-message',content:'legacy private text'};
 const result=await charge('legacy-chat-body',deliver('CHAT',message));
 await db.gameWalletAction.update({where:{id:result.actionId!},data:{payload:message}});
 const txn=await db.transaction.findFirstOrThrow({where:{userId}});
 await db.transaction.update({where:{id:txn.id},data:{metadata:{action:'CHAT',content:message.content,gameActionId:result.actionId!}}});
 const sql=readFileSync('prisma/migrations/20261016010000_ephemeral_game_chat/migration.sql','utf8');
 for(const statement of sql.split(';').filter(value=>value.trim()))await db.$executeRawUnsafe(statement);
 expect((await db.gameWalletAction.findUniqueOrThrow({where:{id:result.actionId!}})).payload).toEqual({id:message.id});
 expect((await db.transaction.findUniqueOrThrow({where:{id:txn.id}})).metadata).toEqual({action:'CHAT',gameActionId:result.actionId!});
 expect(Number((await wallet()).coins)).toBe(97);
});
