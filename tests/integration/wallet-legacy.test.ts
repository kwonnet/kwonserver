import {PrismaPg} from "@prisma/adapter-pg";
import {moneyJson} from '@/services/walletLedger';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})})};});
vi.mock('@/redis',async()=>{const {createClient}=await import('redis');const client=createClient({url:'redis://127.0.0.1:16379'});await client.connect();return {default:client};});
import db from '@/db';
import redis from '@/redis';
import {syncRedisTxnsToPrisma,run} from '@/cron/recurring/sync_redis_prisma_transactions';
const userId='legacy-wallet-test',key=`user:${userId}:transactions`;
beforeAll(async()=>{await db.user.create({data:{id:userId,name:'Legacy',username:userId,email:'legacy@test.invalid',wallet:{create:{coins:50}}}});});
afterAll(async()=>{await redis.del(key);await db.user.delete({where:{id:userId}});await redis.quit();await db.$disconnect();});
it('preserves every equal-score record across batches and retry after a Redis acknowledgement failure',async()=>{
 const records=Array.from({length:205},(_,i)=>({score:1000,value:JSON.stringify({userId,txnRef:`legacy-${i}`,amount:1,type:'DEBIT',status:'COMPLETED',gateway:'WALLET',source:'COINS',currency:'COINS',category:'GAME_DEDUCTION',description:'Legacy',createdAt:'2026-10-01T00:00:00Z',metadata:{}})}));
 await redis.zAdd(key,records);
 const remove=vi.spyOn(redis,'zRem').mockRejectedValueOnce(new Error('connection interrupted after database commit'));
 await expect(syncRedisTxnsToPrisma(userId)).rejects.toThrow();
 expect(await db.transaction.count({where:{userId}})).toBe(200);expect(await redis.zCard(key)).toBe(205);
 remove.mockRestore();await syncRedisTxnsToPrisma(userId);
 expect(await db.transaction.count({where:{userId}})).toBe(205);expect(await redis.zCard(key)).toBe(0);
 expect(moneyJson((await db.wallet.findUniqueOrThrow({where:{userId}})).coins)).toBe(50);
});

it('imports every transaction key in Redis scan batches',async()=>{
 const second='legacy-scan-second';
 await db.user.create({data:{id:second,name:'Scan',username:second,email:'scan@test.invalid',wallet:{create:{coins:50}}}});
 try {
  for (const id of [userId,second]) await redis.zAdd(`user:${id}:transactions`,[{score:2000,value:JSON.stringify({userId:id,txnRef:`scan-${id}`,amount:1,type:'DEBIT',status:'COMPLETED',gateway:'WALLET',source:'COINS',currency:'COINS',category:'GAME_DEDUCTION',description:'Scan',createdAt:'2026-10-01T00:00:00Z',metadata:{}})}]);
  await run();
  for (const id of [userId,second]) {
   expect(await db.transaction.count({where:{userId:id,txnRef:`scan-${id}`}})).toBe(1);
   expect(await redis.zCard(`user:${id}:transactions`)).toBe(0);
  }
 } finally {await redis.del(`user:${second}:transactions`);await db.user.delete({where:{id:second}});}
});
