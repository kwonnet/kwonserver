import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({get:vi.fn(),hGetAll:vi.fn(),hSet:vi.fn(),exists:vi.fn(),del:vi.fn(),kind:vi.fn(),cat:vi.fn(),word:vi.fn(),set:vi.fn(),sCard:vi.fn(),generate:vi.fn()}));
vi.mock('@/db',()=>({default:{}}));
vi.mock('@/redis',()=>({default:{get:deps.get,hGetAll:deps.hGetAll,hSet:deps.hSet,exists:deps.exists,del:deps.del,set:deps.set,sCard:deps.sCard}}));
vi.mock('@/services/helper',()=>({getGameType:deps.kind,getGameCatType:deps.cat,calculateWordMakerPlayerScore:deps.word}));
vi.mock('@/utils',async()=>({...await vi.importActual<typeof import('@/utils')>('@/utils'),clearRedisKeysByPattern:vi.fn()}));
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/utils/ai',()=>({generateRoomQuestion:deps.generate,shuffleArray:vi.fn()}));
import {calculateGameRoomPoints,gameChatTime,gamePlayTime,checkGameNumPlayers} from '@/services/v1/games';
import {GameEventEnum,GameCatType,GameType} from '@/types';
const room:any={roomId:'room',mode:'MULTI',catId:'cat',gameName:'Trivia',catName:'General',status:'CHAT',timer:5};
beforeEach(()=>{vi.clearAllMocks();deps.kind.mockReturnValue(GameType.TRIVIA);deps.cat.mockReturnValue(GameCatType.TYPEMANIA);deps.hSet.mockResolvedValue(1);deps.del.mockResolvedValue(1);});
it.each(['trivia','acronym','wordmaker'])('takes %s score mode from the server room, even for legacy answers without mode',async kind=>{
 if(kind==='acronym')deps.kind.mockReturnValue(GameType.ACRONYM);
 if(kind==='wordmaker'){deps.cat.mockReturnValue(GameCatType.WORDMAKER);deps.word.mockReturnValue({score:5,answer:'test'});}
 deps.get.mockResolvedValue(JSON.stringify({question:'test',answer:'test'}));
 deps.hGetAll.mockImplementation(key=>Promise.resolve(key.endsWith(':answers')?{player:JSON.stringify({playerId:'player',avatar:'https://images.test/player.webp',roomId:'room',catId:'cat',answer:'test',timer:5,votes:[]})}:{}));
 const scores=await calculateGameRoomPoints(room);expect(scores).toHaveLength(1);expect(scores[0].mode).toBe('MULTI');expect(scores[0].avatar).toBe('https://images.test/player.webp');
});
it('contains asynchronous timer failures and informs the affected room',async()=>{
 vi.useFakeTimers();
 try{
  deps.hGetAll.mockResolvedValue(room);deps.exists.mockResolvedValue(1);
  const emit=vi.fn().mockImplementationOnce(()=>{throw new Error('tick failed');});const io:any={to:()=>({emit})};
  await gameChatTime('room',io);await vi.advanceTimersByTimeAsync(1000);
  expect(emit).toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,expect.stringContaining('rejoin'));expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it('does not overlap room timer ticks while Redis is slow',async()=>{
 vi.useFakeTimers();
 try{
  let finish:(value:number)=>void=()=>{};deps.hGetAll.mockResolvedValue(room);deps.exists.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await gameChatTime('room',{to:()=>({emit:vi.fn()})} as any);await vi.advanceTimersByTimeAsync(3000);expect(deps.exists).toHaveBeenCalledTimes(1);
  finish(1);await vi.advanceTimersByTimeAsync(1);
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
it('awards normal round points for accepted Unscramble alternatives and rejects an unapproved permutation',async()=>{
 deps.kind.mockReturnValue(GameType.MINDMASH);deps.cat.mockReturnValue(GameCatType.UNSCRAMBLE);
 deps.get.mockResolvedValue(JSON.stringify({question:'cat the near sleeps small window the',answer:'The small cat sleeps near the window.',acceptedAnswers:['The small cat sleeps near the window.','Near the window the small cat sleeps.'],options:[]}));
 const answer=(playerId:string,answer:string,timer:number)=>JSON.stringify({playerId,roomId:'room',catId:'cat',answer,timer});
 deps.hGetAll.mockImplementation(key=>Promise.resolve(key.endsWith(':answers')?{
  correct:answer('correct',' NEAR THE WINDOW, THE SMALL CAT SLEEPS! ',10),
  wrong:answer('wrong','cat the near sleeps small window the',9),
 }:{}));
 const scores=await calculateGameRoomPoints(room);
 expect(scores.map(score=>({id:score.playerId,score:score.score}))).toEqual([{id:'correct',score:30},{id:'wrong',score:0}]);
});

it('broadcasts sentence puzzles without private accepted answers or an answer key',async()=>{
 vi.useFakeTimers();
 try {
  deps.hGetAll.mockResolvedValue({...room,status:'PLAY'});
  const emit=vi.fn();
  await gamePlayTime('room',{to:()=>({emit})} as any,{id:'sentence',question:'window the near cat sleeps',answer:'The cat sleeps near the window.',acceptedAnswers:['The cat sleeps near the window.'],options:[],type:GameType.MINDMASH});
  const sent=emit.mock.calls.find(([event])=>event===GameEventEnum.GAME_ROOM_QUESTION)?.[1];
  expect(sent.question.answer).toBe('');expect(sent.question).not.toHaveProperty('acceptedAnswers');
 } finally {vi.clearAllTimers();vi.useRealTimers();}
});

it.each([['SINGLE',GameCatType.TYPEMANIA],['MULTI',GameCatType.TYPEMANIA],['SINGLE',GameCatType.UNSCRAMBLE],['MULTI',GameCatType.UNSCRAMBLE]])('gives %s %s a twenty-second answer window and timer',async(mode,cat)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
 try {
  deps.sCard.mockResolvedValue(2);deps.exists.mockResolvedValue(1);deps.cat.mockReturnValue(cat);deps.kind.mockReturnValue(GameType.MINDMASH);
  deps.generate.mockResolvedValue({id:'sentence',question:'The small cat sleeps near the window.',answer:'answer',options:[]});
  deps.hGetAll.mockResolvedValue({...room,mode,status:'PLAY',timer:'20'});
  const emit=vi.fn();
  await checkGameNumPlayers({...room,mode,catName:cat===GameCatType.TYPEMANIA?'Typing Mania':'Unscramble'}, {to:()=>({emit})} as any);
  expect(deps.set).toHaveBeenCalledWith('room:room:question',expect.any(String));
  const saved=JSON.parse(deps.set.mock.calls[0][1]);
  expect(saved.answerUntil).toBe(Date.now()+20000);
  expect(deps.hSet).toHaveBeenCalledWith('room:room',expect.objectContaining({timer:20,status:'PLAY'}));
  await vi.advanceTimersByTimeAsync(1000);
  expect(emit).toHaveBeenCalledWith(GameEventEnum.GAME_ROOM_STATE,{status:'PLAY',countdown:19});
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
