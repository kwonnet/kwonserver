import { expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({worker:{on:vi.fn(),run:vi.fn(()=>new Promise(()=>{})),close:vi.fn()},redis:{on:vi.fn(),quit:vi.fn()},Worker:vi.fn(),queue:{waitUntilReady:vi.fn(),setGlobalConcurrency:vi.fn()}}));
const errorLog=vi.hoisted(()=>vi.fn());
vi.mock('@/logger',()=>({default:{error:errorLog,warn:vi.fn()}}));
vi.mock('bullmq',()=>({Worker:class{constructor(...args:unknown[]){m.Worker(...args);return m.worker;}}}));
vi.mock('ioredis',()=>({default:class{constructor(){return m.redis;}}}));
vi.mock('@/services/questionInventory/runtime',()=>({QUIZ_QUEUE:'quiz-generation',getQuestionInventory:()=>({queue:m.queue,config:{concurrency:3}})}));
vi.mock('@/services/questionInventory/processor',()=>({generationProcessor:()=>async()=>{}}));
import { startQuizGeneration } from '@/cron/quizGeneration';
it('sets a distributed concurrency cap and runs in the background worker',async()=>{
 const worker=await startQuizGeneration();
 expect(m.queue.setGlobalConcurrency).toHaveBeenCalledWith(3);
 expect(m.Worker).toHaveBeenCalledWith('quiz-generation',expect.any(Function),expect.objectContaining({concurrency:3,autorun:false}));
 await worker.close();expect(m.worker.close).toHaveBeenCalledOnce();expect(m.redis.quit).toHaveBeenCalledOnce();
});
it('retains generation failure causes with category and retry context', async () => {
 await startQuizGeneration();
 const handler=m.worker.on.mock.calls.find(([event])=>event==='failed')![1];
 const err=new Error('Provider unavailable');
 handler({data:{categoryId:'cat'},id:'job',attemptsMade:2},err);
 expect(errorLog).toHaveBeenCalledWith({err,categoryId:'cat',jobId:'job',attempt:2},expect.any(String));
});
