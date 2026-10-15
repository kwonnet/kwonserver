import {beforeEach,afterAll,expect,it,vi} from 'vitest';
vi.mock('@/services/helper',()=>({}));
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/utils/ai',()=>({generateRoomQuestion:vi.fn(),shuffleArray:vi.fn()}));
import redis from '@/redis';
import {claimGamePresence,refreshGamePresence,removeGameRoomPlayer,sweepGamePresence,subscribeGamePresence,getGameRoomPlayersWithRank,updateGameRoom,isGameRoomExists,getGameRoomPlayer,getTotalRoomParticipants} from '@/services/v1/games';
import {GameMode} from '@prisma/client';
const join=(playerId='presence-user',socketId='socket-1',roomId='presence-room',mode:GameMode=GameMode.MULTI)=>claimGamePresence({playerId,socketId,roomId,mode,catId:'presence-cat',gameId:'presence-game',name:playerId,voteCount:0});
beforeEach(async()=>{await redis.flushDb();});
afterAll(async()=>{await redis.flushDb();});
it('stores the actual solo partition and removes it exactly once without touching wallet/ranking data',async()=>{
 const result=await join('presence-user','socket-1','presence-room',GameMode.SINGLE);
 expect(result.firstPlayer).toBe(true);expect((await getGameRoomPlayer('presence-user'))?.roomId).toBe(result.roomId);
 await redis.set('wallet:presence-user','preserved');await redis.zAdd('ranking:presence-cat',{score:8,value:'presence-user'});
 for(const suffix of ['',':question',':answers',':u-answers',':votes',':streak',':question-history',':paid-messages'])await redis.set(`room:${result.roomId}${suffix}`,'temporary');
 await redis.del(`room:${result.roomId}:answers`);
 await redis.hSet(`room:${result.roomId}:answers`,{'presence-user':'{"answer":"test"}'});
 await redis.hSet(`room:${result.roomId}:player:presence-user:guesses`,{test:'temporary'});
 expect(await removeGameRoomPlayer(result.roomId,'presence-user',GameMode.SINGLE,'socket-1')).not.toBeNull();
 expect(await removeGameRoomPlayer(result.roomId,'presence-user',GameMode.SINGLE,'socket-1')).toBeNull();
 expect(await getGameRoomPlayer('presence-user')).toBeNull();expect(await getTotalRoomParticipants(result.roomId)).toBe(0);
 expect(await redis.keys(`room:${result.roomId}*`)).toEqual([]);
 expect(await redis.get('wallet:presence-user')).toBe('preserved');expect(await redis.zScore('ranking:presence-cat','presence-user')).toBe(8);
});
it('repeated joins and same-room takeovers keep counts and running rounds unchanged',async()=>{
 const first=await join();await redis.hSet(`room:${first.roomId}`,{status:'PLAY'});
 const duplicate=await join();expect(duplicate.firstPlayer).toBe(false);
 const replacement=await join('presence-user','socket-2');expect(replacement.firstPlayer).toBe(false);
 expect(await redis.hGet(`room:${first.roomId}`,'status')).toBe('PLAY');
 expect(await getTotalRoomParticipants(first.roomId)).toBe(1);expect(await redis.sCard(`room:${first.roomId}:players`)).toBe(1);
 expect(await removeGameRoomPlayer(first.roomId,'presence-user',GameMode.MULTI,'socket-1')).toBeNull();
 expect(await refreshGamePresence('presence-user','socket-1',first.roomId)).toBe(false);
 expect(await refreshGamePresence('presence-user','socket-2',first.roomId)).toBe(true);
});
it('concurrent joins leave exactly one account membership and stale disconnects cannot remove the winner',async()=>{
 const joins=await Promise.all(Array.from({length:30},(_,i)=>join('presence-user',`socket-${i}`,`presence-room-${i}`)));
 const owner=(await getGameRoomPlayer('presence-user'))!;
 const memberships=await Promise.all(joins.map(row=>redis.sIsMember(`room:${row.roomId}:players`,'presence-user')));
 expect(memberships.filter(Boolean)).toHaveLength(1);
 for(let i=0;i<30;i++)if(`socket-${i}`!==owner.socketId)expect(await removeGameRoomPlayer(joins[i].roomId,'presence-user',GameMode.MULTI,`socket-${i}`)).toBeNull();
 expect((await getGameRoomPlayer('presence-user'))?.socketId).toBe(owner.socketId);
 expect(await getTotalRoomParticipants(owner.roomId)).toBe(1);
});
it('allocates bounded partitions atomically and switching rooms leaves remaining players intact',async()=>{
 const joins=await Promise.all(Array.from({length:45},(_,i)=>join(`presence-user-${i}`,`socket-${i}`)));
 const rooms=[...new Set(joins.map(row=>row.roomId))];expect(rooms).toHaveLength(3);
 for(const room of rooms)expect(await redis.sCard(`room:${room}:players`)).toBeLessThanOrEqual(20);
 expect(await getTotalRoomParticipants(joins[0].roomId)).toBe(45);
 await join('presence-user-0','new-socket','presence-other',GameMode.SINGLE);
 expect(await getTotalRoomParticipants(joins[0].roomId)).toBe(44);
 expect(await redis.sIsMember(`room:${joins[0].roomId}:players`,'presence-user-0')).toBe(0);
 expect(await redis.sCard(`room:${joins[0].roomId}:players`)).toBeGreaterThan(0);
});
it('expires abandoned sessions, publishes corrected rosters and never removes a refreshed replacement',async()=>{
 const first=await join();await redis.zAdd('game:presence:leases',{score:0,value:'presence-user'});
 const emit=vi.fn();const io:any={emit,to:()=>({emit})};await sweepGamePresence(io);
 expect(await getGameRoomPlayer('presence-user')).toBeNull();expect(await redis.sCard(`room:${first.roomId}:players`)).toBe(0);
 expect(emit).toHaveBeenCalledWith('game_room_players',[]);
 await join();await redis.zAdd('game:presence:leases',{score:0,value:'presence-user'});
 await join('presence-user','replacement');await sweepGamePresence(io);
 expect((await getGameRoomPlayer('presence-user'))?.socketId).toBe('replacement');
});

