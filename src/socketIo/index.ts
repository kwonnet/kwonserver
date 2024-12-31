import { Server } from "socket.io";
import {
  addGameRoomPlayer,
  checkGameRoom,
  deductGameCoins,
  disconnectGameRoomPlayer,
  gameChatTime,
  getCountGamePlayers,
  getGameRoomPlayer,
  getGameRoomPlayersWithRank,
  getTotalRoomPlayers,
  getUserData,
  notifyGameRoomPlayers,
  saveGameRoomPlayerAnswer,
  updateGameRoom,
  updateGameRoomParticipants,
  updatePlayerGameEnergy,
  updatePlayerSession,
} from "@/services/games";
import { GameActionEnum, GameEventEnum, GameStatusEnum, PlayerGameEnergy, ThemedGameAnswer, ThemedGameChoice } from "@/types";
import { composeMessage, getAuthUser, jwtVerify } from "@/utils";

const socketIo = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000", 
        "https://kelvins-macbook-pro.tailb614a8.ts.net",
        "https://725xlp02-3000.usw3.devtunnels.ms"
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });


  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error("Unauthenticated user"));
      const user = getAuthUser(token)
      // console.log("Authenticated Socket user ", user)
      if(!user) return next(new Error("Error: Unauthenticated user"));
      socket.data.user = {...user, name: user.username};
      next();
    } catch (e) {
      next(new Error("Error: Unauthenticated user"));
    }
  });
  // Set up socket connection
  io.on("connection", (socket) => {
    // declare it globally
    socket.data.room = undefined;
    console.log("a user connected");
    socket.on(
      GameEventEnum.PLAYER_JOINED,
      async (
        roomId: string,
        ackCallback: (args: {
          isError: boolean;
          message: string;
          code?: string;
        }) => void
      ) => {
        console.log("Player joined ", roomId )
        // perform checks
        // check if the room exists
        const room = await checkGameRoom(roomId);
        if (!room) {
          ackCallback({
            isError: true,
            message: "Room is does not exist",
            code: "ER-1",
          });
          return;
        }
        // check if a user previously joined any room
        const prevUser = await getGameRoomPlayer(socket.data.user.id);
        if (prevUser) {
          io.to(prevUser.socketId).socketsLeave(prevUser.roomId);
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

        });
        if (!result?.data) {
          ackCallback({
            isError: true,
            message: result?.message,
            code: "ER-2",
          });
          return;
        }
        // attach room to socket
        socket.data.room = { id: room.id, catId: room.catId, name: room.name, gameId: room.category.gameId}
        // join a socket to a room
        socket.join(roomId);
        // join the player id to a room to receive personal messages
        socket.join(socket.data.user.id);
        // acknowledge
        ackCallback({ isError: false, message: "User joined room" });
        // update room participants
        const currentPlayers = await updateGameRoomParticipants(roomId)
        io.emit(GameEventEnum.GAME_ROOM_PARTICIPANTS, { roomId, count: currentPlayers });
        // count players
        const totalPlayers = await getTotalRoomPlayers(roomId)
        const timeout = setTimeout(async () => {
          //  emit player wallet and game energy
          socket.emit(GameEventEnum.GAME_PLAYER_DATA, result.data );
          // check if just the joined player
          if (totalPlayers === 1) {
            await updateGameRoom({ roomId, catId: room.catId, status: GameStatusEnum.CHAT });
            gameChatTime(roomId, io, true);
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
          socket.broadcast.to(roomId).emit(
            GameEventEnum.MESSAGE,
            composeMessage({
              playerName: "SWEN",
              content: `${socket.data.user.name}, has joined!`,
            })
          );
        //   send in game room players
        const players = await getGameRoomPlayersWithRank(roomId, room.catId)
        io.to(roomId).emit(GameEventEnum.GAME_ROOM_PLAYERS, players );
        // total leaderboard players
        const countPlayers = await getCountGamePlayers(room.catId)
        io.to(roomId).emit(GameEventEnum.GAME_TOTAL_PLAYERS, countPlayers)
          // broadcasting to the room the total number of participants
          notifyGameRoomPlayers(roomId, totalPlayers, io )
          clearTimeout(timeout)
        }, 500);
        
      }
    );
    // listen to emitted messages and forward
    socket.on(GameEventEnum.MESSAGE, async(arg) => {
        try {
          const user = socket.data.user
          const room = socket.data.room
          const result = await deductGameCoins({
            action: GameActionEnum.CHAT, 
            playerId: user.id, 
            gameId: room.gameId,
            roomId: room.id, 
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
          updatePlayerSession({playerId: user.id, catId: room.catId})
        } catch (error: any) {
          console.log(error?.message);
        }
    });

    // listen to emitted answers
    socket.on(GameEventEnum.GAME_ROOM_ANSWER, async(args:ThemedGameChoice) => {
      try {
        const user = socket.data.user
        const room = socket.data.room
        const result = await deductGameCoins({
          action: GameActionEnum.ANSWER, 
          playerId: user.id, 
          roomId: room.id, 
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
        const body:ThemedGameAnswer = { 
          ...args,
          roomId: room.id, 
          catId: room.catId,
          playerId: user.id,
          name: user.name,
      }
      saveGameRoomPlayerAnswer(body)
      // update player session for the category
      updatePlayerSession({playerId: body.playerId, catId: body.catId})
      } catch (error: any) {
        console.log(error?.message);
      }
       
    });
    // listen to game energy events
    socket.on(GameEventEnum.GAME_PLAYER_ENERGY, (params: PlayerGameEnergy) => updatePlayerGameEnergy(socket,params))

    // listen to disconnecting
    socket.on("disconnecting", (reason) => {
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

export default socketIo;
