import {PrismaPg} from '@prisma/adapter-pg';
import {Worker,QueueEvents} from 'bullmq';
import {beforeAll, afterAll, expect, it, vi} from 'vitest';
vi.mock('@/db',async()=>{
 const {PrismaClient}=await import('@prisma/client');
 return {default:new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:10})})};
});
vi.mock('@/redis',async()=>{
 const {createClient}=await import('redis');
 const client=createClient({url:process.env.REDIS_URL});await client.connect();return {default:client};
});
vi.mock('@/services/helper',()=>({getRedisHashKey:async()=>({score:1275,numPlayed:50})}));
const pushSend=vi.hoisted(()=>vi.fn().mockResolvedValue({statusCode:201}));
vi.mock('@/utils/webpush',()=>({default:{sendNotification:pushSend}}));
import {notificationQueue,closeJobQueues} from '@/cron/jobs/queue';
import {deliverNotification,getNotificationStreamSnapshot} from '@/services/v1/notifications';
import db from '@/db';
import redis from '@/redis';
import {getRankingRewardKeys} from '@/utils';
import {run} from '@/cron/recurring/reward_top_players_every_month';
let catId:string,gameId:string,key:string,snapshot:string,milestoneId:string;
const extraKeys:string[]=[];
const ids=Array.from({length:50},(_,i)=>`monthly-policy-player-${i}`);
beforeAll(async()=>{
 for(const id of ids) await db.user.create({data:{id,name:id,username:id,email:`${id}@test.invalid`,wallet:{create:{coins:0,bonus:10}}}});
 const game=await db.game.create({data:{name:'Monthly policy test',description:'test',modes:['MULTI'],categories:{create:{name:'Policy category',description:'test'}}},include:{categories:true}});
 gameId=game.id;catId=game.categories[0].id;
 milestoneId=(await db.gameMilestone.create({data:{name:'MONTH',reason:'TOP_OF_THE_MONTH',milestone:1,reward:0,rewardType:'COINS'}})).id;
 vi.spyOn(db.gameCategory,'findMany').mockResolvedValue(game.categories.map(c=>({...c,game})) as any);
 const keys=getRankingRewardKeys(catId,'multi');key=keys.rewardMonth;snapshot=`${key}:settlement:monthly-90-v2`;
 await redis.zAdd(key,ids.map((value,i)=>({value,score:50-i})));
 const createdAt=new Date(Date.UTC(keys.dateInfo.year,keys.dateInfo.month-1,15));
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-real-spend',amount:2000,currency:'COINS',source:'COINS_BONUS',gateway:'WALLET',type:'DEBIT',status:'COMPLETED',category:'GAME_DEDUCTION',description:'Committed mixed spend',createdAt,metadata:{catId,mode:'MULTI',deductedCoins:1200,deductedBonus:800}}});
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-pending-spend',amount:999,currency:'COINS',source:'COINS',gateway:'WALLET',type:'DEBIT',status:'PENDING',category:'GAME_DEDUCTION',description:'Not spent',createdAt,metadata:{catId,mode:'MULTI'}}});
});
afterAll(async()=>{
 await redis.del([key,snapshot,...extraKeys]);
 await db.user.deleteMany({where:{id:{in:ids}}});
 await db.game.delete({where:{id:gameId}});
 await db.gameMilestone.delete({where:{id:milestoneId}});
 await closeJobQueues();await redis.quit();await db.$disconnect();
});
it('offsets actual bonus spending before funding, pays every qualifying player coins only, and settles stats',async()=>{
 // A missing wallet forces a partial failure; already committed awards must replay safely.
 await db.wallet.delete({where:{userId:ids[0]}});
 await expect(run()).rejects.toThrow('Wallet not found');
 const partial=await db.gameMonthRewardStat.findFirstOrThrow({where:{catId}});
 expect(await db.notification.count({where:{recipientId:ids[0],sourceKey:{startsWith:'monthly-game-reward:'}}})).toBe(0);
 expect(partial.status).toBe('FAILED');expect(partial.fullyAllocated).toBe(false);
 expect(Number(partial.pendingAmount)).toBeGreaterThan(0);
 expect(Number(partial.rewardPoolAmount)).toBe(100);
 await redis.del(snapshot);
 await expect(run()).rejects.toThrow('snapshot missing');
 await redis.copy(key,snapshot);
 await db.wallet.create({data:{userId:ids[0],coins:0,bonus:10}});
 await Promise.all([run(),run(),run()]);
 const payouts=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'}});
 expect(payouts).toHaveLength(10);
 const achievement=await db.gameAchievement.findFirstOrThrow({where:{catId,milestoneId}});
 expect(achievement.playerId).toBe(ids[0]);
 expect(payouts.find(p=>p.userId===ids[0])?.id).toBe(achievement.txnId);
 expect(payouts.find(p=>p.userId===ids[0])?.achievementId).toBe(achievement.id);
 const notifications=await db.notification.findMany({where:{recipientId:{in:ids},sourceKey:{startsWith:'monthly-game-reward:'}}});
 expect(notifications).toHaveLength(10);
 for(const notification of notifications) {
  expect(notification.meta).toMatchObject({kind:'monthly-game-reward',catId,mode:'MULTI',auditId:partial.id,currency:'COINS'});
  const job=await notificationQueue.getJob(`notification-${notification.id}`);
  expect(job?.data.notificationId).toBe(notification.id);
 }
 expect(await getNotificationStreamSnapshot(ids[0])).toMatchObject({totalUnseenCount:1,latestNotificationId:expect.any(String)});
 expect(await getNotificationStreamSnapshot(ids[49])).toMatchObject({totalUnseenCount:0,latestNotificationId:null});
 expect(payouts.reduce((sum,row)=>sum+Number(row.amount),0)).toBeCloseTo(100,8);
 expect(payouts.every(row=>row.currency==='COINS'&&row.source==='COINS')).toBe(true);
 const wallets=await db.wallet.findMany({where:{userId:{in:ids}}});
 expect(wallets.every(w=>Number(w.bonus)===10)).toBe(true);
 expect(wallets.filter(w=>Number(w.coins)>0)).toHaveLength(10);
 const ordered=ids.slice(0,10).map(id=>Number(wallets.find(w=>w.userId===id)!.coins));
 expect(ordered).toEqual([...ordered].sort((a,b)=>b-a));
 expect(ordered.at(-1)).toBeGreaterThanOrEqual(9);
 const stat=await db.gameMonthRewardStat.findFirstOrThrow({where:{catId}});
 expect(Number(stat.coinsShareAmount)).toBe(100);
 expect(Number(stat.coinsSpent)).toBe(1200);expect(Number(stat.bonusSpent)).toBe(800);
 expect(stat.coinsRewardParticipants).toBe(10);expect(stat.processedParticipants).toBe(10);
 expect(stat.rewardParticipantsScore).toBe(455);
 expect(stat.status).toBe('COMPLETED');expect(stat.fullyAllocated).toBe(true);
 expect(Number(stat.grossSpent)).toBe(2000);expect(Number(stat.fundingBalance)).toBe(400);
 expect(stat.rewardPercentage).toBe(25);expect(stat.qualifyingPercentage).toBe(20);
 expect(Number(stat.rewardPoolAmount)).toBe(100);expect(Number(stat.distributableAmount)).toBe(100);
 expect(Number(stat.retainedBalance)).toBe(300);expect(Number(stat.balanceAfterPayout)).toBe(300);
 expect(Number(stat.unallocatedAmount)).toBe(0);expect(Number(stat.pendingAmount)).toBe(0);
 expect(Number(stat.capUnallocatedAmount)).toBe(0);expect(stat.completedAt).not.toBeNull();
 expect(stat.lastError).toBeNull();
 // The database rejects summaries that no longer match the pool/paid identities.
 await expect(db.gameMonthRewardStat.update({where:{id:stat.id},data:{coinsShareAmount:{increment:1}}})).rejects.toThrow();
});
it('replays concurrent settlements from the frozen plan despite changed original ranks and spending',async()=>{
 const before=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'},orderBy:{userId:'asc'}});
 await redis.zAdd(key,{value:ids[49],score:999999});
 const keys=getRankingRewardKeys(catId,'multi');
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-late-spend',amount:500,currency:'COINS',source:'COINS',gateway:'WALLET',type:'DEBIT',status:'COMPLETED',category:'GAME_DEDUCTION',description:'Late historical entry',createdAt:new Date(Date.UTC(keys.dateInfo.year,keys.dateInfo.month-1,20)),metadata:{catId,mode:'MULTI'}}});
 await Promise.all([run(),run(),run()]);
 const after=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'},orderBy:{userId:'asc'}});
 expect(after).toEqual(before);
 expect(await db.notification.count({where:{recipientId:{in:ids},sourceKey:{startsWith:'monthly-game-reward:'}}})).toBe(10);
 expect(await db.gameMonthRewardStat.count({where:{catId}})).toBe(1);
});
it('pushes an award once to subscribed devices and retains the SSE inbox',async()=>{
 const notification=await db.notification.findFirstOrThrow({where:{recipientId:ids[0],sourceKey:{startsWith:'monthly-game-reward:'}}});
 const config={endpoint:'https://fcm.googleapis.com/fcm/send/monthly-award-fixture',keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
 const subscription=await db.pushNotification.create({data:{userId:ids[0],endpoint:config.endpoint,config}});
 const connection={host:'127.0.0.1',port:16379};
 const events=new QueueEvents(notificationQueue.name,{connection});await events.waitUntilReady();
 const worker=new Worker(notificationQueue.name,job=>deliverNotification(job.data.notificationId),{connection,concurrency:2});
 try {
  const job=await notificationQueue.getJob(`notification-${notification.id}`);
  await job!.waitUntilFinished(events,10000);
  await deliverNotification(notification.id);
  expect(pushSend).toHaveBeenCalledOnce();
  expect(JSON.parse(pushSend.mock.calls[0][1])).toMatchObject({url:'/wallet',tag:notification.id});
  expect((await db.notification.findUniqueOrThrow({where:{id:notification.id}})).pushSentAt).not.toBeNull();
  expect(await getNotificationStreamSnapshot(ids[0])).toMatchObject({totalUnseenCount:1});
 } finally {await worker.close();await events.close();await db.pushNotification.delete({where:{id:subscription.id}});}
});
it('does not need a retained snapshot after the period has fully settled',async()=>{
 await redis.del(snapshot);
 await expect(run()).resolves.toBeUndefined();
 expect(await db.transaction.count({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'}})).toBe(10);
});

it.each([
 {name:'no-activity',count:0,coins:0,bonus:0,pool:0,paid:0,unallocated:0,qualified:0,fully:true},
 {name:'zero-pool',count:50,coins:50,bonus:50,pool:0,paid:0,unallocated:0,qualified:10,fully:true},
 {name:'cap-excess',count:5,coins:4_000_000,bonus:0,pool:1_000_000,paid:500_000,unallocated:500_000,qualified:1,fully:false},
 {name:'no-qualifiers',count:4,coins:400,bonus:0,pool:100,paid:0,unallocated:100,qualified:0,fully:false},
])('records complete funding and allocation for $name',async scenario=>{
 const category=await db.gameCategory.create({data:{gameId,name:scenario.name,description:'Audit scenario'}});
 const game=await db.game.findUniqueOrThrow({where:{id:gameId}});
 vi.spyOn(db.gameCategory,'findMany').mockResolvedValue([{...category,game}] as any);
 const keys=getRankingRewardKeys(category.id,'multi');
 extraKeys.push(keys.rewardMonth,`${keys.rewardMonth}:settlement:monthly-90-v2`);
 if(scenario.count) await redis.zAdd(keys.rewardMonth,ids.slice(0,scenario.count).map((value,i)=>({value,score:50-i})));
 await db.transaction.create({data:{userId:ids[0],txnRef:`audit-${scenario.name}`,amount:scenario.coins+scenario.bonus,
 currency:'COINS',source:'COINS_BONUS',gateway:'WALLET',type:'DEBIT',status:'COMPLETED',category:'GAME_DEDUCTION',description:'Audit probe',
 createdAt:new Date(Date.UTC(keys.dateInfo.year,keys.dateInfo.month-1,15)),
 metadata:{catId:category.id,mode:'MULTI',deductedCoins:scenario.coins,deductedBonus:scenario.bonus}}});
 await run();
 const stat=await db.gameMonthRewardStat.findFirstOrThrow({where:{catId:category.id}});
 expect(stat.status).toBe('COMPLETED');expect(stat.fullyAllocated).toBe(scenario.fully);
 expect(stat.rewardParticipants).toBe(scenario.qualified);expect(stat.processedParticipants).toBe(scenario.qualified);
 expect(Number(stat.rewardPoolAmount)).toBe(scenario.pool);
 expect(Number(stat.coinsShareAmount)).toBe(scenario.paid);expect(Number(stat.unallocatedAmount)).toBe(scenario.unallocated);
 expect(Number(stat.capUnallocatedAmount)).toBe(scenario.unallocated);expect(Number(stat.pendingAmount)).toBe(0);
 expect(Number(stat.fundingBalance)).toBe(Math.max(0,scenario.coins-scenario.bonus));
 expect(Number(stat.retainedBalance)).toBe(Number(stat.fundingBalance)-scenario.pool);
 expect(Number(stat.balanceAfterPayout)).toBe(Number(stat.fundingBalance)-scenario.paid);
});
