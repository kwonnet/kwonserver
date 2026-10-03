import { expect, it, vi } from 'vitest';
import { inventoryConfig } from '@/services/questionInventory/config';
import { validateQuestion, validateBatch, questionHash } from '@/services/questionInventory/validation';
import { QuestionInventoryService, InventoryEmptyError, InventoryExhaustedError, generationJobId } from '@/services/questionInventory/service';
import { generationProcessor } from '@/services/questionInventory/processor';
const valid = { question: 'What is two plus two?', answer: '4', options: ['3','4','5','6'] };
function fixture(count = 0) {
 const db = { gameCategory: {findUnique: vi.fn().mockResolvedValue({id:'cat',name:'Math',topics:['Arithmetic']})},
 quizQuestion:{count:vi.fn().mockResolvedValue(count),findMany:vi.fn().mockResolvedValue([]),createManyAndReturn:vi.fn().mockResolvedValue([{id:'q'}])}};
 const redis={exists:vi.fn().mockResolvedValue(1),sadd:vi.fn(),expire:vi.fn(),set:vi.fn(),srandmember:vi.fn().mockResolvedValue(['q'])};
 const queue={getJob:vi.fn(),add:vi.fn()};
 const service=new QuestionInventoryService(db as any,redis as any,queue as any,inventoryConfig({QUIZ_BATCH_INTERVAL_MS:'1'}),{warn:vi.fn()});
 return {db,redis,queue,service};
}
it('validates and canonicalizes the correct option',()=>expect(validateQuestion({...valid,answer:' 4 '})).toEqual(valid));
it.each([
 {...valid,question:''}, {...valid,answer:''}, {...valid,options:['3','4','5']},
 {...valid,options:['3','4','5','6','7']}, {...valid,options:['3','4','5','']},
 {...valid,options:['yes',' YES!','no','maybe']}, {...valid,answer:'7'},
 {...valid,options:['4','4','5','6']}, null,
])('rejects malformed question %j',input=>expect(validateQuestion(input)).toBeNull());
it('normalizes case whitespace and punctuation before hashing',()=>expect(questionHash(' WHAT is two plus two?! ')).toBe(questionHash(valid.question)));
it('keeps valid entries from partial batches and rejects normalized duplicates',()=>{
 const result=validateBatch([valid,{...valid,question:'What IS two plus two!'},null]);
 expect(result.valid).toHaveLength(1);expect(result.invalidCount).toBe(1);expect(result.duplicateCount).toBe(1);
});
it('accounts for database conflicts and never consumes the global pool',async()=>{
 const f=fixture();f.db.quizQuestion.createManyAndReturn.mockResolvedValue([]);
 const result=await f.service.insertBatch('cat',[valid,null]);
 expect(result).toEqual({generatedCount:2,invalidCount:1,duplicateCount:1,insertedCount:0});
 expect(f.db.quizQuestion.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({skipDuplicates:true}));
 expect(f.redis.sadd).not.toHaveBeenCalled();
});
it.each([[0,1,100],[10,2,200],[50,5,200]])('replenishes count %i at priority %i',async(count,priority,target)=>{
 const f=fixture(count);await f.service.ensureInventory('cat');
 expect(f.queue.add).toHaveBeenCalledWith('replenish',{categoryId:'cat',target},expect.objectContaining({priority,jobId:generationJobId('cat'),attempts:3,backoff:{type:'exponential',delay:5000}}));
 expect(generationJobId('cat')).not.toContain(':');
});
it('healthy global diversity does not enqueue unnecessarily',async()=>{
 const f=fixture(130);await f.service.ensureInventory('cat');expect(f.queue.add).not.toHaveBeenCalled();
});
it('room exhaustion expands the target without decrementing global supply',async()=>{
 const f=fixture(200);await f.service.ensureInventory('cat',190);
 expect(f.queue.add).toHaveBeenCalledWith('replenish',{categoryId:'cat',target:241},expect.objectContaining({priority:2}));
});
it('deduplicates pending/running jobs via stable category ID',async()=>{
 const f=fixture();f.queue.getJob.mockResolvedValue({getState:async()=> 'active'});
 await f.service.ensureInventory('cat');expect(f.queue.add).not.toHaveBeenCalled();
});
it('failed categories cool down instead of retrying invalid data indefinitely',async()=>{
 const f=fixture();f.queue.getJob.mockResolvedValue({getState:async()=> 'failed',finishedOn:Date.now()});
 await f.service.ensureInventory('cat');expect(f.queue.add).not.toHaveBeenCalled();
});
it('empty inventory raises a typed error after scheduling a seed',async()=>{
 const f=fixture();await expect(f.service.getCandidates('cat')).rejects.toBeInstanceOf(InventoryEmptyError);
 expect(f.queue.add).toHaveBeenCalledOnce();
});
it('different rooms can reuse the same question despite generator queue failure',async()=>{
 const f=fixture(10);f.queue.getJob.mockRejectedValue(new Error('provider/queue down'));
 f.db.quizQuestion.findMany.mockResolvedValue([{id:'q',...valid}] as any);
 expect(await f.service.getCandidates('cat')).toEqual(await f.service.getCandidates('cat'));
});
it('cache rebuild pages PostgreSQL without generating questions',async()=>{
 const f=fixture(1);f.db.quizQuestion.findMany.mockResolvedValueOnce([{id:'q'}] as any).mockResolvedValueOnce([]);
 await f.service.rebuildCategoryInventory('cat');
 expect(f.redis.sadd).toHaveBeenCalledWith('quiz:category:cat:pool','q');
 expect(f.queue.add).not.toHaveBeenCalled();
});
it('Redis loss falls back to PostgreSQL selection',async()=>{
 const f=fixture(100);f.redis.exists.mockRejectedValue(new Error('redis down'));
 f.db.quizQuestion.findMany.mockResolvedValue([{id:'q'}] as any);
 expect(await f.service.getCandidates('cat')).toEqual([{id:'q'}]);
});
it('missing category cannot accept generated questions',async()=>{
 const f=fixture();f.db.gameCategory.findUnique.mockResolvedValue(null);
 await expect(f.service.insertBatch('bad',[valid])).rejects.toThrow('Unknown quiz category');
 expect(f.db.quizQuestion.createManyAndReturn).not.toHaveBeenCalled();
});
it('transient model failure propagates for BullMQ retries',async()=>{
 const f=fixture();const generator={generateBatch:vi.fn().mockRejectedValue(new Error('rate limited'))};
 await expect(generationProcessor(f.service,generator)({data:{categoryId:'cat',target:100},opts:{},attemptsMade:0} as any)).rejects.toThrow('rate limited');
});
it('worker uses target and inserted counts, continuing after partial batches',async()=>{
 const f=fixture();f.db.quizQuestion.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
 const generator={generateBatch:vi.fn().mockResolvedValue([valid])};
 await generationProcessor(f.service,generator)({data:{categoryId:'cat',target:2},opts:{},attemptsMade:0} as any);
 expect(generator.generateBatch).toHaveBeenCalledTimes(2);
 expect(generator.generateBatch.mock.calls[0][0].count).toBe(2);
 expect(generator.generateBatch.mock.calls[1][0].count).toBe(1);
});
it('duplicate-heavy batches stop at bounded no-progress budget',async()=>{
 const f=fixture();f.db.quizQuestion.createManyAndReturn.mockResolvedValue([]);
 const generator={generateBatch:vi.fn().mockResolvedValue([valid])};
 await expect(generationProcessor(f.service,generator)({data:{categoryId:'cat',target:100},opts:{},attemptsMade:0} as any)).rejects.toThrow('Three quiz batches');
 expect(generator.generateBatch).toHaveBeenCalledTimes(3);
});
it('central config rejects invalid settings and allows target changes independently',()=>{
 expect(()=>inventoryConfig({QUIZ_GENERATION_BATCH_SIZE:'0'})).toThrow();
 expect(()=>inventoryConfig({QUIZ_CRITICAL_THRESHOLD:'70'})).toThrow();
 const f=fixture();f.service.config.defaultTarget=500;
 expect(f.service.calculateTargetInventory(130)).toBe(500);
});
