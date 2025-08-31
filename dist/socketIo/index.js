"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
const games_1 = require("@/services/v1/games");
const _types_1 = require("@/@types");
const utils_1 = require("@/utils");
const helper_1 = require("@/services/helper");
const logger_1 = __importDefault(require("@/logger"));
const socketIo = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: [
                "http://localhost:3000",
                "https://v5wgzfbw-3000.uks1.devtunnels.ms"
            ],
            methods: ["GET", "POST"],
            credentials: true,
        },
    });
    io.use((socket, next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const token = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token;
            if (!token)
                return next(new Error("Unauthenticated user"));
            const user = (0, utils_1.getAuthTokenUser)(token);
            // console.log("Authenticated Socket user ", user)
            if (!user)
                return next(new Error("Error: Unauthenticated user"));
            socket.data.user = Object.assign(Object.assign({}, user), { name: user.username });
            logger_1.default.info(`Socket io Authenticated - ${socket.id}`);
            next();
        }
        catch (error) {
            console.error("Error authenticating socket user: ", error);
            next(new Error("Error: Unauthenticated user"));
        }
    }));
    // Set up socket connection
    io.on("connection", (socket) => {
        logger_1.default.info(`Connected socket io - ${socket.id}`);
        // declare it globally
        socket.data.room = undefined;
        socket.on(_types_1.GameEventEnum.PLAYER_JOINED, (args, ackCallback) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            console.log("Player joined ", args);
            // get room details
            // const roomId = args.roomId
            const shortPlayerId = socket.data.user.id.slice(-10);
            const mode = args.mode.toUpperCase();
            let roomId = args.roomId;
            // let roomId = mode === GameMode.MULTI_PLAYER ? args.roomId : `${args.roomId}:${shortPlayerId}`
            // perform checks 
            // check if the room exists
            const room = yield (0, games_1.checkGameRoom)(args.roomId);
            if (!room) {
                return ackCallback({
                    isError: true,
                    message: "Room does not exist",
                    code: "ER-1",
                });
            }
            // check if the user previously joined any room
            const prevUser = yield (0, games_1.getGameRoomPlayer)(socket.data.user.id);
            console.log("prevUser ", prevUser);
            if (prevUser) {
                socket.leave(prevUser.roomId);
                // io.to(prevUser.socketId).socketsLeave(prevUser.roomId);
            }
            // add player to the room
            const result = yield (0, games_1.addGameRoomPlayer)({
                roomId,
                gameId: room.category.gameId,
                playerId: socket.data.user.id,
                catId: room.catId,
                socketId: socket.id,
                name: socket.data.user.name,
                voteCount: 0,
                mode
            });
            if (!(result === null || result === void 0 ? void 0 : result.data)) {
                return ackCallback({
                    isError: true,
                    message: result === null || result === void 0 ? void 0 : result.message,
                    code: "ER-2",
                });
            }
            // assigned room
            roomId = (_b = (_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.room) === null || _b === void 0 ? void 0 : _b.id;
            // attach room to socket
            socket.data.room = { id: roomId, catId: room.catId, name: room.name, gameId: room.category.gameId, mode };
            // join a socket to a room
            // socket.join(`${roomId}:${mode}`)
            socket.join(roomId);
            // join the player id to a room to receive personal messages
            socket.join(socket.data.user.id);
            // acknowledge
            ackCallback({ isError: false, message: "User joined room" });
            // count players
            const roomArr = roomId.split("_"); //roomId = mode_roomId or mode_roomId_UID
            const parentRoomId = roomArr[0];
            console.log("connection parentRoomId ", parentRoomId);
            const totalPlayers = yield (0, games_1.getTotalRoomPlayers)(roomId);
            const totalParticipants = yield (0, games_1.getTotalRoomParticipants)(parentRoomId);
            console.log("connection totalParticipants ", totalParticipants);
            // update room participants
            io.emit(_types_1.GameEventEnum.GAME_ROOM_PARTICIPANTS, { roomId: parentRoomId, count: totalParticipants });
            // emit room data
            const timeout = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                //  emit player wallet and game energy
                socket.emit(_types_1.GameEventEnum.GAME_PLAYER_DATA, result.data);
                // emit room info
                socket.emit(_types_1.GameEventEnum.GAME_ROOM_INFO, {
                    gameId: room.category.gameId,
                    gameName: room.category.game.name,
                    gameType: (0, helper_1.getGameType)(room.category.game.name),
                    catType: (0, helper_1.getGameCatType)(room.category.name),
                    catName: room.category.name,
                    catId: room.catId,
                    roomId,
                });
                // check if only just the joined player
                if (totalPlayers === 1) {
                    yield (0, games_1.updateGameRoom)({
                        gameId: room.category.gameId,
                        gameName: room.category.game.name,
                        catName: room.category.name,
                        catId: room.catId,
                        topics: room.category.topics.join(","),
                        roomId,
                        mode,
                        status: _types_1.GameStatusEnum.CHAT
                    });
                    (0, games_1.gameChatTime)(roomId, io, true);
                }
                // emitting a welcome message to a new player
                socket.emit(_types_1.GameEventEnum.MESSAGE, (0, utils_1.composeMessage)({
                    playerName: "SWEM",
                    content: `${socket.data.user.name}, You're welcome to ${room.name} game room`,
                }));
                // broadcasting to the room that a player has joined
                //   io.to(roomId).except(socket.id).emit(
                //     GameEventEnum.MESSAGE,
                //     composeMessage({
                //       playerName: "SWEM",
                //       content: `${socket.data.user.name}, has joined!`,
                //     })
                //   );
                // console.log("Connected socket rooms", socket.rooms)
                socket.broadcast.to(roomId).emit(_types_1.GameEventEnum.MESSAGE, (0, utils_1.composeMessage)({
                    playerName: "SWEM",
                    content: `${socket.data.user.name}, has joined!`,
                }));
                //   send in game room players
                const players = yield (0, games_1.getGameRoomPlayersWithRank)(roomId, room.catId, mode);
                io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_PLAYERS, players);
                // total leaderboard players
                const countPlayers = yield (0, games_1.getCountGamePlayers)(room.catId, mode);
                io.to(roomId).emit(_types_1.GameEventEnum.GAME_TOTAL_PLAYERS, countPlayers);
                // broadcasting to the room the total number of participants
                (0, games_1.notifyGameRoomPlayers)({ roomId, totalPlayers, mode, io });
                clearTimeout(timeout);
            }), 500);
        }));
        // listen to emitted messages and forward
        socket.on(_types_1.GameEventEnum.MESSAGE, (arg) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const user = socket.data.user;
                const room = socket.data.room;
                const result = yield (0, games_1.deductGameCoins)({
                    action: _types_1.GameActionEnum.CHAT,
                    playerId: user.id,
                    gameId: room.gameId,
                    roomId: room.id,
                    mode: room.mode,
                    catId: room.catId
                });
                if (result.isError || !result.data) {
                    socket.emit(_types_1.GameEventEnum.GAME_ERROR_NOTIFY, result.message);
                    return;
                }
                // emit to update user wallet
                socket.emit(_types_1.GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
                // save transaction record
                io.in(socket.data.room.id).emit(_types_1.GameEventEnum.MESSAGE, arg);
                // update player session for the category
                (0, games_1.updatePlayerSession)({ playerId: user.id, catId: room.catId, mode: room.mode });
            }
            catch (error) {
                console.log(error === null || error === void 0 ? void 0 : error.message);
            }
        }));
        // listen to emitted answers
        socket.on(_types_1.GameEventEnum.GAME_ROOM_ANSWER, (args) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log("answer args ", args);
                const user = socket.data.user;
                const room = socket.data.room;
                const isEntries = args.catType === _types_1.GameCatType.WORDMAKER;
                const result = yield (0, games_1.deductGameCoins)({
                    action: isEntries ? _types_1.GameActionEnum.ENTRIES : _types_1.GameActionEnum.ANSWER,
                    playerId: user.id,
                    roomId: room.id,
                    mode: room.mode,
                    gameId: room.gameId,
                    catId: room.catId,
                    qId: args.qId
                });
                if (result.isError || !result.data) {
                    socket.emit(_types_1.GameEventEnum.GAME_ERROR_NOTIFY, result.message);
                    return;
                }
                // emit to update user wallet
                socket.emit(_types_1.GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
                // save transaction record
                const body = (0, helper_1.composeGameAnswer)({ params: args, room, user });
                if (args.gameType === _types_1.GameType.ACRONYM) {
                    const result = yield (0, games_1.insertAcronymGameRoomAnswer)(body);
                    if (result.isError) {
                        socket.emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, result.message);
                        return;
                    }
                }
                else if (args.gameType === _types_1.GameType.MINDMASH && args.catType === _types_1.GameCatType.WORDMAKER) {
                    const result = yield (0, games_1.insertWordMakerGameRoomAnswer)(body);
                    if (result.isError) {
                        socket.emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, result.message);
                        return;
                    }
                }
                else {
                    (0, games_1.saveGameRoomPlayerAnswer)(body);
                }
                // update player session for the category
                (0, games_1.updatePlayerSession)({ playerId: body.playerId, catId: body.catId, mode: room.mode });
            }
            catch (error) {
                console.log(error === null || error === void 0 ? void 0 : error.message);
            }
        }));
        // listen to emitted votes
        socket.on(_types_1.GameEventEnum.GAME_ROOM_VOTE, (args) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const user = socket.data.user;
                const room = socket.data.room;
                const result = yield (0, games_1.deductGameCoins)({
                    action: _types_1.GameActionEnum.VOTE,
                    playerId: user.id,
                    roomId: room.id,
                    mode: room.mode,
                    gameId: room.gameId,
                    catId: room.catId,
                });
                if (result.isError || !result.data) {
                    socket.emit(_types_1.GameEventEnum.GAME_ERROR_NOTIFY, result.message);
                    return;
                }
                // emit to update user wallet
                socket.emit(_types_1.GameEventEnum.GAME_PLAYER_WALLET_UPDATE, result.data);
                // save transaction record
                yield (0, games_1.insertGameRoomVote)(Object.assign(Object.assign({}, args), { playerId: user.id }));
                // update player session for the category
            }
            catch (error) {
                console.log(error === null || error === void 0 ? void 0 : error.message);
            }
        }));
        // listen to game energy events
        socket.on(_types_1.GameEventEnum.GAME_PLAYER_ENERGY, (params) => (0, games_1.updatePlayerGameEnergy)(socket, params));
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
            (0, games_1.disconnectGameRoomPlayer)(socket, io);
        });
        // listen to emitted disconnected event and remove player from game room
        socket.on("disconnected", () => {
            console.log("socket disconnected event fired");
            (0, games_1.disconnectGameRoomPlayer)(socket, io);
        });
    });
};
exports.default = socketIo;
