import {PrismaPg} from '@prisma/adapter-pg';
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
import db from '@/db';
import redis from '@/redis';
import {getRankingRewardKeys} from '@/utils';
import {run} from '@/cron/recurring/reward_top_players_every_month';
let catId:string,gameId:string,key:string,snapshot:string;
const ids=Array.from({length:50},(_,i)=>`monthly-policy-player-${i}`);
beforeAll(async()=>{
 for(const id of ids) await db.user.create({data:{id,name:id,username:id,email:`${id}@test.invalid`,wallet:{create:{coins:0,bonus:10}}}});
 const game=await db.game.create({data:{name:'Monthly policy test',description:'test',modes:['MULTI'],categories:{create:{name:'Policy category',description:'test'}}},include:{categories:true}});
 gameId=game.id;catId=game.categories[0].id;
 vi.spyOn(db.gameCategory,'findMany').mockResolvedValue(game.categories.map(c=>({...c,game})) as any);
 const keys=getRankingRewardKeys(catId,'multi');key=keys.rewardMonth;snapshot=`${key}:settlement:monthly-90-v1`;
 await redis.zAdd(key,ids.map((value,i)=>({value,score:50-i})));
 const createdAt=new Date(Date.UTC(keys.dateInfo.year,keys.dateInfo.month-1,15));
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-real-spend',amount:2000,currency:'COINS',source:'COINS_BONUS',gateway:'WALLET',type:'DEBIT',status:'COMPLETED',category:'GAME_DEDUCTION',description:'Committed mixed spend',createdAt,metadata:{catId,mode:'MULTI',deductedCoins:1200,deductedBonus:800}}});
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-pending-spend',amount:999,currency:'COINS',source:'COINS',gateway:'WALLET',type:'DEBIT',status:'PENDING',category:'GAME_DEDUCTION',description:'Not spent',createdAt,metadata:{catId,mode:'MULTI'}}});
});
afterAll(async()=>{
 await redis.del([key,snapshot]);
 await db.user.deleteMany({where:{id:{in:ids}}});
 await db.game.delete({where:{id:gameId}});
 await redis.quit();await db.$disconnect();
});
it('funds from actual coin debits, pays every qualifying player coins only, and settles stats',async()=>{
 // A missing wallet forces a partial failure; already committed awards must replay safely.
 await db.wallet.delete({where:{userId:ids[0]}});
 await expect(run()).rejects.toThrow('Wallet not found');
 await redis.del(snapshot);
 await expect(run()).rejects.toThrow('snapshot missing');
 await redis.copy(key,snapshot);
 await db.wallet.create({data:{userId:ids[0],coins:0,bonus:10}});
 await run();
 const payouts=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'}});
 expect(payouts).toHaveLength(10);
 expect(payouts.reduce((sum,row)=>sum+Number(row.amount),0)).toBeCloseTo(300,8);
 expect(payouts.every(row=>row.currency==='COINS'&&row.source==='COINS')).toBe(true);
 const wallets=await db.wallet.findMany({where:{userId:{in:ids}}});
 expect(wallets.every(w=>Number(w.bonus)===10)).toBe(true);
 expect(wallets.filter(w=>Number(w.coins)>0)).toHaveLength(10);
 const ordered=ids.slice(0,10).map(id=>Number(wallets.find(w=>w.userId===id)!.coins));
 expect(ordered).toEqual([...ordered].sort((a,b)=>b-a));
 expect(ordered.at(-1)).toBeGreaterThanOrEqual(27);
 const stat=await db.gameMonthRewardStat.findFirstOrThrow({where:{catId}});
 expect(Number(stat.coinsShareAmount)).toBe(300);
 expect(Number(stat.coinsSpent)).toBe(1200);expect(Number(stat.bonusSpent)).toBe(800);
 expect(stat.coinsRewardParticipants).toBe(10);expect(stat.bonusRewardParticipants).toBe(0);
 expect(Number(stat.bonusShareAmount)).toBe(0);expect(stat.rewardParticipantsScore).toBe(455);
});
it('replays concurrent settlements from the frozen plan despite changed original ranks and spending',async()=>{
 const before=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'},orderBy:{userId:'asc'}});
 await redis.zAdd(key,{value:ids[49],score:999999});
 const keys=getRankingRewardKeys(catId,'multi');
 await db.transaction.create({data:{userId:ids[0],txnRef:'monthly-late-spend',amount:500,currency:'COINS',source:'COINS',gateway:'WALLET',type:'DEBIT',status:'COMPLETED',category:'GAME_DEDUCTION',description:'Late historical entry',createdAt:new Date(Date.UTC(keys.dateInfo.year,keys.dateInfo.month-1,20)),metadata:{catId,mode:'MULTI'}}});
 await Promise.all([run(),run(),run()]);
 const after=await db.transaction.findMany({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'},orderBy:{userId:'asc'}});
 expect(after).toEqual(before);
 expect(await db.gameMonthRewardStat.count({where:{catId}})).toBe(1);
});
it('does not need a retained snapshot after the period has fully settled',async()=>{
 await redis.del(snapshot);
 await expect(run()).resolves.toBeUndefined();
 expect(await db.transaction.count({where:{userId:{in:ids},category:'GAME_MONTHLY_REWARD'}})).toBe(10);
});
