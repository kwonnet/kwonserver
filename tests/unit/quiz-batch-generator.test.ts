import { expect, it, vi } from 'vitest';
const parse=vi.hoisted(()=>vi.fn());
const selectQuestion=vi.hoisted(()=>vi.fn());
vi.mock('@/config',()=>({openai:{responses:{parse}},deepSeekAi:{},axiosXAI:{}}));
vi.mock('@/services/helper',()=>({getGameCatType:vi.fn()}));
vi.mock('wordlist-english',()=>({default:{}}));
vi.mock('@/services/questionInventory/runtime',()=>({getQuestionInventory:()=>({})}));
vi.mock('@/services/v1/games/questionInventory',()=>({getInventoryRoomQuestion:selectQuestion}));
import { generateTriviaBatch, generateTriviaQuestion } from '@/utils/ai';
import type { TempGameRoom } from '@/types';
it('serves the live quiz path from inventory without contacting the provider',async()=>{
 selectQuestion.mockResolvedValue({id:'stored-id',question:'Stored question',answer:'A',options:['A','B','C','D'],type:'trivia'});
 const question=await generateTriviaQuestion({roomId:'room',catId:'cat'} as TempGameRoom);
 expect(question.id).toBe('stored-id');
 expect(question.options).toEqual(expect.arrayContaining(['A','B','C','D']));
 expect(parse).not.toHaveBeenCalled();
});
it('sends one structured provider request for a batch with topics and a timeout',async()=>{
 parse.mockResolvedValue({output_parsed:{questions:[{question:'Q',answer:'A',options:['A','B','C','D']}]}});
 const result=await generateTriviaBatch({categoryId:'cat',categoryName:'Math',topics:['Arithmetic'],count:50});
 expect(result).toHaveLength(1);expect(parse).toHaveBeenCalledOnce();
 expect(parse).toHaveBeenCalledWith(expect.objectContaining({input:expect.stringContaining('Generate 50'),text:expect.any(Object)}),{timeout:90000,maxRetries:0});
 expect(parse.mock.calls[0][0].input).toContain('Arithmetic');
});
it('rejects missing structured output for bounded BullMQ retry',async()=>{
 parse.mockResolvedValue({output_parsed:null});
 await expect(generateTriviaBatch({categoryId:'cat',categoryName:'Math',topics:[],count:2})).rejects.toThrow('no structured batch');
});
