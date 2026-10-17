import {validateAuthSession} from "@/services/v1/auth";
import {registerAuthNamespace} from "@/utils/auth-session-sockets";
import { createHash } from 'crypto';
import { moneyJson, requestKey } from '@/services/walletLedger';
import redisClient from '@/redis';
import {
  addGameRoomPlayer,
  getGamePlayerIdentity,
  refreshGamePresence,
  sweepGamePresence,
  publishGamePresence,
  subscribeGamePresence,
  checkGameRoom,
  deductGameCoins,
  retrieveGameRoomQuestion,
  disconnectGameRoomPlayer,
  gameChatTime,
  getCountGamePlayers,
  getGameRoomPlayer,
  getGameRoomPlayersWithRank,
  getTotalRoomParticipants,
  getTotalRoomPlayers,
  notifyGameRoomPlayers,
  updateGameRoom,
  updatePlayerGameEnergy,
  updatePlayerSession,
} from "@/services/v1/games";
import { AcronymGameAnswer, GameActionEnum, GameEventEnum, GameStatusEnum, GameType, PlayerGameEnergy, SocketGameRoom, GameRoomAnswer, User, GameCatType } from "@/types";
import { composeMessage, getAuthTokenUser } from "@/utils";
import { composeGameAnswer, getGameCatType, getGameType } from "@/services/helper";
import logger from "@/logger";
import { GameMode } from "@prisma/client";
import { DefaultEventsMap, Server } from "socket.io";