it('fences old timers after an emptied room is recreated',async()=>{
 const first=await join();
 await removeGameRoomPlayer(first.roomId,'presence-user',GameMode.MULTI,'socket-1');
 const second=await join('presence-other','socket-2');
 expect(second.roomId).toBe(first.roomId);expect(second.generation).not.toBe(first.generation);
 expect(await isGameRoomExists(first.roomId,first.generation)).toBe(false);
 await updateGameRoom({roomId:first.roomId,generation:first.generation,status:'PLAY',mode:'MULTI',catId:'presence-cat',catName:'General',gameId:'presence-game',gameName:'Trivia',topics:''} as any);
 expect(await redis.hGet(`room:${second.roomId}`,'status')).toBeNull();
});

it('refreshes local room rosters when another API replica publishes a presence change',async()=>{
 const emit=vi.fn();const io:any={emit,to:()=>({emit}),adapter:{rooms:new Map()},sockets:new Map()};
 const close=await subscribeGamePresence(io);
 try {
  await redis.publish('game:presence:changed',JSON.stringify({origin:'another-api-replica',player:{roomId:'multi-presence-room',catId:'presence-cat',mode:'MULTI'}}));
  for(let i=0;i<50&&!emit.mock.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(emit).toHaveBeenCalledWith('game_room_players',[]);
 } finally {await close();}
});

it('repairs stale legacy roster entries without deleting the account current room',async()=>{
 const active=await join('presence-user','current-socket','presence-current');
 await redis.sAdd('room:multi-presence-old:players','presence-user');
 await redis.set('room:multi-presence-old:participants','1');
 expect(await getGameRoomPlayersWithRank('multi-presence-old','presence-cat',GameMode.MULTI)).toEqual([]);
 expect((await getGameRoomPlayer('presence-user'))?.socketId).toBe('current-socket');
 expect(await redis.sCard(`room:${active.roomId}:players`)).toBe(1);
 expect(await getTotalRoomParticipants('multi-presence-old')).toBe(0);
});
it('initializes a room once even when several players arrive before the delayed startup',async()=>{
 const first=await join('presence-first','socket-1');const second=await join('presence-second','socket-2');
 const params={roomId:first.roomId,generation:first.generation,status:'CHAT',mode:'MULTI',catId:'presence-cat',catName:'General',gameId:'presence-game',gameName:'Trivia',topics:''} as any;
 expect(await Promise.all([updateGameRoom(params,true),updateGameRoom({...params,generation:second.generation},true)])).toEqual([true,false]);
});
