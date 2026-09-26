import {
  addGameRoomPlayer,
  checkGameRoom,
  deductGameCoins,
  disconnectGameRoomPlayer,
  gameChatTime,
  getCountGamePlayers,
  getGameRoomPlayer,
  getGameRoomPlayersWithRank,
  getTotalRoomParticipants,
  getTotalRoomPlayers,
  insertAcronymGameRoomAnswer,
  insertGameRoomVote,
  insertWordMakerGameRoomAnswer,
  notifyGameRoomPlayers,
  saveGameRoomPlayerAnswer,
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
          socket.emit(GameEventEnum.GAME_PLAYER_DATA, result.data );
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
    // listen to emitted messages and forward
    socket.on(GameEventEnum.MESSAGE, async(arg) => {
        try {
          const user: User = socket.data.user
          const room: SocketGameRoom = socket.data.room
          const result = await deductGameCoins({
            action: GameActionEnum.CHAT, 
            playerId: user.id, 
            gameId: room.gameId,
            roomId: room.id, 
            mode: room.mode,
            catId: room.catId  })
          if(result.isError || !result.data){
            socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, result.message );
            return
          }
           // emit to update user wallet
          socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data );
        // save transaction record
          io.in(socket.data.room.id).emit(GameEventEnum.MESSAGE, arg);
          // update player session for the category
          updatePlayerSession({playerId: user.id, catId: room.catId, mode: room.mode})
        } catch (error: any) {
          console.log(error?.message);
        }
    });

    // listen to emitted answers
    socket.on(GameEventEnum.GAME_ROOM_ANSWER, async(args:GameRoomAnswer) => {
      try {
        console.log("answer args ", args)
        const user:User = socket.data.user 
        const room:SocketGameRoom = socket.data.room
        const isEntries = args.catType === GameCatType.WORDMAKER
        const result = await deductGameCoins({
          action: isEntries ? GameActionEnum.ENTRIES : GameActionEnum.ANSWER, 
          playerId: user.id, 
          roomId: room.id, 
          mode: room.mode,
          gameId: room.gameId,
          catId: room.catId, 
          qId: args.qId  
        })
        if(result.isError || !result.data){
          socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, result.message );
          return
        }
        // emit to update user wallet
        socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data );
        // save transaction record
        const body = composeGameAnswer({params: args, room, user })
        if(args.gameType === GameType.ACRONYM){
          const result = await insertAcronymGameRoomAnswer(body as AcronymGameAnswer)
          if(result.isError){
            socket.emit(GameEventEnum.NOTIFY_MESSAGE, result.message );
            return
          }
        }
        else if(args.gameType === GameType.MINDMASH && args.catType === GameCatType.WORDMAKER){
          const result = await insertWordMakerGameRoomAnswer(body)
          if(result.isError){
            socket.emit(GameEventEnum.NOTIFY_MESSAGE, result.message );
            return
          }
        }
        else{
          saveGameRoomPlayerAnswer(body)
        }
        // update player session for the category
        updatePlayerSession({playerId: body.playerId, catId: body.catId, mode: room.mode})
      } catch (error: any) {
        console.log(error?.message);
      }
       
    });

    // listen to emitted votes
    socket.on(GameEventEnum.GAME_ROOM_VOTE, async(args:{ votedUserId: string; answerId: string, roomId: string}) => {
      try {
        const user:User = socket.data.user 
        const room:SocketGameRoom = socket.data.room
        const result = await deductGameCoins({
          action: GameActionEnum.VOTE, 
          playerId: user.id, 
          roomId: room.id, 
          mode: room.mode,
          gameId: room.gameId,
          catId: room.catId, 
        })
        if(result.isError || !result.data){
          socket.emit(GameEventEnum.GAME_ERROR_NOTIFY, result.message );
          return
        }
        // emit to update user wallet
        socket.emit(GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data );
        // save transaction record
        await insertGameRoomVote({...args, playerId: user.id})
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