const gameSocketIo = (_io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const io = _io.of("/games");
  registerAuthNamespace(io);
  if (_io.httpServer) {
    let closeSubscription: (() => Promise<void>) | undefined;
    let closed = false;
    _io.httpServer.once('listening',async () => {
      try {
        closeSubscription = await subscribeGamePresence(io);
        if (closed) await closeSubscription();
      } catch(error) { logger.error({event:'game_presence_subscription_failed',error:error instanceof Error?error.message:'Unknown failure'}); }
    });
    _io.httpServer.once('close',async () => {
      closed = true;
      try { await closeSubscription?.(); }
      catch(error) { logger.error({event:'game_presence_subscription_close_failed',error:error instanceof Error?error.message:'Unknown failure'}); }
    });
  }

  // One sweeper per API process, rather than one Redis sweep per player.
  if (io.sockets) {
    let sweeping = false;
    const sweepTimer = setInterval(async () => {
      if (sweeping) return;
      sweeping = true;
      try { await sweepGamePresence(io); }
      catch (error) { logger.error({event:'game_presence_sweep_failed',error:error instanceof Error?error.message:'Unknown failure'}); }
      finally { sweeping = false; }
    },5000);
    sweepTimer.unref();
    _io.httpServer?.once('close',() => clearInterval(sweepTimer));
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error("Game Unauthenticated user"));
      const user = getAuthTokenUser(token)
      // console.log("Authenticated Socket user ", user)
      if(!user) return next(new Error("Game Error: Unauthenticated user"));
      if (!await validateAuthSession(user)) return next(new Error("Session revoked or expired"));
      const identity = await getGamePlayerIdentity(user.id);
      socket.data.user = {...user, name: user.username, avatar: identity.avatar};
      logger.info(`Game Socket io Authenticated - ${socket.id}`)
      next();
    } catch (error) {
      console.error("Game Error authenticating socket user: ", error);
      next(new Error("Game Error: Unauthenticated user"));
    }
  });
  // Set up socket connection
  io.on("connection", (socket) => {
    logger.info(`Connected games namespace - ${socket.id}`)
    // declare it globally
    socket.data.room = undefined;
    const loseSession = async () => {
      socket.data.cancelGameInitialization?.();
      await disconnectGameRoomPlayer(socket,io);
      socket.emit(GameEventEnum.GAME_ERROR_NOTIFY,'Your account joined a game in another tab or device.');
    };
    // Redis ownership also fences sockets on other API replicas (no local-only lock).
    socket.use?.(async ([event],next) => {
      if (event === GameEventEnum.PLAYER_JOINED || event === 'disconnected' || !socket.data.room) return next();
      try {
        if (await refreshGamePresence(socket.data.user.id,socket.id,socket.data.room.id)) return next();
        await loseSession();
        next(new Error('Game session replaced'));
      } catch (error) { next(error instanceof Error ? error : new Error('Game presence unavailable')); }
    });
    let refreshing = false;
    const presenceTimer = setInterval(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        if (socket.data.room && !await refreshGamePresence(socket.data.user.id,socket.id,socket.data.room.id)) await loseSession();

      } catch (error) { logger.error({event:'game_presence_refresh_failed',error:error instanceof Error?error.message:'Unknown failure'}); }
      finally { refreshing = false; }
    },5000);
    presenceTimer.unref();

    socket.on(
      GameEventEnum.PLAYER_JOINED,
      async (
        args: { roomId: string, mode: string },
        ackCallback: (args: {
          isError: boolean;
          message: string;
          code?: string;
        }) => void
      ) => {
        const intent = (socket.data.gameJoinIntent ?? 0) + 1;
        socket.data.gameJoinIntent = intent;
        socket.data.pendingGameRoom = args?.roomId;
        const earlier = socket.data.gameJoinQueue ?? Promise.resolve();
        let release!: () => void;
        socket.data.gameJoinQueue = new Promise<void>(resolve => { release = resolve; });
        await earlier;
        let acknowledged = false;
        const respond = (payload: {isError: boolean; message: string; code?: string}) => {
          if (acknowledged) return;
          acknowledged = true;
          if (typeof ackCallback === 'function') ackCallback(payload);
          else if (payload.isError) socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, payload.message);
        };
        try {
        if (!args || typeof args !== 'object' || typeof args.roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(args.roomId) || typeof args.mode !== 'string' || !['SINGLE','MULTI'].includes(args.mode.toUpperCase())) {
          respond({isError: true, message: 'Provide a valid room and game mode. Please reopen the game room.', code: 'INVALID_JOIN'});
          return;
        }
        // get room details
        // const roomId = args.roomId
        const shortPlayerId = socket.data.user.id.slice(-10)
        const mode = args.mode.toUpperCase() as GameMode
        let roomId = args.roomId
        // let roomId = mode === GameMode.MULTI_PLAYER ? args.roomId : `${args.roomId}:${shortPlayerId}`
        // perform checks
        // check if the room exists
        const room = await checkGameRoom(args.roomId);
        if (!room) {
          return respond({
            isError: true,
            message: "Room does not exist",
            code: "ER-1",
          });
        }
        if (!socket.connected || intent !== socket.data.gameJoinIntent) return respond({isError:true,message:"Game join cancelled",code:"JOIN_CANCELLED"});
        socket.data.cancelGameInitialization?.();
        // add player to the room
        const result = await addGameRoomPlayer({
          roomId,
          gameId: room.category.gameId,
          playerId: socket.data.user.id,
          catId: room.catId,
          socketId: socket.id,
          name: socket.data.user.name,
          avatar: socket.data.user.avatar ?? "",
          voteCount: 0,
          mode
        });
        if (!result?.data) {
          return respond({
            isError: true,
            message: result?.message,
            code: "ER-2",
          });
        }
        const previousRoom = socket.data.room?.id;
        socket.data.room = {id:result.data.room.id,catId:room.catId,name:room.name,gameId:room.category.gameId,mode};
        if (previousRoom && previousRoom !== result.data.room.id) await socket.leave(previousRoom);
        if (!socket.connected || intent !== socket.data.gameJoinIntent) {
          await disconnectGameRoomPlayer(socket,io);
          return respond({isError:true,message:'Game join cancelled',code:'JOIN_CANCELLED'});
        }
        const previous = result.data.previous;
        if (previous) {
          await socket.leave(previous.roomId);
          const previousSocket = io.sockets?.get(previous.socketId);
          if (previousSocket && previousSocket.id !== socket.id) {
            previousSocket.data.cancelGameInitialization?.();
            previousSocket.data.room = undefined;
            previousSocket.data.gameType = undefined;
            previousSocket.data.catType = undefined;
            await previousSocket.leave(previous.roomId);
            await previousSocket.leave(socket.data.user.id);
            previousSocket.emit(GameEventEnum.GAME_ERROR_NOTIFY,'Your account joined a game in another tab or device.');
          }
          await publishGamePresence(previous,io);
        }
        // assigned room
        roomId = result?.data?.room?.id
        // attach room to socket
        socket.data.room = { id: roomId, catId: room.catId, name: room.name, gameId: room.category.gameId, mode }
        socket.data.gameType = getGameType(room.category.game.name);
        socket.data.catType = getGameCatType(room.category.name);
        // join a socket to a room
        // socket.join(`${roomId}:${mode}`)
        await socket.join(roomId);
        // join the player id to a room to receive personal messages
        await socket.join(socket.data.user.id);
        if (!socket.connected) { await disconnectGameRoomPlayer(socket,io); return; }
        // acknowledge
        respond({ isError: false, message: "User joined room" });
        // count players
        const roomArr = roomId.split("_"); //roomId = mode_roomId or mode_roomId_UID
        const parentRoomId = roomArr[0]
        console.log("connection parentRoomId ", parentRoomId)
        const totalPlayers = await getTotalRoomPlayers(roomId)
        const totalParticipants = await getTotalRoomParticipants(parentRoomId)
        console.log("connection totalParticipants ", totalParticipants)
        // update room participants
        io.emit(GameEventEnum.GAME_ROOM_PARTICIPANTS, { roomId: parentRoomId, count: totalParticipants });
        // emit room data
        const cancelInitialization = () => { clearTimeout(timeout); socket.off('disconnect',cancelInitialization); };
        const timeout = setTimeout(async () => {
          socket.off('disconnect', cancelInitialization);
          if (!socket.connected || socket.data.room?.id !== roomId) return;
          try {
          if (!await refreshGamePresence(socket.data.user.id,socket.id,roomId)) return;
          //  emit player wallet and game energy
          socket.emit(GameEventEnum.GAME_PLAYER_DATA, moneyJson(result.data) );
          // emit room info
          socket.emit(GameEventEnum.GAME_ROOM_INFO, {
            gameId: room.category.gameId,
            gameName: room.category.game.name,
            gameType: getGameType(room.category.game.name),
            catType: getGameCatType(room.category.name),
            catName: room.category.name,
            catId: room.catId,
            roomId,
          })
          // check if only just the joined player
          if (result.data.room.firstPlayer) {
            const started = await updateGameRoom({
              gameId: room.category.gameId,
              gameName: room.category.game.name,
              catName: room.category.name,
              catId: room.catId,
              topics: room.category.topics.join(","),
              roomId,
              mode,
              status: GameStatusEnum.CHAT, generation: result.data.room.generation },true);
            if (started) await gameChatTime(roomId, io, true);
          }
          // emitting a welcome message to a new player
          socket.emit(
            GameEventEnum.MESSAGE,
            composeMessage({
              playerName: "SWEN",
              content: `${socket.data.user.name}, You're welcome to ${room.name} game room`,
            })
          );
          // broadcasting to the room that a player has joined
        //   io.to(roomId).except(socket.id).emit(
        //     GameEventEnum.MESSAGE,
        //     composeMessage({
        //       playerName: "SWEN",
        //       content: `${socket.data.user.name}, has joined!`,
        //     })
        //   );
        // console.log("Connected socket rooms", socket.rooms)

          socket.broadcast.to(roomId).emit(
            GameEventEnum.MESSAGE,
            composeMessage({
              playerName: "SWEN",
              content: `${socket.data.user.name}, has joined!`,
            })
          );
        //   send in game room players
        const players = await getGameRoomPlayersWithRank(roomId, room.catId, mode)
        io.to(roomId).emit(GameEventEnum.GAME_ROOM_PLAYERS, players );
        // total leaderboard players
        const countPlayers = await getCountGamePlayers(room.catId, mode)
        io.to(roomId).emit(GameEventEnum.GAME_TOTAL_PLAYERS, countPlayers)
          // broadcasting to the room the total number of participants
          await notifyGameRoomPlayers({roomId, totalPlayers, mode, io} )
          } catch (error) {
            logger.error({event: 'game_join_initialization_failed', roomId, error: error instanceof Error ? error.message : 'Unknown failure'});
            socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, 'Unable to initialize this game room. Please rejoin.');
          }
        }, 500);
        socket.data.cancelGameInitialization = cancelInitialization;
        socket.once('disconnect', cancelInitialization);

        } catch (error) {
          logger.error({event: 'game_join_failed', error: error instanceof Error ? error.message : 'Unknown failure'});
          const alreadyAcknowledged = acknowledged;
          respond({isError: true, message: 'Unable to join this game room. Please retry.', code: 'JOIN_UNAVAILABLE'});
          if (alreadyAcknowledged) socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, 'Unable to join this game room. Please retry.');
        } finally { if (socket.data.gameJoinIntent === intent) socket.data.pendingGameRoom = undefined; release(); }
      }
    );
    // Chat is live-only. Older clients may still request history after rejoining.
    // Keep financial delivery records internal; never replay prior room messages.
    socket.on(GameEventEnum.GAME_ROOM_CHAT, () => {
      socket.emit(GameEventEnum.GAME_ROOM_CHAT, []);
    });
    socket.on(GameEventEnum.MESSAGE, async (arg, ack?: Function) => {
      try {
        const user: User = socket.data.user, room: SocketGameRoom = socket.data.room;
        if (!room || typeof arg?.content !== 'string' || !arg.content.trim() || arg.content.length > 4000) return;
        const key = requestKey(arg.id);
        const payload = {id:key,playerId:user.id,playerName:user.name,content:arg.content.trim(),createdAt:new Date().toISOString()};
        const result = await deductGameCoins({action:GameActionEnum.CHAT,playerId:user.id,gameId:room.gameId,roomId:room.id,mode:room.mode,catId:room.catId,
          operationId:`chat:${key}`}, {kind:'CHAT',roomId:room.id,payload});
        ack?.({isError:result.isError,message:result.message});
        if (result.data) socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE,result.data);
        if (result.isError || !result.data) { socket.emit(GameEventEnum.GAME_ACTION_REJECTED,result.message); return; }
        // The atomic delivery publishes live chat to every replica's room subscriber.
        if ('pending' in result.data && result.data.pending) socket.emit(GameEventEnum.GAME_ACTION_REJECTED,'Message delivery is being checked. Any undelivered charge will be refunded.');
        await updatePlayerSession({playerId:user.id,catId:room.catId,mode:room.mode});
      } catch { socket.emit(GameEventEnum.GAME_ACTION_REJECTED,'Unable to accept this message'); }
    });

    // listen to emitted answers
    socket.on(GameEventEnum.GAME_ROOM_ANSWER, async(args:GameRoomAnswer) => {
      try {
        console.log("answer args ", args)
        const user:User = socket.data.user
        const room:SocketGameRoom = socket.data.room
        if (!room || !socket.data.gameType || typeof args?.answer !== 'string' || !args.answer.trim()) return;
        // Pricing and answer handling come from the joined catalog, never client labels.
        args = { ...args, gameType: socket.data.gameType, catType: socket.data.catType };
        const question = await retrieveGameRoomQuestion(room.id);
        if (!question?.roundId || args.roundId !== question.roundId || String(question.id) !== String(args.qId)) {
          socket.emit(GameEventEnum.GAME_ACTION_REJECTED, 'This question is no longer active');
          return;
        }
        const isSpin = args.catType === GameCatType.LUCKYSPIN && args.spinId !== undefined;
        if (isSpin && (typeof args.spinId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.spinId!))) {
          socket.emit(GameEventEnum.GAME_ACTION_REJECTED, 'Invalid spin request');
          return;
        }
        const operationId = createHash('sha256').update(JSON.stringify(['answer', room.id, question.roundId ?? question.id, isSpin ? args.spinId : args.answer.trim()])).digest('hex');
        const isEntries = args.catType === GameCatType.WORDMAKER
        args = {...args, answer:args.answer.trim(), timer:Math.max(0,Math.ceil(((question.answerUntil ?? Date.now())-Date.now())/1000))};
        const body = composeGameAnswer({params:args,room,user});
        const result = await deductGameCoins({
          action: isEntries ? GameActionEnum.ENTRIES : GameActionEnum.ANSWER,
          playerId: user.id,
          roomId: room.id,
          mode: room.mode,
          gameId: room.gameId,
          catId: room.catId,
          qId: question.id, operationId
        }, {kind:isEntries?'WORDMAKER':args.gameType===GameType.ACRONYM?'ACRONYM':'ANSWER',roomId:room.id,roundId:question.roundId,payload:{...body,isSpin,...(isSpin ? {submittedAt:Date.now()} : {})}})
        if(result.data) socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
        if(result.isError || !result.data){
          socket.emit('recoverable' in result && result.recoverable ? GameEventEnum.GAME_ACTION_REJECTED : GameEventEnum.GAME_ERROR_NOTIFY, result.message );
          return
        }

        // update player session for the category
        await updatePlayerSession({playerId: body.playerId, catId: body.catId, mode: room.mode})
      } catch (error: any) {
        console.log(error?.message);
      }

    });

    // listen to emitted votes
    socket.on(GameEventEnum.GAME_ROOM_VOTE, async(args:{ votedUserId: string; answerId: string, roomId: string; roundId?: string}) => {
      try {
        const user:User = socket.data.user
        const room:SocketGameRoom = socket.data.room
        if (!room || args.roomId !== room.id) return;
        const question = await retrieveGameRoomQuestion(room.id);
        const answer = await redisClient.hGet(`room:${room.id}:answers`, args.votedUserId);
        if (!question?.roundId || args.roundId !== question.roundId || !answer || JSON.parse(answer).answerId !== args.answerId) return;
        const operationId = createHash('sha256').update(JSON.stringify(['vote', room.id, question.roundId ?? question.id, args.answerId])).digest('hex');
        const result = await deductGameCoins({
          operationId,
          action: GameActionEnum.VOTE,
          playerId: user.id,
          roomId: room.id,
          mode: room.mode,
          gameId: room.gameId,
          catId: room.catId,
        }, {kind:'VOTE',roomId:room.id,roundId:question.roundId,payload:{answerId:args.answerId,votedUserId:args.votedUserId}})
        if(result.data) socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
        if(result.isError || !result.data){
          socket.emit('recoverable' in result && result.recoverable ? GameEventEnum.GAME_ACTION_REJECTED : GameEventEnum.GAME_ERROR_NOTIFY, result.message );
          return
        }

        // save transaction record
        // Vote projection and acknowledgement were applied atomically by the delivery script.
        // update player session for the category
      } catch (error: any) {
        console.log(error?.message);
      }

    });

    // listen to game energy events
    socket.on(GameEventEnum.GAME_PLAYER_ENERGY, async (params: PlayerGameEnergy) => {
      if (!socket.data.room || params?.playerId !== socket.data.user.id || params?.catId !== socket.data.room.catId) return;
      await updatePlayerGameEnergy(socket,params);
    })

    socket.on("disconnect", async (reason) => {
      clearInterval(presenceTimer);
      socket.data.cancelGameInitialization?.();
      logger.info({event:'game_socket_disconnected',socketId:socket.id,reason});
      await disconnectGameRoomPlayer(socket,io);
    });
    socket.on("disconnected", async (roomId?: string) => {
      // A delayed unmount from an old page must not leave the new room.
      if (!roomId || roomId === socket.data.pendingGameRoom) socket.data.gameJoinIntent = (socket.data.gameJoinIntent ?? 0) + 1;
      const current = socket.data.room?.id;
      if (!current || (roomId && current !== roomId && !current.startsWith(`${socket.data.room.mode.toLowerCase()}-${roomId}_`) && current !== `${socket.data.room.mode.toLowerCase()}-${roomId}`)) return;
      socket.data.cancelGameInitialization?.();
      await disconnectGameRoomPlayer(socket,io);
    });
  });
};

export default gameSocketIo;
