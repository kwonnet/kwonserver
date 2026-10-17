import {afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({parse:vi.fn(),select:vi.fn()}));
vi.mock('@/config',()=>({openai:{responses:{parse:deps.parse}},deepSeekAi:{},axiosXAI:{}}));
vi.mock('@/services/helper',()=>({getGameCatType:(name:string)=>name.toUpperCase()}));
vi.mock('@/services/questionInventory/runtime',()=>({getQuestionInventory:()=>({})}));
vi.mock('@/services/v1/games/questionInventory',()=>({getInventoryRoomQuestion:deps.select}));
import {generateHangmanQuestion,generateWordMakerQuestion,generateTypingManiaQuestion,generateUnscrambleQuestion,generateSentenceBatch,scrambleSentence} from '@/utils/ai';
import {canFormWord,englishDictionary,matchesSentenceAnswer,normalizeSentence,publicWordQuestion,wordBag} from '@/utils/word-games';
import {validateSentenceQuestion} from '@/services/questionInventory/validation';
import {GameCatType} from '@/types';
const sentence='The small cat sleeps near the window.';
const alternative='Near the window the small cat sleeps.';
const stored={id:'stored',question:sentence,answer:sentence,options:[sentence,alternative],type:'MINDMASH'} as any;
afterEach(()=>vi.restoreAllMocks());
it.each([0,0.1,0.5,0.999999])('always masks Hangman letters and provides four solvable choices with RNG %s',random=>{
 vi.spyOn(Math,'random').mockReturnValue(random);
 const q=generateHangmanQuestion();
 const blanks=[...q.question].filter(letter=>letter==='-').length;
 expect(blanks).toBeGreaterThan(0);expect(blanks).toBeLessThan(q.question.length);
 expect(q.answer.split(',')).toHaveLength(blanks);
 expect(q.options).toHaveLength(4);expect(new Set(q.options).size).toBe(4);
 expect(q.options).toContain(q.answer);
 expect(publicWordQuestion(q).answer).toBe('');
 for(const option of q.options)expect(option).toMatch(new RegExp(`^[a-z](,[a-z]){${blanks-1}}$`));
 let next=0;
 const solved=[...q.question].map(letter=>letter==='-'?q.answer.split(',')[next++]:letter).join('');
 expect(englishDictionary().has(solved)).toBe(true);
});
it('keeps Hangman valid over repeated random generations',()=>{
 for(let i=0;i<250;i++){
  const q=generateHangmanQuestion();expect(q.question).toContain('-');expect(q.answer).not.toBe('');expect(q.options).toHaveLength(4);
 }
});
it('generates playable WordMaker words and letter racks from actual dictionary words',()=>{
 const dictionary=[...englishDictionary()];
 for(const random of [0,0.4,0.6,0.999999]){
  vi.spyOn(Math,'random').mockReturnValue(random);
  const q=generateWordMakerQuestion();const letters=q.question.replace(/[^a-z]/g,'');
  expect(englishDictionary().has(letters) || q.question.includes(',')).toBe(true);
  const valid=dictionary.filter(word=>word.length>=3 && word!==letters && canFormWord(letters,word));
  expect(valid.length).toBeGreaterThanOrEqual(2);
  vi.restoreAllMocks();
 }
});
it('serves TypeMania from inventory without a model request and keeps its answer private',async()=>{
 deps.select.mockResolvedValue({...stored,options:[]});
 const q=await generateTypingManiaQuestion({roomId:'room',catId:'cat'} as any);
 expect(q.question).toBe(sentence);expect(q.acceptedAnswers).toEqual([sentence]);
 expect(publicWordQuestion(q)).not.toHaveProperty('acceptedAnswers');expect(publicWordQuestion(q).answer).toBe('');
 expect(deps.parse).not.toHaveBeenCalled();
});
it('shuffles stored Unscramble sentences and preserves private alternatives without calling AI',async()=>{
 deps.select.mockResolvedValue(stored);
 const q=await generateUnscrambleQuestion({roomId:'room',catId:'cat'} as any);
 expect(wordBag(q.question)).toBe(wordBag(sentence));expect(q.options).toEqual([]);
 expect(q.acceptedAnswers).toEqual(stored.options);
 expect(q.hint).toBe('The small cat …');
 expect(publicWordQuestion(q).hint).toBe('The small cat …');
 expect(stored.options.map(normalizeSentence)).not.toContain(q.question);
 expect(publicWordQuestion(q)).not.toHaveProperty('acceptedAnswers');expect(publicWordQuestion(q).answer).toBe('');
 expect(deps.parse).not.toHaveBeenCalled();
});
it('forces a different scrambled order even when the shuffle returns the original',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0.999999);
 const result=scrambleSentence(sentence,[sentence,alternative]);
 expect(wordBag(result)).toBe(wordBag(sentence));expect(result).not.toBe(normalizeSentence(sentence));
});
it('accepts known grammatical arrangements and harmless formatting, but not arbitrary permutations or missing repeated words',()=>{
 const q={...stored,acceptedAnswers:stored.options};
 expect(matchesSentenceAnswer(q,'  NEAR THE WINDOW, THE SMALL CAT SLEEPS! ',GameCatType.UNSCRAMBLE)).toBe(true);
 expect(matchesSentenceAnswer(q,'small cat the sleeps the near window',GameCatType.UNSCRAMBLE)).toBe(false);
 expect(matchesSentenceAnswer(q,'Near window the small cat sleeps',GameCatType.UNSCRAMBLE)).toBe(false);
 expect(matchesSentenceAnswer({...q,acceptedAnswers:[sentence]},sentence.toUpperCase(),GameCatType.TYPEMANIA)).toBe(true);
});
it('validates sentence lengths, dictionary words, alternative token multiplicities and canonical inclusion',()=>{
 expect(validateSentenceQuestion(stored,'UNSCRAMBLE')).toEqual(storedWithoutId());
 for(const invalid of [
  {...stored,question:'A cat flies.'}, {...stored,question:'The xyzqq cat sleeps near the window.'},
  {...stored,options:['Near window the small cat sleeps']}, {...stored,options:[]},
  {...stored,options:[alternative]}, {...stored,options:[sentence,'The small cats sleep near the window.']},
 ])expect(validateSentenceQuestion(invalid,'UNSCRAMBLE')).toBeNull();
 expect(validateSentenceQuestion({...stored,options:[]},'TYPEMANIA')).not.toBeNull();
 expect(validateSentenceQuestion(stored,'TYPEMANIA')).toBeNull();
 function storedWithoutId(){return {question:sentence,answer:sentence,options:[sentence,alternative]};}
});
it.each(['TYPEMANIA','UNSCRAMBLE'] as const)('requests a bounded structured batch for %s with the existing provider adapter',async kind=>{
 deps.parse.mockResolvedValue({output_parsed:{questions:[stored]}});
 expect(await generateSentenceBatch({categoryId:'cat',categoryName:kind,topics:['Nature'],count:25},kind)).toEqual([stored]);
 expect(deps.parse).toHaveBeenCalledWith(expect.objectContaining({input:expect.stringContaining('Create 25'),text:expect.any(Object)}),{timeout:90000,maxRetries:0});
 expect(deps.parse.mock.calls[0][0].input).toContain(kind);
 expect(deps.parse.mock.calls[0][0].input).toContain('Use 5 to 7 words');
});

it.each(['TYPEMANIA','UNSCRAMBLE'] as const)('caps %s at seven words while allowing five-word sentences',kind=>{
 for(const sentence of ['The cat sleeps near windows.','The small cat sleeps near the window.']){
  expect(validateSentenceQuestion({question:sentence,answer:sentence,options:kind==='UNSCRAMBLE'?[sentence]:[]},kind)).not.toBeNull();
 }
 const sentence='The small brown cat sleeps near the window.';
 expect(validateSentenceQuestion({question:sentence,answer:sentence,options:kind==='UNSCRAMBLE'?[sentence]:[]},kind)).toBeNull();
});
