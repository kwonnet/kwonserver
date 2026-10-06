import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({get:vi.fn(),hGetAll:vi.fn(),hSet:vi.fn(),exists:vi.fn(),del:vi.fn(),kind:vi.fn(),cat:vi.fn(),word:vi.fn()}));
vi.mock('@/db',()=>({default:{}}));
vi.mock('@/redis',()=>({default:{get:deps.get,hGetAll:deps.hGetAll,hSet:deps.hSet,exists:deps.exists,del:deps.del}}));
vi.mock('@/services/helper',()=>({getGameType:deps.kind,getGameCatType:deps.cat,calculateWordMakerPlayerScore:deps.word}));
vi.mock('@/utils',async()=>({...await vi.importActual<typeof import('@/utils')>('@/utils'),clearRedisKeysByPattern:vi.fn()}));
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/utils/ai',()=>({generateRoomQuestion:vi.fn(),shuffleArray:vi.fn()}));
import {calculateGameRoomPoints,gameChatTime} from '@/services/v1/games';
import {GameEventEnum,GameCatType,GameType} from '@/types';
const room:any={roomId:'room',mode:'MULTI',catId:'cat',gameName:'Trivia',catName:'General',status:'CHAT',timer:5};
beforeEach(()=>{vi.clearAllMocks();deps.kind.mockReturnValue(GameType.TRIVIA);deps.cat.mockReturnValue(GameCatType.TYPEMANIA);deps.hSet.mockResolvedValue(1);deps.del.mockResolvedValue(1);});
it.each(['trivia','acronym','wordmaker'])('takes %s score mode from the server room, even for legacy answers without mode',async kind=>{
 if(kind==='acronym')deps.kind.mockReturnValue(GameType.ACRONYM);
 if(kind==='wordmaker'){deps.cat.mockReturnValue(GameCatType.WORDMAKER);deps.word.mockReturnValue({score:5,answer:'test'});}
 deps.get.mockResolvedValue(JSON.stringify({question:'test',answer:'test'}));
 deps.hGetAll.mockImplementation(key=>Promise.resolve(key.endsWith(':answers')?{player:JSON.stringify({playerId:'player',roomId:'room',catId:'cat',answer:'test',timer:5,votes:[]})}:{}));
 const scores=await calculateGameRoomPoints(room);expect(scores).toHaveLength(1);expect(scores[0].mode).toBe('MULTI');
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
