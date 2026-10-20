vi.mock('@/services/v1/games/runtime',()=>({scheduleGamePhase:vi.fn(),beginGameRound:vi.fn(async(_room,question,seconds)=>({...question,roundId:'new-round',answerUntil:Date.now()+seconds*1000,voteUntil:Date.now()+(seconds+12)*1000}))}));
vi.mock('@/services/v1/games/rounds',()=>({recordGameRound:vi.fn()}));
vi.mock('@/services/v1/games/clock',()=>({gameClock:async()=>Date.now()}));
import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({get:vi.fn(),hGetAll:vi.fn(),hSet:vi.fn(),exists:vi.fn(),del:vi.fn(),kind:vi.fn(),cat:vi.fn(),word:vi.fn(),set:vi.fn(),sCard:vi.fn(),generate:vi.fn()}));
vi.mock('@/db',()=>({default:{}}));
vi.mock('@/redis',()=>({default:{get:deps.get,hGetAll:deps.hGetAll,hSet:deps.hSet,exists:deps.exists,del:deps.del,set:deps.set,sCard:deps.sCard}}));
vi.mock('@/services/helper',()=>({getGameType:deps.kind,getGameCatType:deps.cat,calculateWordMakerPlayerScore:deps.word}));
vi.mock('@/utils',async()=>({...await vi.importActual<typeof import('@/utils')>('@/utils'),clearRedisKeysByPattern:vi.fn()}));
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/utils/ai',()=>({generateRoomQuestion:deps.generate,shuffleArray:vi.fn()}));
import {forwardGamePlayerEvent,calculateGameRoomPoints,gameChatTime,gamePlayTime,checkGameNumPlayers} from '@/services/v1/games';
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

it.each([['SINGLE',GameCatType.TYPEMANIA,20],['MULTI',GameCatType.TYPEMANIA,20],['SINGLE',GameCatType.UNSCRAMBLE,20],['MULTI',GameCatType.UNSCRAMBLE,20],['SINGLE',GameCatType.WORDMAKER,20],['MULTI',GameCatType.WORDMAKER,20],['SINGLE',GameCatType.LUCKYSPIN,15],['MULTI',GameCatType.LUCKYSPIN,15],['SINGLE',GameCatType.LUCKYFLIP,10],['MULTI',GameCatType.LUCKYFLIP,15],['SINGLE',GameCatType.LUCKYWHIZ,10],['MULTI',GameCatType.LUCKYWHIZ,15],['SINGLE',GameCatType.HANGMAN,15],['MULTI',GameCatType.HANGMAN,15],['SINGLE',GameCatType.ANAGRAM,15],['MULTI',GameCatType.ANAGRAM,15]])('gives %s %s a %i-second answer window and timer',async(mode,cat,seconds)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
 try {
  deps.sCard.mockResolvedValue(2);deps.exists.mockResolvedValue(1);deps.cat.mockReturnValue(cat);deps.kind.mockReturnValue(GameType.MINDMASH);
  deps.generate.mockResolvedValue({id:'sentence',question:'The small cat sleeps near the window.',answer:'answer',options:[]});
  deps.hGetAll.mockResolvedValue({...room,mode,status:'PLAY',timer:String(seconds)});
  const emit=vi.fn();
  await checkGameNumPlayers({...room,mode,catName:cat===GameCatType.TYPEMANIA?'Typing Mania':String(cat)}, {to:()=>({emit})} as any);
  const {beginGameRound}=await import('@/services/v1/games/runtime');
  expect(beginGameRound).toHaveBeenCalledWith(expect.objectContaining({mode}),expect.objectContaining({id:'sentence'}),seconds);
  expect(emit).toHaveBeenCalledWith(GameEventEnum.GAME_ROOM_STATE,expect.objectContaining({status:'PLAY',countdown:seconds,deadline:Date.now()+Number(seconds)*1000}));
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});

it('does not apply a delayed energy refresh to a player who switched categories',()=>{
 const old=vi.fn(),current=vi.fn(),broadcast=vi.fn();
 const io:any={adapter:{rooms:new Map([['player',new Set(['old','current'])]])},sockets:new Map([
  ['old',{data:{room:{catId:'other'}},emit:old}],['current',{data:{room:{catId:'cat'}},emit:current}],
 ]),local:{to:()=>({emit:broadcast})}};
 const payload={catId:'cat',gauge:40};
 forwardGamePlayerEvent(io,{target:'player',event:GameEventEnum.GAME_PLAYER_ENERGY,payload});
 expect(current).toHaveBeenCalledWith(GameEventEnum.GAME_PLAYER_ENERGY,payload);
 expect(old).not.toHaveBeenCalled();expect(broadcast).not.toHaveBeenCalled();
});

it('boosts positive final base scores once, preserves zero scores, and sorts boosted results',async()=>{
 deps.kind.mockReturnValue(GameType.MINDMASH);deps.cat.mockReturnValue(GameCatType.TYPEMANIA);
 const snapshot:any={question:{id:'q',question:'test',answer:'test',options:[]},answers:[
  {playerId:'a',roomId:'room',catId:'cat',answer:'test',timer:10,accountBenefits:{level:1,version:4,gamePointBoostBps:500}},
  {playerId:'b',roomId:'room',catId:'cat',answer:'test',timer:10,accountBenefits:{level:3,version:4,gamePointBoostBps:1500}},
  {playerId:'c',roomId:'room',catId:'cat',answer:'wrong',timer:10,accountBenefits:{level:3,version:4,gamePointBoostBps:1500}},
 ]};
 const scores=await calculateGameRoomPoints(room,snapshot);
 expect(scores.find(s=>s.playerId==='a')).toMatchObject({baseScore:40,score:42,boostPoints:2,accountLevel:1,benefitsVersion:4});
 expect(scores.find(s=>s.playerId==='b')).toMatchObject({baseScore:30,score:35,boostPoints:5});
 expect(scores.find(s=>s.playerId==='c')).toMatchObject({baseScore:0,score:0,boostPoints:0});
 expect(await calculateGameRoomPoints(room,snapshot)).toEqual(scores);
});
