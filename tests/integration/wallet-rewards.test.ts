import {PrismaPg} from "@prisma/adapter-pg";
import {moneyJson} from '@/services/walletLedger';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})})};});
vi.mock('@/redis',()=>({default:{exists:async()=>1}}));
vi.mock('@/services/helper',()=>({getRewardTopRankingPlayers:async()=>[{id:'reward-player',rank:1}],syncRedisUserWalletToPrisma:async()=>({isError:false}),syncPrismaUserWalletToRedis:async()=>({isError:false})}));
import db from '@/db';
import {run} from '@/cron/recurring/reward_top_players_every_week';
let gameId:string,milestoneId:string;
beforeAll(async()=>{
 await db.user.create({data:{id:'reward-player',name:'Reward test',email:'reward@test.invalid',username:'reward-test',wallet:{create:{coins:0}}}});
 gameId=(await db.game.create({data:{name:'Reward game',description:'test',modes:['MULTI'],categories:{create:{name:'test',description:'test'}}}})).id;
 milestoneId=(await db.gameMilestone.create({data:{name:'WEEK',milestone:1,reward:25,rewardType:'COINS',reason:'TOP_OF_THE_WEEK'}})).id;
});
afterAll(async()=>{
 await db.gameAchievement.deleteMany({where:{playerId:'reward-player'}});
 await db.user.delete({where:{id:'reward-player'}});await db.game.delete({where:{id:gameId}});await db.gameMilestone.delete({where:{id:milestoneId}});await db.$disconnect();
});
it('awaits weekly payouts, credits coins and does not repeat concurrent or retried rewards',async()=>{
 await Promise.all([run(),run(),run()]);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where:{userId:'reward-player'}})).coins)).toBe(25);
 expect(await db.transaction.count({where:{userId:'reward-player',category:'GAME_WEEKLY_REWARD'}})).toBe(1);
 expect(await db.gameAchievement.count({where:{playerId:'reward-player'}})).toBe(1);
});
