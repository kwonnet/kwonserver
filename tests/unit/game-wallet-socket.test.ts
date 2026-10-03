import { beforeEach, expect, it, vi } from 'vitest';
const games = vi.hoisted(() => ({deductGameCoins:vi.fn(),retrieveGameRoomQuestion:vi.fn(),saveGameRoomPlayerAnswer:vi.fn(),insertWordMakerGameRoomAnswer:vi.fn(),updatePlayerSession:vi.fn()}));
vi.mock('@/services/v1/games',()=>games);
vi.mock('@/services/helper',()=>({composeGameAnswer:({params}:any)=>params,getGameType:vi.fn(),getGameCatType:vi.fn()}));
import gameSocketIo from '@/socketIo/gameSocketIo';
import {GameEventEnum,GameActionEnum} from '@/types';
let handlers:Record<string,Function>,socket:any;
beforeEach(()=>{
 vi.clearAllMocks(); handlers={};
 socket={id:'socket',data:{user:{id:'user'}},on:(event:string,fn:Function)=>{handlers[event]=fn;},emit:vi.fn()};
 const io={use:vi.fn(),on:(_event:string,fn:Function)=>fn(socket)};
 gameSocketIo({of:()=>io} as any);
 // Server-owned state populated from the catalog at join time.
 socket.data.room={id:'room',catId:'cat',gameId:'game',mode:'MULTI'};
 socket.data.gameType='TRIVIA';socket.data.catType='GENERAL';
 games.retrieveGameRoomQuestion.mockResolvedValue({id:'question',roundId:'server-round'});
 games.deductGameCoins.mockResolvedValue({isError:false,data:{amount:10,bonus:0}});
 games.saveGameRoomPlayerAnswer.mockResolvedValue(undefined);
 games.insertWordMakerGameRoomAnswer.mockResolvedValue({isError:false});
});
it('ignores client game/category labels when choosing a charge and answer handler',async()=>{
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'question',roundId:'server-round',answer:'answer',gameType:'MINDMASH',catType:'WORDMAKER'});
 expect(games.deductGameCoins).toHaveBeenCalledWith(expect.objectContaining({action:GameActionEnum.ANSWER}),expect.objectContaining({kind:'ANSWER',payload:expect.objectContaining({gameType:'TRIVIA',catType:'GENERAL'})}));
 expect(games.saveGameRoomPlayerAnswer).not.toHaveBeenCalled();
 expect(games.insertWordMakerGameRoomAnswer).not.toHaveBeenCalled();
});
it('uses stable charge identities for retries and distinct identities for new server rounds',async()=>{
 const args={qId:'question',roundId:'server-round',answer:'answer',gameType:'TRIVIA',catType:'GENERAL'};
 await handlers[GameEventEnum.GAME_ROOM_ANSWER](args);await handlers[GameEventEnum.GAME_ROOM_ANSWER](args);
 const first=games.deductGameCoins.mock.calls[0][0].operationId;
 expect(games.deductGameCoins.mock.calls[1][0].operationId).toBe(first);
 games.retrieveGameRoomQuestion.mockResolvedValue({id:'question',roundId:'next-round'});
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({...args,roundId:'next-round'});
 expect(games.deductGameCoins.mock.calls[2][0].operationId).not.toBe(first);
});
it('does not charge stale or empty answers',async()=>{
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'old-question',answer:'answer'});
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'question',roundId:'server-round',answer:'  '});
 expect(games.deductGameCoins).not.toHaveBeenCalled();
});
