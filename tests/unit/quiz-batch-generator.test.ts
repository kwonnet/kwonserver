import { expect, it, vi } from 'vitest';
const parse=vi.hoisted(()=>vi.fn());
const selectQuestion=vi.hoisted(()=>vi.fn());
vi.mock('@/config',()=>({openai:{responses:{parse}},deepSeekAi:{},axiosXAI:{}}));
vi.mock('@/services/helper',()=>({getGameCatType:vi.fn()}));
vi.mock('wordlist-english',()=>({default:{}}));
vi.mock('@/services/questionInventory/runtime',()=>({getQuestionInventory:()=>({})}));
vi.mock('@/services/v1/games/questionInventory',()=>({getInventoryRoomQuestion:selectQuestion}));
import { generateRoomQuestion, generateTriviaBatch, generateTriviaQuestion } from '@/utils/ai';
import { getGameCatType } from '@/services/helper';
import { GameCatType, GameType } from '@/types';
import type { TempGameRoom } from '@/types';
it.each([
 ['Trivia & Quiz', 'General Knowledge', 'History and science'],
 ['Academia Adventure', 'Mathematics', 'Arithmetic'],
 ['Sports & Games', 'Football', 'Rules and players'],
 ['Country Mania', 'Nigeria', 'Geography and culture'],
])('routes %s to stored quiz questions regardless of subject', async (gameName, catName, topics) => {
 selectQuestion.mockResolvedValue({id:'stored-id',question:'Stored question',answer:'A',options:['A','B','C','D'],type:GameType.TRIVIA});
 const room={roomId:'room',catId:'cat',gameName,catName,topics} as TempGameRoom;
 expect((await generateRoomQuestion(room))?.id).toBe('stored-id');
 expect(selectQuestion).toHaveBeenCalledOnce();
 expect(selectQuestion).toHaveBeenCalledWith(expect.anything(),room);
 expect(parse).not.toHaveBeenCalled();
});
it('routes quizzes without topics using category context', async () => {
 selectQuestion.mockResolvedValue({id:'stored-id',question:'Q',answer:'A',options:['A','B','C','D'],type:GameType.TRIVIA});
 await generateRoomQuestion({roomId:'room',catId:'cat',gameName:'Academia Adventure',catName:'Physics'} as TempGameRoom);
 expect(selectQuestion).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({topics:'Physics current affairs'}));
});
it.each(['Acronym Arcade','MindMash'])('keeps %s local even with trivia-related topics', async gameName => {
 vi.mocked(getGameCatType).mockReturnValue(GameCatType.TYPEMANIA);
 const question=await generateRoomQuestion({gameName,catName:'Typing Mania',topics:'sports, country, trivia'} as TempGameRoom);
 expect(question?.type).toBe(gameName==='MindMash'?GameType.MINDMASH:GameType.ACRONYM);
 expect(selectQuestion).not.toHaveBeenCalled();
 expect(parse).not.toHaveBeenCalled();
});
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
