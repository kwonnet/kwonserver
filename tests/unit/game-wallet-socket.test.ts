import { beforeEach, expect, it, vi } from 'vitest';
const games = vi.hoisted(() => ({deductGameCoins:vi.fn(),retrieveGameRoomQuestion:vi.fn(),saveGameRoomPlayerAnswer:vi.fn(),insertWordMakerGameRoomAnswer:vi.fn(),updatePlayerSession:vi.fn(),checkGameRoom:vi.fn(),getGameRoomPlayer:vi.fn(),addGameRoomPlayer:vi.fn(),getTotalRoomPlayers:vi.fn(),getTotalRoomParticipants:vi.fn(),updateGameRoom:vi.fn(),getGameRoomPlayersWithRank:vi.fn()}));
vi.mock('@/services/v1/games',()=>games);
vi.mock('@/services/helper',()=>({composeGameAnswer:({params}:any)=>params,getGameType:vi.fn(),getGameCatType:vi.fn()}));
import gameSocketIo from '@/socketIo/gameSocketIo';
import {GameEventEnum,GameActionEnum} from '@/types';
let handlers:Record<string,Function>,socket:any;
beforeEach(()=>{
 vi.clearAllMocks(); handlers={};
 socket={id:'socket',connected:true,join:vi.fn(),leave:vi.fn(),once:vi.fn(),off:vi.fn(),data:{user:{id:'user',name:'User'}},on:(event:string,fn:Function)=>{handlers[event]=fn;},emit:vi.fn()};
 const io={emit:vi.fn(),use:vi.fn(),on:(_event:string,fn:Function)=>fn(socket)};
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
it.each([null, {id:'old-question',roundId:'old-round'}])('rejects a missing or replaced question without a fatal room error',async question=>{
 games.retrieveGameRoomQuestion.mockResolvedValue(question);
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'question',roundId:'server-round',answer:'late answer'});
 expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_ACTION_REJECTED,'This question is no longer active');
 expect(socket.emit).not.toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,expect.anything());
 expect(games.deductGameCoins).not.toHaveBeenCalled();expect(socket.leave).not.toHaveBeenCalled();
});
it.each(['Round closed','Answers closed'])('keeps refunded %s answers nonfatal and accepts the next round',async message=>{
 games.deductGameCoins.mockResolvedValueOnce({isError:true,recoverable:true,message,data:{amount:10,bonus:2}});
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'question',roundId:'server-round',answer:'late answer'});
 expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_PLAYER_WALLET_UPDATE,{amount:10,bonus:2});
 expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_ACTION_REJECTED,message);
 expect(socket.emit).not.toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,expect.anything());
 games.retrieveGameRoomQuestion.mockResolvedValue({id:'next-question',roundId:'next-round'});
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'next-question',roundId:'next-round',answer:'new answer'});
 expect(games.deductGameCoins).toHaveBeenCalledTimes(2);expect(games.updatePlayerSession).toHaveBeenCalledOnce();
 expect(socket.leave).not.toHaveBeenCalled();
});
it('keeps genuine wallet errors on the existing fatal event',async()=>{
 games.deductGameCoins.mockResolvedValue({isError:true,message:'Insufficient balance',data:null});
 await handlers[GameEventEnum.GAME_ROOM_ANSWER]({qId:'question',roundId:'server-round',answer:'answer'});
 expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,'Insufficient balance');
 expect(socket.emit).not.toHaveBeenCalledWith(GameEventEnum.GAME_ACTION_REJECTED,expect.anything());
});

it.each(['room',null,{}, {roomId:'room'}, {roomId:'room',mode:'unknown'}])('rejects malformed join payloads without room mutation or unhandled rejection: %j',async args=>{
 const ack=vi.fn();await handlers[GameEventEnum.PLAYER_JOINED](args,ack);
 expect(ack).toHaveBeenCalledWith(expect.objectContaining({isError:true,code:'INVALID_JOIN'}));expect(games.checkGameRoom).not.toHaveBeenCalled();expect(games.addGameRoomPlayer).not.toHaveBeenCalled();
});
it('rejects invalid joins without requiring an acknowledgement callback',async()=>{
 await expect(handlers[GameEventEnum.PLAYER_JOINED]('room')).resolves.toBeUndefined();expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,expect.any(String));
});
it('handles room lookup failures through an acknowledgement instead of a rejected socket listener',async()=>{
 games.checkGameRoom.mockRejectedValue(new Error('redis down'));const ack=vi.fn();
 await expect(handlers[GameEventEnum.PLAYER_JOINED]({roomId:'room',mode:'multi'},ack)).resolves.toBeUndefined();expect(ack).toHaveBeenCalledTimes(1);expect(ack).toHaveBeenCalledWith(expect.objectContaining({code:'JOIN_UNAVAILABLE'}));
});
it('normalizes valid modes and owns delayed initialization failures',async()=>{
 vi.useFakeTimers();
 try{
  games.checkGameRoom.mockResolvedValue({catId:'cat',name:'Room',category:{gameId:'game',game:{name:'Trivia'},name:'General',topics:[]}});
  games.getGameRoomPlayer.mockResolvedValue(null);games.addGameRoomPlayer.mockResolvedValue({data:{room:{id:'room'}}});
  games.getTotalRoomPlayers.mockResolvedValue(2);games.getTotalRoomParticipants.mockResolvedValue(2);games.getGameRoomPlayersWithRank.mockRejectedValue(new Error('redis unavailable'));
  socket.broadcast={to:()=>({emit:vi.fn()})};const ack=vi.fn();await handlers[GameEventEnum.PLAYER_JOINED]({roomId:'room',mode:'multi'},ack);
  expect(games.addGameRoomPlayer).toHaveBeenCalledWith(expect.objectContaining({mode:'MULTI'}));expect(ack).toHaveBeenCalledWith({isError:false,message:'User joined room'});
  await vi.advanceTimersByTimeAsync(500);expect(socket.emit).toHaveBeenCalledWith(GameEventEnum.GAME_ERROR_NOTIFY,expect.stringContaining('initialize'));expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
