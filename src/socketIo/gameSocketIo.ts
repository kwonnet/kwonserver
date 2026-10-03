import { createHash } from 'crypto';
import { moneyJson, requestKey } from '@/services/walletLedger';
import redisClient from '@/redis';
import {
  addGameRoomPlayer,
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
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error("Game Unauthenticated user"));
      const user = getAuthTokenUser(token)
      // console.log("Authenticated Socket user ", user)
      if(!user) return next(new Error("Game Error: Unauthenticated user"));
      socket.data.user = {...user, name: user.username};
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
        console.log("Player joined ", args )
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
          return ackCallback({
            isError: true,
            message: "Room does not exist",
            code: "ER-1",
          });
        }
        // check if the user previously joined any room
        const prevUser = await getGameRoomPlayer(socket.data.user.id);
        console.log("prevUser ", prevUser)
        if (prevUser) {
          socket.leave(prevUser.roomId)
          // io.to(prevUser.socketId).socketsLeave(prevUser.roomId);
        }

        // add player to the room
        const result = await addGameRoomPlayer({
          roomId,
          gameId: room.category.gameId,
          playerId: socket.data.user.id,
          catId: room.catId,
          socketId: socket.id,
          name: socket.data.user.name,
          voteCount: 0,
          mode
        });
        if (!result?.data) {
          return ackCallback({
            isError: true,
            message: result?.message,
            code: "ER-2",
          });
        }
        // assigned room
        roomId = result?.data?.room?.id
        // attach room to socket
        socket.data.room = { id: roomId, catId: room.catId, name: room.name, gameId: room.category.gameId, mode }
        socket.data.gameType = getGameType(room.category.game.name);
        socket.data.catType = getGameCatType(room.category.name);
        // join a socket to a room
        // socket.join(`${roomId}:${mode}`)
        socket.join(roomId);
        // join the player id to a room to receive personal messages
        socket.join(socket.data.user.id);
        // acknowledge
        ackCallback({ isError: false, message: "User joined room" });
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
        const timeout = setTimeout(async () => {
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
          if (totalPlayers === 1) {
            await updateGameRoom({
              gameId: room.category.gameId,
              gameName: room.category.game.name,
              catName: room.category.name,
              catId: room.catId,
              topics: room.category.topics.join(","),
              roomId,
              mode,
              status: GameStatusEnum.CHAT });
            gameChatTime(roomId, io, true);
          }
          // emitting a welcome message to a new player
          socket.emit(
            GameEventEnum.MESSAGE,
            composeMessage({
              playerName: "SWEM",
              content: `${socket.data.user.name}, You're welcome to ${room.name} game room`,
            })
          );
          // broadcasting to the room that a player has joined
        //   io.to(roomId).except(socket.id).emit(
        //     GameEventEnum.MESSAGE,
        //     composeMessage({
        //       playerName: "SWEM",
        //       content: `${socket.data.user.name}, has joined!`,
        //     })
        //   );
        // console.log("Connected socket rooms", socket.rooms)

          socket.broadcast.to(roomId).emit(
            GameEventEnum.MESSAGE,
            composeMessage({
              playerName: "SWEM",
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
          notifyGameRoomPlayers({roomId, totalPlayers, mode, io} )
          clearTimeout(timeout)
        }, 500);

      }
    );
    // Paid messages are stored durably and replayed from Redis; IDs deduplicate retries.
    socket.on(GameEventEnum.GAME_ROOM_CHAT, async () => {
      const room: SocketGameRoom = socket.data.room;
      if (!room) return;
      try {
        const messages = await redisClient.lRange(`room:${room.id}:paid-messages`, -100, -1);
        socket.emit(GameEventEnum.GAME_ROOM_CHAT, messages.map(message => JSON.parse(message)));
      } catch { /* A later poll recovers delivery. */ }
    });
    socket.on(GameEventEnum.MESSAGE, async (arg, ack?: Function) => {
      try {
        const user: User = socket.data.user, room: SocketGameRoom = socket.data.room;
        if (!room || typeof arg?.content !== 'string' || !arg.content.trim() || arg.content.length > 4000) return;
        const key = requestKey(arg.id);
        const payload = {id:key,playerId:user.id,playerName:user.name,content:arg.content.trim(),createdAt:new Date().toISOString()};
        const result = await deductGameCoins({action:GameActionEnum.CHAT,playerId:user.id,gameId:room.gameId,roomId:room.id,mode:room.mode,catId:room.catId,
          operationId:`chat:${key}`,content:payload.content}, {kind:'CHAT',roomId:room.id,payload});
        ack?.({isError:result.isError,message:result.message});
        if (result.data) socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE,result.data);
        if (result.isError || !result.data) { socket.emit(GameEventEnum.GAME_ERROR_NOTIFY,result.message); return; }
        // Clients poll the durable history too, covering a crash before this broadcast.
        if (!('pending' in result.data)) io.in(room.id).emit(GameEventEnum.MESSAGE,payload);
        void updatePlayerSession({playerId:user.id,catId:room.catId,mode:room.mode});
      } catch { socket.emit(GameEventEnum.GAME_ERROR_NOTIFY,'Unable to accept this message'); }
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
          socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, 'This question is no longer active');
          return;
        }
        const operationId = createHash('sha256').update(JSON.stringify(['answer', room.id, question.roundId ?? question.id, args.answer.trim()])).digest('hex');
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
        }, {kind:isEntries?'WORDMAKER':args.gameType===GameType.ACRONYM?'ACRONYM':'ANSWER',roomId:room.id,roundId:question.roundId,payload:body})
        if(result.data) socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
        if(result.isError || !result.data){
          socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, result.message );
          return
        }

        // update player session for the category
        updatePlayerSession({playerId: body.playerId, catId: body.catId, mode: room.mode})
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
          socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, result.message );
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
    socket.on(GameEventEnum.GAME_PLAYER_ENERGY, (params: PlayerGameEnergy) => updatePlayerGameEnergy(socket,params))

    // listen to disconnecting
    socket.on("disconnecting", (_reason) => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          //   socket.to(room).emit("user has left", socket.data.user.id);
          socket.leave(room);
        }
      }
    });
    // listen to socket disconnect event and remove player from game room
    socket.on("disconnect", () => {
      console.log("socket disconnect event fired");
      disconnectGameRoomPlayer(socket, io)
    });
    // listen to emitted disconnected event and remove player from game room
    socket.on("disconnected", () => {
      console.log("socket disconnected event fired");
      disconnectGameRoomPlayer(socket, io)
    });
  });
};

export default gameSocketIo;

