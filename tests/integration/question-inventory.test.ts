import {PrismaPg} from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { QuestionInventoryService, GenerationJob, generationJobId, poolKey } from '@/services/questionInventory/service';
import { inventoryConfig } from '@/services/questionInventory/config';
import { getInventoryRoomQuestion, questionHistoryKey } from '@/services/v1/games/questionInventory';
import { generationProcessor } from '@/services/questionInventory/processor';
const db = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000})});
const connection = { host:'127.0.0.1',port:16379 };
const redis = new Redis({...connection,maxRetriesPerRequest:null});
const queue = new Queue<GenerationJob>('integration-quiz-inventory',{connection});
const config=inventoryConfig({QUIZ_BATCH_INTERVAL_MS:'1'});
const a=new QuestionInventoryService(db,redis,queue,config);
const b=new QuestionInventoryService(db,redis,queue,config);
let cat:string, game:string;
const question={question:'What is two plus two?',answer:'4',options:['3','4','5','6']};
beforeAll(async()=>{
 const created=await db.game.create({data:{name:'Inventory test',description:'Test',modes:[],categories:{create:{name:'Math',description:'Arithmetic',topics:['Addition']}}},include:{categories:true}});
 game=created.id;cat=created.categories[0].id;
});
beforeEach(async()=>{await queue.obliterate({force:true});await db.quizQuestion.deleteMany({where:{categoryId:cat}});await redis.del(poolKey(cat),poolKey(cat)+':ready',`quiz:category:${cat}:demand:rooms`,`quiz:category:${cat}:demand:peak`,`quiz:category:${cat}:demand:requests`);});
afterAll(async()=>{await queue.obliterate({force:true});await queue.close();await redis.quit();await db.game.delete({where:{id:game}});await db.$disconnect();});
it('PostgreSQL unique constraint safely resolves competing partial inserts',async()=>{
 const results=await Promise.all([a.insertBatch(cat,[question,null]),b.insertBatch(cat,[{...question,question:'WHAT is two plus two!'}])]);
 expect(results.reduce((sum,r)=>sum+r.insertedCount,0)).toBe(1);
 expect(await a.count(cat)).toBe(1);
 expect(results.reduce((sum,r)=>sum+r.duplicateCount,0)).toBe(1);
});
it('many independent callers create one pending category generation job',async()=>{
 await Promise.all(Array.from({length:30},(_,i)=>(i%2?a:b).ensureInventory(cat)));
 expect(await queue.getJobCounts('waiting','prioritized')).toMatchObject({waiting:0,prioritized:1});
 expect((await queue.getJob(generationJobId(cat)))?.data.target).toBe(100);
});
it('rebuilds lost Redis IDs and reuses the same question across rooms',async()=>{
 await a.insertBatch(cat,[question]);await redis.del(poolKey(cat));
 await a.rebuildCategoryInventory(cat);
 const first=await a.getCandidates(cat),second=await b.getCandidates(cat);
 expect(first[0].id).toBe(second[0].id);expect(await a.count(cat)).toBe(1);
 expect(await redis.scard(poolKey(cat))).toBe(1);
});
it('tracks room diversity demand without counting every delivery as depleted stock',async()=>{
 await a.recordDemand(cat,'room-a',80);await b.recordDemand(cat,'room-b',10);
 const metrics=await a.demand(cat);expect(metrics.activeRooms).toBe(2);expect(metrics.peakRoomConsumption).toBe(80);
 expect(a.calculateTargetInventory(500,metrics.peakRoomConsumption)).toBe(200);
});
it('BullMQ retries a transient generator failure and persists the successful batch',async()=>{
 let calls=0;
 const events=new QueueEvents(queue.name,{connection});await events.waitUntilReady();
 const worker=new Worker(queue.name,generationProcessor(a,{generateBatch:async()=>{if(++calls===1)throw new Error('Temporary provider failure');return [question];}}),{connection});
 try{
 const job=await queue.add('replenish',{categoryId:cat,target:1},{attempts:2,backoff:{type:'exponential',delay:10}});
 await job.waitUntilFinished(events,10000);
 expect(calls).toBe(2);expect(await a.count(cat)).toBe(1);
 }finally{await worker.close();await events.close();}
});
it('global concurrency bounds work across multiple worker processes',async()=>{
 await queue.setGlobalConcurrency(1);
 let running=0,peak=0;
 const handler=async()=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,30));running--;};
 const events=new QueueEvents(queue.name,{connection});await events.waitUntilReady();
 const workers=[new Worker(queue.name,handler,{connection,concurrency:3}),new Worker(queue.name,handler,{connection,concurrency:3})];
 try{
 const jobs=await Promise.all(Array.from({length:6},()=>queue.add('probe',{categoryId:cat,target:1})));
 await Promise.all(jobs.map(j=>j.waitUntilFinished(events,10000)));
 expect(peak).toBe(1);
 }finally{await Promise.all(workers.map(w=>w.close()));await events.close();}
});

it('room history prevents repeats atomically without consuming shared category inventory',async()=>{
 await a.insertBatch(cat,[question]);
 const roomA={roomId:'inventory-room-a',catId:cat} as any, roomB={roomId:'inventory-room-b',catId:cat} as any;
 await redis.del(questionHistoryKey(roomA.roomId),questionHistoryKey(roomB.roomId));
 try{
 const results=await Promise.allSettled([getInventoryRoomQuestion(a,roomA),getInventoryRoomQuestion(b,roomA)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const different=await getInventoryRoomQuestion(b,roomB);
 const winner=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
 expect(different.id).toBe(winner.value.id);
 expect(await a.count(cat)).toBe(1);
 expect(await redis.scard(poolKey(cat))).toBe(1);
 }finally{await redis.del(questionHistoryKey(roomA.roomId),questionHistoryKey(roomB.roomId));}
});
