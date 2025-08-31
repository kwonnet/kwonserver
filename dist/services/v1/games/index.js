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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDummyUsers = exports.getUserGameRankingArchiveData = exports.getUserGamesRankingArchiveStats = exports.getGamesRankingArchiveData = exports.getGamesRankingArchiveStats = exports.getGameCategoriesRankings = exports.getGameWinners = exports.getGameWinnersStats = exports.getGamePlayerRankings = exports.checkGameRoom = exports.getGameCategoryRoom = exports.getGameCategoryRooms = exports.getGameCategories = exports.createGameCategoryRoom = exports.createGameCategory = exports.getGames = exports.createGame = exports.gameChatTime = exports.gamePlayTime = exports.getGameResult = exports.checkGameNumPlayers = exports.notifyGameRoomPlayers = exports.updateGameRoom = exports.isGameRoomExists = exports.updatePlayersGameEnergy = exports.updatePlayerGameEnergy = exports.updateGamePlayersScores = exports.getGameRoom = exports.disconnectGameRoomPlayer = exports.getGameRoomPlayer = exports.getGameLeaderboard = exports.getRankingKey = exports.getCountGamePlayers = exports.getGameRoomPlayersWithRank = exports.getTotalRoomPlayers = exports.getTotalRoomParticipants = exports.updatePlayerSession = exports.addGameRoomPlayer = exports.deleteGameRoomQuestionAndAnswers = exports.retrieveGameRoomQuestion = exports.storeGameRoomQuestion = exports.checkUserGameWallet = exports.checkUserGameEnergy = exports.getUserData = exports.getUserWallet = exports.getRedisHashKey = void 0;
exports.deductGameCoins = deductGameCoins;
exports.syncUserRedisWalletToPrisma = syncUserRedisWalletToPrisma;
exports.saveGameRoomPlayerAnswer = saveGameRoomPlayerAnswer;
exports.insertWordMakerGameRoomAnswer = insertWordMakerGameRoomAnswer;
exports.insertAcronymGameRoomAnswer = insertAcronymGameRoomAnswer;
exports.insertGameRoomVote = insertGameRoomVote;
exports.retrieveGameRoomAnswers = retrieveGameRoomAnswers;
exports.calculateGameRoomPoints = calculateGameRoomPoints;
exports.getGameRoomPlayers = getGameRoomPlayers;
exports.removeGameRoomPlayer = removeGameRoomPlayer;
exports.cleanUpGameRoom = cleanUpGameRoom;
exports.createRandomUser = createRandomUser;
const redis_1 = __importDefault(require("@/redis"));
const _types_1 = require("@/@types");
const utils_1 = require("@/utils");
const db_1 = __importDefault(require("@/db"));
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("@/logger"));
const ai_1 = require("@/utils/ai");
const helper_1 = require("../../helper");
const faker_1 = require("@faker-js/faker");
const getRedisHashKey = (key) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield redis_1.default.hGetAll(key);
    if (Object.values(result).length === 0)
        return null;
    return (0, utils_1.parseStringNumbers)(result);
});
exports.getRedisHashKey = getRedisHashKey;
function deductGameCoins(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const actionStat = {
            [_types_1.GameActionEnum.CHAT]: { min: 0.15, max: 0.25 },
            [_types_1.GameActionEnum.VOTE]: { min: 0.25, max: 0.35 },
            [_types_1.GameActionEnum.ANSWER]: { min: 0.35, max: 0.45 },
            [_types_1.GameActionEnum.ENTRIES]: { min: 0.25, max: 0.50 },
        };
        try {
            // Generate a random deduction between 0.5 and 0.8
            const highDeduction = (0, utils_1.getRandomNumber)(0.5, 0.9);
            // Determine if bonus can handle the high deduction
            const rate = actionStat[params.action];
            const deduction = highDeduction; // Assume high deduction is attempted
            const defaultDeduction = (0, utils_1.getRandomNumber)(rate.min, rate.max); // Fallback to default range
            const useKeys = (0, utils_1.getUserRedisKeys)(params.playerId);
            // Fetch player balance from Redis
            const wallet = yield (0, exports.getRedisHashKey)(useKeys.wallet);
            console.log("deduction wallet: ", wallet);
            if (!wallet) {
                return {
                    message: "Player wallet not found in Redis",
                    isError: true,
                };
            }
            console.log(deduction, "deduction");
            console.log(wallet, "Player wallet");
            let { amount, bonus } = wallet;
            const balance = parseFloat((bonus + amount).toFixed(2));
            console.log("coin balance", balance);
            // Check if deduction exceeds balance
            if (deduction > balance) {
                throw new Error("Insufficient balance, please buy new coins to continue playing!");
            }
            // Determine final deduction amount
            const finalDeduction = bonus >= highDeduction ? highDeduction : defaultDeduction;
            let remainingDeduction = finalDeduction;
            let deductedBonus = 0;
            let deductedCoins = 0;
            // Deduct from bonus first
            if (bonus > 0) {
                const bonusDeduction = Math.min(bonus, remainingDeduction);
                deductedBonus = bonusDeduction;
                bonus -= bonusDeduction;
                remainingDeduction -= bonusDeduction;
            }
            // Deduct from amount if bonus is insufficient
            if (remainingDeduction > 0) {
                if (amount < remainingDeduction) {
                    throw new Error("Insufficient balance");
                }
                deductedCoins = remainingDeduction;
                amount -= remainingDeduction;
            }
            // Transaction log
            const timestamp = Date.now();
            const record = {
                userId: params.playerId,
                amount: finalDeduction,
                source: !wallet.bonus
                    ? client_1.TxnSourceEnum.COINS
                    : remainingDeduction > 0
                        ? client_1.TxnSourceEnum.COINS_BONUS
                        : client_1.TxnSourceEnum.BONUS,
                metadata: params,
                createdAt: new Date().toISOString(),
                type: client_1.TxnTypeEnum.DEBIT,
                description: params.action === _types_1.GameActionEnum.CHAT
                    ? "Deducted for in-game chat"
                    : "Deducted for game play",
                category: client_1.TxnCategoryEnum.GAME_DEDUCTION,
                gateway: client_1.TxnGatewayEnum.WALLET,
                senderId: params.playerId,
                currency: client_1.TxnCurrencyEnum.COINS,
                status: client_1.TxnStatusEnum.COMPLETED,
                txnRef: (0, utils_1.generateUniqueRef)(),
                walletId: wallet.id,
            };
            // Update Redis
            yield Promise.all([
                redis_1.default.hSet(useKeys.wallet, "bonus", bonus.toFixed(2)),
                redis_1.default.hSet(useKeys.wallet, "amount", amount.toFixed(2)),
                redis_1.default.zAdd(useKeys.txn, {
                    score: timestamp,
                    value: JSON.stringify(record),
                }),
            ]);
            // update monthly spent - track monthly spent coins
            updateMonthlySpentCoins({
                gameId: params.gameId,
                catId: params.catId,
                mode: params.mode,
                bonus: parseFloat(deductedBonus.toFixed(2)),
                coins: parseFloat(deductedCoins.toFixed(2)),
            });
            return {
                message: "success",
                isError: false,
                data: {
                    amount: parseFloat(amount.toFixed(2)),
                    bonus: parseFloat(bonus.toFixed(2)),
                    deductedBonus: parseFloat(deductedBonus.toFixed(2)),
                    deductedCoins: parseFloat(deductedCoins.toFixed(2)),
                },
            };
        }
        catch (error) {
            return { message: `Error: ${error === null || error === void 0 ? void 0 : error.message} `, isError: true, data: null };
        }
    });
}
const getUserWallet = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield db_1.default.wallet.findUniqueOrThrow({ where: { userId } });
    }
    catch (error) {
        return null;
    }
});
exports.getUserWallet = getUserWallet;
const getUserData = (userId, catId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.user.findUniqueOrThrow({
            where: { id: userId },
            include: { wallet: true, gameEnergies: { where: { catId } } },
        });
        if (!result.wallet || !result.gameEnergies)
            return null;
        return { wallet: result.wallet, energy: result.gameEnergies[0] };
    }
    catch (error) {
        return null;
    }
});
exports.getUserData = getUserData;
const checkUserGameEnergy = (userId, catId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const playerKeys = getPlayerRedisKeys(userId, catId);
        const uKey = `player:${userId}:cat:${catId}:energy`;
        // check redis
        const energy = yield (0, exports.getRedisHashKey)(uKey);
        if (energy) {
            console.log("Join room - player energy - redis ", energy);
            return energy;
        }
        // check prisma
        const result = yield db_1.default.gameEnergy.findFirst({
            where: { playerId: userId, catId },
        });
        if (result) {
            console.log("Join room - player energy - prisma ", result);
            return result;
        }
        // create energy
        const gameEnergy = yield db_1.default.gameEnergy.create({
            data: { amount: 2500, gauge: 50, turbo: 50, playerId: userId, catId },
        });
        console.log("Join room - player energy - created ", gameEnergy);
        return gameEnergy;
    }
    catch (error) {
        return null;
    }
});
exports.checkUserGameEnergy = checkUserGameEnergy;
const checkUserGameWallet = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userKeys = (0, utils_1.getUserRedisKeys)(userId);
        const wallet = yield (0, exports.getRedisHashKey)(userKeys.wallet);
        if (wallet) {
            // check balance
            const balance = wallet.coins + wallet.bonus;
            console.log("Join room - player wallet - redis ", wallet);
            const isError = balance < 10;
            return {
                message: isError
                    ? "Insufficient coins, please buy coins to continue playing!"
                    : "success",
                isError,
                data: isError ? null : wallet,
            };
        }
        // try prisma wallet
        const result2 = yield (0, exports.getUserWallet)(userId);
        if (!result2) {
            return { message: "User wallet not found", isError: true, data: null };
        }
        console.log("Join room - player wallet - prisma ", result2);
        // check balance
        const balance = result2.coins + result2.bonus;
        const isError = balance < 10;
        return {
            message: isError
                ? "Insufficient coins, please buy coins to continue playing!"
                : "success",
            isError,
            data: result2,
        };
    }
    catch (error) {
        return {
            message: "Unknown error occurred, please try again later",
            isError: true,
            data: null,
        };
    }
});
exports.checkUserGameWallet = checkUserGameWallet;
function syncUserRedisGameEnergyToPrisma(playerId, catId, mode) {
    return __awaiter(this, void 0, void 0, function* () {
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(playerId, catId, mode);
        try {
            const result = yield (0, exports.getRedisHashKey)(playerKeys.energy);
            if (!result)
                return;
            // perform prisma update
            console.log("Player Energy ", result);
            yield db_1.default.gameEnergy.update({
                where: { id: result.id },
                data: {
                    amount: result.amount < 0 ? 2200 : result.amount,
                    gauge: result.gauge < 0 ? 10 : result.gauge,
                    turbo: result.turbo < 0 ? 10 : result.turbo,
                },
            });
            console.log("User redis game energy synced to prisma successfully >>>");
        }
        catch (error) {
            logger_1.default.error(`Error syncing player energy to prisma:  ${error === null || error === void 0 ? void 0 : error.message}`);
        }
        finally {
            yield redis_1.default.del(playerKeys.energy);
        }
    });
}
function syncUserRedisWalletToPrisma(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userKeys = (0, utils_1.getUserRedisKeys)(userId);
            const result = yield (0, exports.getRedisHashKey)(userKeys.wallet);
            if (!result)
                return;
            // perform prisma update
            yield db_1.default.wallet.update({
                where: { id: result.id },
                data: {
                    coins: result.coins,
                    bonus: result.bonus,
                    credit: result.credit,
                },
            });
            // check if user session is inactive for more than four minutes and remove this wallet
            const date = yield redis_1.default.get(userKeys.session);
            if (!date)
                return;
            // const isExpired = isDateHourElapsed(date, 1)
            const isExpired = (0, utils_1.isDateMinuteElapsed)(date, 4);
            if (isExpired) {
                yield Promise.all([
                    redis_1.default.del(userKeys.session),
                    redis_1.default.del(userKeys.wallet),
                ]);
            }
            console.log("User redis wallet synced to prisma successfully >>>");
        }
        catch (error) {
            throw error;
        }
    });
}
const storeGameRoomQuestion = (roomId, params) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uniqueKey = `room:${roomId}:question`;
        yield redis_1.default.set(uniqueKey, JSON.stringify(params));
        return params;
    }
    catch (error) {
        return null;
    }
});
exports.storeGameRoomQuestion = storeGameRoomQuestion;
const retrieveGameRoomQuestion = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uniqueKey = `room:${roomId}:question`;
        const result = yield redis_1.default.get(uniqueKey);
        if (!result)
            return null;
        return JSON.parse(result);
    }
    catch (error) {
        return null;
    }
});
exports.retrieveGameRoomQuestion = retrieveGameRoomQuestion;
// Function to save or update a user's answer for a question
function saveGameRoomPlayerAnswer(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const uniqueKey = `room:${params.roomId}:answers`;
        // Save or update the user's answer in the hash
        yield redis_1.default.hSet(uniqueKey, params.playerId, JSON.stringify(params));
        return params;
    });
}
function insertWordMakerGameRoomAnswer(params) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const answersKey = `room:${params.roomId}:answers`;
            const prevRecord = yield redis_1.default.hGet(answersKey, params.playerId);
            // guesses key
            const key = `room:${params.roomId}:player:${params.playerId}:guesses`;
            if (!prevRecord) {
                yield saveGameRoomPlayerAnswer(Object.assign(Object.assign({}, params), { answer: "", answers: [{ timer: params.timer, text: params.answer }] }));
                yield redis_1.default.hSet(key, params.answer, JSON.stringify({ timer: params.timer, text: params.answer }));
            }
            else {
                yield redis_1.default.hSet(key, params.answer, JSON.stringify({ timer: params.timer, text: params.answer }));
            }
            return { isError: false, message: "Guess saved successfully" };
        }
        catch (error) {
            return { isError: true, message: `Error saving answer` };
        }
    });
}
function insertAcronymGameRoomAnswer(params) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const uAnswersKey = `room:${params.roomId}:u-answers`;
            const answersKey = `room:${params.roomId}:answers`;
            // Check if the answer already exists in the room
            const exists = yield redis_1.default.sIsMember(uAnswersKey, params.answer);
            if (exists) {
                return { isError: true, message: "Answer already entered" };
            }
            // remove
            const prevRecord = yield redis_1.default.hGet(answersKey, params.playerId);
            if (prevRecord) {
                console.log("prevRecord ", prevRecord);
                // as AcronymGameAnswer | null
                const record = JSON.parse(prevRecord);
                yield redis_1.default.sRem(answersKey, record.answer);
            }
            // Add the answer to the set to ensure uniqueness
            yield redis_1.default.sAdd(uAnswersKey, params.answer);
            yield saveGameRoomPlayerAnswer(params);
            return { isError: false, message: "Answer saved successfully" };
        }
        catch (error) {
            return { isError: true, message: `Error saving answer` };
        }
    });
}
function insertGameRoomVote(_a) {
    return __awaiter(this, arguments, void 0, function* ({ answerId, roomId, votedUserId, playerId, }) {
        try {
            console.log("Voting function called");
            const answersKey = `room:${roomId}:answers`;
            const voteHashKey = `room:${roomId}:votes`;
            // Check if the player has already voted and remove the vote
            const previousVote = yield redis_1.default.hGet(voteHashKey, playerId);
            if (previousVote) {
                console.log("previousVote ", previousVote);
                // Decrement vote count for the previously voted answer
                const prevAnswer = yield redis_1.default.hGet(answersKey, previousVote);
                if (prevAnswer) {
                    const prevAnswerData = JSON.parse(prevAnswer);
                    prevAnswerData.votes = prevAnswerData.votes.filter((id) => id !== playerId);
                    yield redis_1.default.hSet(answersKey, previousVote, JSON.stringify(prevAnswerData));
                }
            }
            // Update the vote for the new answer
            const newAnswer = yield redis_1.default.hGet(answersKey, votedUserId);
            if (newAnswer) {
                const newAnswerData = JSON.parse(newAnswer);
                if (!newAnswerData.votes.includes(playerId)) {
                    newAnswerData.votes.push(playerId);
                }
                yield redis_1.default.hSet(answersKey, votedUserId, JSON.stringify(newAnswerData));
            }
            // // Update the player's vote in the votes hash
            yield redis_1.default.hSet(voteHashKey, playerId, votedUserId);
            // const
            const currPlayerAnswer = yield redis_1.default.hGet(answersKey, playerId);
            if (currPlayerAnswer) {
                const obj = JSON.parse(currPlayerAnswer);
                yield redis_1.default.hSet(answersKey, playerId, JSON.stringify(Object.assign(Object.assign({}, obj), { voted: true })));
            }
            return { isError: false, message: "Answer voted successfully" };
        }
        catch (error) {
            return { isError: true, message: `Error voting answer` };
        }
    });
}
// Function to retrieve all answers for a question in a game room
function retrieveGameRoomAnswers(roomId, isGuesses) {
    return __awaiter(this, void 0, void 0, function* () {
        const questionKey = `room:${roomId}:answers`;
        // Retrieve all user answers for the question
        const result = yield redis_1.default.hGetAll(questionKey);
        if (Object.keys(result).length === 0) {
            return [];
        }
        const answers = Object.values(result).map((item) => JSON.parse(item));
        if (!isGuesses)
            return answers;
        // retrieve user guesses
        const playersAnswers = answers;
        const userAnswers = yield Promise.all(playersAnswers.map((ans) => __awaiter(this, void 0, void 0, function* () {
            const key = `room:${roomId}:player:${ans.playerId}:guesses`;
            const guesses = yield redis_1.default.hGetAll(key);
            const entries = Object.entries(guesses).map(([_key, value]) => JSON.parse(value));
            console.log("entries: ", entries);
            return Object.assign(Object.assign({}, ans), { answers: entries });
        })));
        return userAnswers;
    });
}
const deleteGameRoomQuestionAndAnswers = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield Promise.all([
            redis_1.default.del(`room:${roomId}:question`),
            redis_1.default.del(`room:${roomId}:answers`),
            redis_1.default.del(`room:${roomId}:u-answers`),
            redis_1.default.del(`room:${roomId}:votes`),
        ]);
        const pattern = `room:${roomId}:player:*`;
        yield clearRedisKeysByPattern(pattern);
    }
    catch (error) { }
});
exports.deleteGameRoomQuestionAndAnswers = deleteGameRoomQuestionAndAnswers;
// Function to retrieve all answers, check correctness, and assign points
function calculateGameRoomPoints(room) {
    return __awaiter(this, void 0, void 0, function* () {
        const question = yield (0, exports.retrieveGameRoomQuestion)(room.roomId);
        if (!question)
            return [];
        const gameType = (0, helper_1.getGameType)(room.gameName);
        const catType = (0, helper_1.getGameCatType)(room.catName);
        if (catType === _types_1.GameCatType.WORDMAKER) {
            const arrAnswers = yield retrieveGameRoomAnswers(room.roomId, true);
            const totalAnswers = arrAnswers.length;
            // delete game question & user answers
            (0, exports.deleteGameRoomQuestionAndAnswers)(room.roomId);
            // calculate score
            return arrAnswers
                .map((item) => {
                var _a;
                const calc = (0, helper_1.calculateWordMakerPlayerScore)(question === null || question === void 0 ? void 0 : question.question, (_a = item.answers) !== null && _a !== void 0 ? _a : []);
                const multiplier = parseFloat((totalAnswers / 10).toFixed(2));
                const finalScore = Math.floor(multiplier < 1 ? 1 * calc.score : calc.score * multiplier);
                return {
                    score: finalScore,
                    qId: item.qId,
                    name: item.name,
                    roomId: item.roomId,
                    catId: item.catId,
                    playerId: item.playerId,
                    answer: calc.answer,
                    timer: item.timer,
                    mode: item.mode
                };
            })
                .sort((a, b) => b.score - a.score);
        }
        const arrAnswers = yield retrieveGameRoomAnswers(room.roomId, true);
        const answers = arrAnswers.sort((a, b) => b.timer - a.timer);
        const totalAnswers = answers.length;
        // delete game question & user answers
        (0, exports.deleteGameRoomQuestionAndAnswers)(room.roomId);
        if (gameType === _types_1.GameType.ACRONYM) {
            const roomAnswers = answers;
            // calculate game score
            return roomAnswers
                .map((item, index) => {
                const score = !item.voted && totalAnswers > 1
                    ? item.votes.length * 10 - 20
                    : item.votes.length * 10;
                return {
                    score: index === 0 ? 10 + score : score,
                    qId: item.qId,
                    name: item.name,
                    roomId: item.roomId,
                    catId: item.catId,
                    playerId: item.playerId,
                    answer: item.answer,
                    timer: item.timer,
                    mode: item.mode
                };
            })
                .sort((a, b) => b.score - a.score);
        }
        const roomAnswers = answers;
        const isLuckySpinFlip = catType === _types_1.GameCatType.LUCKYSPIN || catType === _types_1.GameCatType.LUCKYFLIP;
        return roomAnswers
            .map((item, idx) => {
            const isCorrect = item.answer.toLowerCase() === question.answer.toLowerCase();
            const score = isLuckySpinFlip
                ? parseFloat(item.answer) * totalAnswers
                : isCorrect
                    ? (item === null || item === void 0 ? void 0 : item.timer) * totalAnswers
                    : 0;
            return Object.assign(Object.assign({}, item), { score: idx === 0 && score > 0 ? score + 10 : score });
        })
            .sort((a, b) => b.score - a.score);
    });
}
const addGameRoomPlayer = (params) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const mode = (0, utils_1.getGameMode)(params.mode);
        // const parentRoomId = params.roomId;
        // let roomId = params.roomId;
        let parentRoomId = `${mode}-${params.roomId}`; // MODE-ROOMID
        let roomId = `${mode}-${params.roomId}`; // MODE-ROOMID
        const totalPlayers = yield (0, exports.getTotalRoomPlayers)(roomId);
        if (params.mode === client_1.GameMode.SINGLE) {
            const uID = params.playerId.slice(-10);
            roomId = `${roomId}_${uID}`; // user room partition
        }
        if (totalPlayers >= 20 && params.mode === client_1.GameMode.MULTI) {
            const partitionKey = `room:${parentRoomId}:partitions`;
            // Fetch only partitions with players < MAX_PLAYERS and limit the number of results
            const roomPartitions = yield redis_1.default.zRangeByScore(partitionKey, "1", "19", { LIMIT: { count: 5, offset: 0 } });
            // Parse the result into an array of objects with roomId and players
            const partitions = roomPartitions.reduce((acc, val, idx) => {
                if (idx % 2 === 0)
                    acc.push({ roomId: val, players: parseInt(roomPartitions[idx + 1]) });
                return acc;
            }, []);
            // If no available room, create a new partition
            if (partitions.length === 0) {
                roomId = `${parentRoomId}_${(0, utils_1.generateUniqueRef)(13)}`; //MODE-ROOMID_PARTITIONKEY
                yield redis_1.default.zAdd(partitionKey, { score: 1, value: roomId }); // Add to partitions with 0 players
            }
            else {
                roomId = (0, ai_1.shuffleArray)(partitions)[0].roomId;
                yield redis_1.default.zIncrBy(partitionKey, 1, roomId);
            }
        }
        // current date
        const currDate = new Date().toISOString();
        // get expiration
        const expire = (0, utils_1.getMonthlyExpiration)();
        // get day after week expireAt
        const remainingDays = (0, utils_1.getRemainingDaysInMonth)();
        const expireAt = (0, utils_1.getExpiryAtUTC)(remainingDays < 7 ? remainingDays + 1 : 8);
        const todayExpireAt = (0, utils_1.getExpiryAtUTC)(1);
        // get user keys
        const userKeys = (0, utils_1.getUserRedisKeys)(params.playerId);
        // get ranking keys
        const rankingKeys = (0, utils_1.getRankingKeys)(params.catId, mode);
        // player hash unique keys
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(params.playerId, params.catId, mode);
        // player infor
        const playerInfo = {
            id: params.playerId,
            name: params.name,
            createdAt: currDate,
            lastLoggedIn: currDate,
        };
        // check user wallet balance
        const result = yield (0, exports.checkUserGameWallet)(params.playerId);
        if (!result.data) {
            return { message: result.message, data: null };
        }
        const wallet = result.data;
        // check game energy
        const energy = yield (0, exports.checkUserGameEnergy)(params.playerId, params.catId);
        if (!energy)
            return { message: "Error: User info not found!", data: null };
        // check player key exists in the players hashes
        const exists = yield redis_1.default.exists(playerKeys.info);
        // if not exists, add to player hash and leaderboard
        if (!exists) {
            const score = { score: 0, numPlayed: 0 };
            // add player to sorted set leaderboard and player's details hashes
            yield Promise.all([
                // ranking
                redis_1.default.zAdd(rankingKeys.month, {
                    score: 0,
                    value: params.playerId,
                }),
                redis_1.default.zAdd(rankingKeys.week, {
                    score: 0,
                    value: params.playerId,
                }),
                redis_1.default.zAdd(rankingKeys.today, {
                    score: 0,
                    value: params.playerId,
                }),
                // track user session
                redis_1.default.set(userKeys.session, currDate),
                // player info
                redis_1.default.hSet(playerKeys.info, playerInfo),
                // player tracking data
                redis_1.default.hSet(playerKeys.month, score),
                redis_1.default.hSet(playerKeys.week, score),
                redis_1.default.hSet(playerKeys.today, score),
                // temp room keys
                redis_1.default.hSet(`room:${params.playerId}:player`, Object.assign({}, params)),
                redis_1.default.sAdd(`room:${roomId}:players`, params.playerId),
                // update parent room total participants
                redis_1.default.incr(`room:${parentRoomId}:participants`),
                // expire ranking keys
                redis_1.default.expire(rankingKeys.month, expire),
                redis_1.default.expireAt(rankingKeys.week, expireAt),
                redis_1.default.expireAt(rankingKeys.today, todayExpireAt),
                // expire player keys
                redis_1.default.expire(playerKeys.info, expire),
                redis_1.default.expire(playerKeys.month, expire),
                redis_1.default.expireAt(playerKeys.week, expireAt),
                redis_1.default.expireAt(playerKeys.today, todayExpireAt),
            ]);
        }
        else {
            // update last login date, save player details in the hash & save the player id to the room players set
            yield Promise.all([
                // update user session
                redis_1.default.set(userKeys.session, currDate),
                // update user details on join game
                redis_1.default.hSet(playerKeys.info, "lastLoggedIn", currDate),
                redis_1.default.hSet(playerKeys.info, "name", params.name),
                // update current room data
                redis_1.default.hSet(`room:${params.playerId}:player`, Object.assign({}, params)),
                redis_1.default.sAdd(`room:${roomId}:players`, params.playerId),
                // update parent room total participants
                redis_1.default.incr(`room:${parentRoomId}:participants`),
            ]);
        }
        // check user wallet
        const isWalletExists = yield redis_1.default.exists(userKeys.wallet);
        if (!isWalletExists) {
            redis_1.default.hSet(userKeys.wallet, {
                id: wallet.id,
                amount: wallet.coins,
                credit: wallet.credit,
                bonus: wallet.bonus,
                userId: wallet.userId,
            });
        }
        // check user energy
        const isEnergyExists = yield redis_1.default.exists(playerKeys.energy);
        if (!isEnergyExists) {
            redis_1.default.hSet(playerKeys.energy, {
                id: energy.id,
                amount: energy.amount,
                gauge: energy.gauge,
                turbo: energy.turbo,
                playerId: energy.playerId,
                catId: energy.catId,
            });
        }
        return {
            data: { energy, wallet, room: { id: roomId } },
            message: "success",
        };
    }
    catch (error) {
        logger_1.default.info(error === null || error === void 0 ? void 0 : error.message);
        return { data: null, message: "Error occured, please try again later" };
    }
});
exports.addGameRoomPlayer = addGameRoomPlayer;
// Function to update player game category session
const updatePlayerSession = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const mode = (0, utils_1.getGameMode)(params.mode);
    // current date
    const currDate = new Date().toISOString();
    // player hash unique keys
    const playerKeys = (0, utils_1.getPlayerRedisKeys)(params.playerId, params.catId, mode);
    // update user session on the game category - this is to track their last played date
    redis_1.default.hSet(playerKeys.info, "lastLoggedIn", currDate);
    // update user session
    const userKeys = (0, utils_1.getUserRedisKeys)(params.playerId);
    redis_1.default.set(userKeys.session, currDate);
});
exports.updatePlayerSession = updatePlayerSession;
// get parent room total number of participants
const getTotalRoomParticipants = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    const strArry = roomId.split("_");
    const parentRoomId = strArry[0];
    // const parentRoomId = `${mode}-${roomId}`
    const count = yield redis_1.default.get(`room:${parentRoomId}:participants`);
    return parseInt(count !== null && count !== void 0 ? count : "0", 10);
});
exports.getTotalRoomParticipants = getTotalRoomParticipants;
// Function to get the total number of players in a room
const getTotalRoomPlayers = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    const roomKey = `room:${roomId}:players`;
    return yield redis_1.default.sCard(roomKey);
});
exports.getTotalRoomPlayers = getTotalRoomPlayers;
function getGameRoomPlayers(roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get all player IDs in the room set
            const playerIds = yield redis_1.default.sMembers(`room:${roomId}:players`);
            // Fetch details for each player
            const players = yield Promise.all(playerIds.map((id) => __awaiter(this, void 0, void 0, function* () {
                return yield redis_1.default.hGetAll(`room:${id}:player`);
            })));
            return players;
        }
        catch (error) {
            return [];
        }
    });
}
// Function to get players in a room with their rank and details
const getGameRoomPlayersWithRank = (roomId, catId, mode) => __awaiter(void 0, void 0, void 0, function* () {
    const _mode = (0, utils_1.getGameMode)(mode);
    // get ranking keys and retrieve the over monthly data of the room player
    const rankingKeys = (0, utils_1.getRankingKeys)(catId, _mode);
    // room players key
    const roomPlayersKey = `room:${roomId}:players`;
    // Retrieve the list of player IDs in the room
    const playerIds = yield redis_1.default.sMembers(roomPlayersKey);
    // Fetch details and ranks for each player in the room
    const playersData = yield Promise.all(playerIds.map((playerId) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        // player hash unique keys
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(playerId, catId, _mode);
        // Get player details from hash
        const playerInfo = yield redis_1.default.hGetAll(playerKeys.info);
        const player = playerInfo;
        // Get player's rank from the sorted set leaderboard
        const playerRank = yield redis_1.default.zRevRank(rankingKeys.month, playerId);
        // Get player month data
        const monthStat = yield redis_1.default.hGetAll(playerKeys.month);
        return Object.assign(Object.assign({}, player), { score: (_a = parseInt(monthStat.score)) !== null && _a !== void 0 ? _a : 0, numPlayed: (_b = parseInt(monthStat.numPlayed)) !== null && _b !== void 0 ? _b : 0, rank: playerRank !== null ? playerRank + 1 : 0 });
    })));
    return playersData;
});
exports.getGameRoomPlayersWithRank = getGameRoomPlayersWithRank;
// Function to get leaderboard
const getCountGamePlayers = (catId, mode) => __awaiter(void 0, void 0, void 0, function* () {
    const _mode = (0, utils_1.getGameMode)(mode);
    // get ranking keys
    const rankingKeys = (0, utils_1.getRankingKeys)(catId, _mode);
    const [monthTotalPlayers, weekTotalPlayers, todayTotalPlayers] = yield Promise.all([
        redis_1.default.zCard(rankingKeys.month),
        redis_1.default.zCard(rankingKeys.week),
        redis_1.default.zCard(rankingKeys.today),
    ]);
    return { monthTotalPlayers, weekTotalPlayers, todayTotalPlayers };
});
exports.getCountGamePlayers = getCountGamePlayers;
const getRankingKey = (ranking, catId, mode) => {
    const _mode = (0, utils_1.getGameMode)(mode);
    // get ranking keys
    const rankingKeys = (0, utils_1.getRankingKeys)(catId, _mode);
    if (ranking === "today") {
        return rankingKeys.today;
    }
    if (ranking === "week") {
        return rankingKeys.week;
    }
    return rankingKeys.month;
};
exports.getRankingKey = getRankingKey;
// Function to get leaderboard
const getGameLeaderboard = (_a) => __awaiter(void 0, [_a], void 0, function* ({ page, limit, catId, ranking, mode }) {
    const _mode = (0, utils_1.getGameMode)(mode);
    const rankingKey = (0, exports.getRankingKey)(ranking, catId, mode);
    // Get players from the sorted set leaderboard
    const min = "1000000000000000000";
    const max = "0";
    const offset = (page - 1) * limit;
    const result = yield redis_1.default.zRangeWithScores(rankingKey, min, max, {
        LIMIT: { offset, count: limit },
        BY: "SCORE",
        REV: true,
    });
    // Fetch details and ranks for each player in the room
    const playersData = yield Promise.all(result.map((item) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        // player hash unique keys
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.value, catId, _mode);
        // Get player details from hash
        const playerInfo = yield redis_1.default.hGetAll(playerKeys.info);
        // Get player's rank from the sorted set leaderboard
        const player = playerInfo;
        // Get player stat
        const key = (0, utils_1.getPlayerRankingKey)({ ranking, playerId: item.value, catId, mode: _mode });
        const stat = yield redis_1.default.hGetAll(key);
        // Get player's rank from the sorted set leaderboard
        const playerRank = yield redis_1.default.zRevRank(rankingKey, item.value);
        // to get the rank of each player without zRevRank, we can use
        // const rank = offset + index + 1
        // provided "limit" will remain constant
        return Object.assign(Object.assign({}, player), { score: (_a = parseInt(stat.score)) !== null && _a !== void 0 ? _a : 0, numPlayed: (_b = parseInt(stat.numPlayed)) !== null && _b !== void 0 ? _b : 0, rank: playerRank !== null ? playerRank + 1 : 0 });
    })));
    return playersData;
});
exports.getGameLeaderboard = getGameLeaderboard;
function removeGameRoomPlayer(roomId, playerId, mode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const strArry = roomId.split("_");
            const parentRoomId = strArry[0];
            const partitionKey = `room:${parentRoomId}:partitions`;
            const participantKey = `room:${parentRoomId}:participants`;
            // check if it's a partioned room
            if (roomId.includes("_") && mode === client_1.GameMode.MULTI) {
                // Remove player from the room set & delete player details as no longer needed
                const [partitionCount, participantCount] = yield Promise.all([
                    // update partioned room
                    redis_1.default.zIncrBy(partitionKey, -1, roomId),
                    // update parent room total participants
                    redis_1.default.decr(participantKey),
                    redis_1.default.sRem(`room:${roomId}:players`, playerId),
                    redis_1.default.del(`room:${playerId}:player`),
                ]);
                // Clean up empty partition room
                if (partitionCount <= 0) {
                    yield redis_1.default.zRem(partitionKey, roomId);
                    logger_1.default.info(`Partition Room ${roomId} has been cleaned up.`);
                }
                // Clean up empty participant room
                if (participantCount <= 0) {
                    yield redis_1.default.del(participantKey);
                    logger_1.default.info(`Participants Room ${parentRoomId} has been cleaned up.`);
                }
                return participantCount;
            }
            else {
                // Remove player from the room set & delete player details as no longer needed
                const [participantCount] = yield Promise.all([
                    // update parent room total participants
                    redis_1.default.decr(participantKey),
                    redis_1.default.sRem(`room:${roomId}:players`, playerId),
                    redis_1.default.del(`room:${playerId}:player`),
                ]);
                // Clean up empty participant room
                if (participantCount <= 0) {
                    yield redis_1.default.del(participantKey);
                    logger_1.default.info(`Participants Room ${parentRoomId} has been cleaned up.`);
                }
                return participantCount;
            }
        }
        catch (error) {
            return 0;
        }
    });
}
function cleanUpGameRoom(roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger_1.default.info("cleaning up game room ", roomId);
            const keys = [
                `room:${roomId}`,
                `room:${roomId}:players`,
                `room:${roomId}:answers`,
                `room:${roomId}:u-answers`,
                `room:${roomId}:question`,
                `room:${roomId}:streak`,
            ];
            yield Promise.all(keys.map((key) => redis_1.default.del(key)));
        }
        catch (error) {
            logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        }
    });
}
const getGameRoomPlayer = (playerId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userKey = `room:${playerId}:player`; // Unique key for each user
        const user = yield redis_1.default.hGetAll(userKey);
        if (Object.keys(user).length === 0) {
            return null;
        }
        return user;
    }
    catch (error) {
        return null;
    }
});
exports.getGameRoomPlayer = getGameRoomPlayer;
const disconnectGameRoomPlayer = (socket, io) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.default.info(socket.data.user, "Disconnecting player...", "from room ", socket.data.room);
        const user = socket.data.user;
        const room = socket.data.room;
        if (!room || !user)
            return;
        const mode = (0, utils_1.getGameMode)(room.mode);
        // check if game room player exists
        const player = yield (0, exports.getGameRoomPlayer)(socket.data.user.id);
        if (!player)
            return;
        console.log("Disconnected socket rooms", socket.rooms);
        // remove user from all rooms
        const socketRooms = Array.from(socket.rooms);
        for (let r = 0; r < socketRooms.length; r++) {
            if (r > 0) {
                socket.leave(socketRooms[r]);
            }
        }
        // broadcasting to the room that a player has left
        socket.to(room.id).emit(_types_1.GameEventEnum.MESSAGE, (0, utils_1.composeMessage)({
            playerName: "SWEN",
            content: `${user.name}, has left!`,
        }));
        // remove player from game room
        const totalParticipants = yield removeGameRoomPlayer(room.id, user.id, room.mode);
        const roomStrArr = room === null || room === void 0 ? void 0 : room.id.split("_");
        const parentRoomId = roomStrArr[0];
        console.log("Discon totalParticipants ", totalParticipants, " parentRoomId ", parentRoomId);
        io.emit(_types_1.GameEventEnum.GAME_ROOM_PARTICIPANTS, {
            roomId: parentRoomId,
            count: totalParticipants,
        });
        // broadcast the players present in the room
        const players = yield (0, exports.getGameRoomPlayersWithRank)(room.id, room.catId, room.mode);
        // clean up room data if no players in the room
        if (players.length === 0) {
            yield cleanUpGameRoom(room.id);
        }
        socket.broadcast.to(room.id).emit(_types_1.GameEventEnum.GAME_ROOM_PLAYERS, players);
        // sync redis user game energy to prisma
        syncUserRedisGameEnergyToPrisma(user.id, room.catId, mode);
        // sync redis user wallet to prisma
        syncUserRedisWalletToPrisma(user.id);
        // disconnect the socket
        // socket.disconnect();
    }
    catch (error) { }
});
exports.disconnectGameRoomPlayer = disconnectGameRoomPlayer;
const getGameRoom = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uniqueKey = `room:${roomId}`;
        const result = yield redis_1.default.hGetAll(uniqueKey);
        if (Object.keys(result).length === 0) {
            return null;
        }
        return result;
    }
    catch (error) {
        return null;
    }
});
exports.getGameRoom = getGameRoom;
function convertKeysToJSONKeys(arr) {
    return arr.map((item) => {
        const newItem = {};
        for (const [key, value] of Object.entries(item)) {
            // Replace invalid characters or normalize keys
            const jsonKey = key
                .replace(/\s+/g, "_") // Replace spaces with underscores
                .replace(/[^a-zA-Z0-9_]/g, ""); // Remove invalid JSON key characters
            newItem[jsonKey] = value;
        }
        return newItem;
    });
}
function updateMonthlySpentCoins(params) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const spentKey = (0, utils_1.getSpentCoinsKey)(params);
            // check exists
            const exists = yield redis_1.default.exists(spentKey);
            if (exists === 0) {
                yield redis_1.default.hSet(spentKey, {
                    coins: params.coins,
                    bonus: params.bonus,
                    gameId: params.gameId,
                    catId: params.catId,
                });
            }
            else {
                yield Promise.all([
                    redis_1.default.hIncrByFloat(spentKey, "coins", params.coins),
                    redis_1.default.hIncrByFloat(spentKey, "bonus", params.bonus),
                ]);
            }
        }
        catch (error) { }
    });
}
function updateWinningStreak(_a, io_1) {
    return __awaiter(this, arguments, void 0, function* ({ catId, roomId, playerId, mode }, io) {
        try {
            const streakKey = `room:${roomId}:streak`;
            // Get the current leader and their streak
            const currentLeader = yield (0, exports.getRedisHashKey)(streakKey);
            if (currentLeader && currentLeader.playerId === playerId) {
                // Increment the current leader's streak
                const newStreak = yield redis_1.default.hIncrBy(streakKey, "streak", 1);
                // check if the new streak is ready for reward
                if (newStreak > 4) {
                    const [gameMilestones, category] = yield db_1.default.$transaction([
                        db_1.default.gameMilestone.findMany({ where: { name: "ROOM_STREAK" } }),
                        db_1.default.gameCategory.findFirst({ where: { id: catId } }),
                    ]);
                    // [5, 10, 25, 50, 100];
                    const milestones = gameMilestones.map((item) => item.milestone);
                    // Check for milestone
                    if (milestones.includes(newStreak)) {
                        // Trigger reward logic here
                        const milestone = gameMilestones.find((item) => item.milestone === newStreak);
                        // check if they exist
                        if (!milestone || !category)
                            return;
                        // check if user already won the reward under this category
                        const existingAchievement = yield db_1.default.gameAchievement.findFirst({
                            where: { playerId, catId, milestoneId: milestone.id },
                        });
                        if (existingAchievement)
                            return;
                        // sync redis user wallet to prisma
                        yield (0, helper_1.syncRedisUserWalletToPrisma)(playerId);
                        // generate txn ref
                        const txnRef = (0, utils_1.generateUniqueRef)();
                        // implement transaction
                        const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                            var _a, _b;
                            // insert achievement
                            const achievement = yield tx.gameAchievement.create({
                                data: {
                                    amount: milestone.reward,
                                    reason: milestone.reason,
                                    rewardType: client_1.RewardTypeEnum.BONUS,
                                    milestoneId: milestone.id,
                                    catId,
                                    playerId,
                                    mode: mode.toUpperCase(),
                                    description: `You won ${milestone.reward} ${client_1.TxnCurrencyEnum.COINS} & a trophy for achieving ${(_a = milestone.reason) === null || _a === void 0 ? void 0 : _a.replace(/_/g, " ").toLowerCase()} under ${category.name}`,
                                    thumbnail: milestone.thumbnail,
                                    metadata: { txnRef },
                                },
                            });
                            // sync redis and prisma together before crediting user
                            const wallet = yield tx.wallet.update({
                                where: { userId: playerId },
                                data: {
                                    bonus: { increment: milestone.reward },
                                },
                            });
                            // insert transaction
                            const txn = yield tx.transaction.create({
                                data: {
                                    amount: milestone.reward,
                                    currency: client_1.TxnCurrencyEnum.COINS,
                                    category: client_1.TxnCategoryEnum.GAME_BONUS,
                                    description: `You are rewarded ${milestone.reward} ${client_1.TxnCurrencyEnum.COINS} in your wallet for achieving ${(_b = milestone.reason) === null || _b === void 0 ? void 0 : _b.replace(/_/g, " ").toLowerCase()} under ${category.name}`,
                                    gateway: client_1.TxnGatewayEnum.WALLET,
                                    source: client_1.TxnSourceEnum.COINS,
                                    type: client_1.TxnTypeEnum.CREDIT,
                                    status: client_1.TxnStatusEnum.COMPLETED,
                                    achievementId: achievement.id,
                                    txnRef,
                                    userId: playerId,
                                    recipientId: playerId,
                                    walletId: wallet === null || wallet === void 0 ? void 0 : wallet.id,
                                },
                            });
                            // update transaction
                            yield tx.gameAchievement.update({
                                where: { id: achievement.id },
                                data: { txnId: txn.id },
                            });
                            // return
                            return { achievement, wallet };
                        }));
                        // emit event to the player
                        io.to(playerId).emit(_types_1.GameEventEnum.GAME_ROOM_ACHIEVEMENT, result.achievement);
                        // sync prisma wallet to redis
                        yield (0, helper_1.syncPrismaUserWalletToRedis)(playerId, result.wallet);
                    }
                }
            }
            else {
                // Set the new leader and reset their streak to 1
                yield redis_1.default.hSet(streakKey, { playerId, catId, streak: 1 });
            }
        }
        catch (error) { }
    });
}
function resetRoomStreak(roomId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield redis_1.default.del(`room:${roomId}:streak`);
    });
}
function backupGamePlayersScores(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const uniqueKey = "game:scores:backup";
            const backup = convertKeysToJSONKeys(data);
            const exists = yield redis_1.default.exists(uniqueKey);
            if (!exists) {
                yield redis_1.default.json.set(uniqueKey, "$", backup);
            }
            else {
                yield redis_1.default.json.arrAppend(uniqueKey, "$", ...backup);
            }
        }
        catch (error) {
            logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        }
    });
}
function updateGamePlayersScoresDb(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Attempt to save in Prisma within a transaction
            yield db_1.default.$transaction(data.map(({ playerId, score, month, year, catId, mode }) => db_1.default.gameMonthStat.upsert({
                where: {
                    playerId_catId_year_month_mode: { playerId, month, year, catId, mode },
                },
                update: {
                    score: { increment: score },
                    numPlayed: { increment: 1 },
                },
                create: {
                    playerId,
                    catId,
                    month,
                    year,
                    score,
                    numPlayed: 1,
                    mode
                },
            })));
        }
        catch (error) {
            backupGamePlayersScores(data);
        }
    });
}
const updateGamePlayersScores = (scores) => __awaiter(void 0, void 0, void 0, function* () {
    // get utc month & date to track player score by month, year and overall
    const mode = (0, utils_1.getGameMode)(scores[0].mode);
    const stat = (0, utils_1.getCurrentDataInfo)();
    const persistData = scores.map((item) => (Object.assign({ score: item.score, playerId: item.playerId, catId: item.catId, roomId: item.roomId, mode: item.mode }, stat)));
    const totalScore = persistData.reduce((acc, item) => acc + item.score, 0);
    try {
        // perform pipeline update
        yield Promise.all(scores.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            // get ranking keys
            const rankingKeys = (0, utils_1.getRankingKeys)(item.catId, mode);
            // player hash unique keys
            const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.playerId, item.catId, mode);
            // update leaderboard sorted set
            redis_1.default.zIncrBy(rankingKeys.month, item.score, item.playerId),
                redis_1.default.zIncrBy(rankingKeys.week, item.score, item.playerId),
                redis_1.default.zIncrBy(rankingKeys.today, item.score, item.playerId),
                // update category total players score and num played
                redis_1.default.hIncrBy(rankingKeys.monthStat, "score", totalScore),
                redis_1.default.hIncrBy(rankingKeys.monthStat, "numPlayed", 1),
                // update player stats
                redis_1.default.hIncrBy(playerKeys.month, "score", item.score);
            redis_1.default.hIncrBy(playerKeys.month, "numPlayed", 1);
            redis_1.default.hIncrBy(playerKeys.week, "score", item.score);
            redis_1.default.hIncrBy(playerKeys.week, "numPlayed", 1);
            redis_1.default.hIncrBy(playerKeys.today, "score", item.score);
            redis_1.default.hIncrBy(playerKeys.today, "numPlayed", 1);
        })));
        // update db
        updateGamePlayersScoresDb(persistData);
    }
    catch (error) { }
});
exports.updateGamePlayersScores = updateGamePlayersScores;
const updatePlayerGameEnergy = (socket, params) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Game energy incoming request ", params);
        // const playerKeys = getPlayerRedisKeys(params.playerId, params.catId);
        const uKey = `player:${params.playerId}:cat:${params.catId}:energy`;
        yield Promise.all([
            redis_1.default.hSet(uKey, "amount", params.amount),
            redis_1.default.hSet(uKey, "gauge", params.gauge),
            redis_1.default.hSet(uKey, "turbo", params.turbo),
        ]);
        // emit back
        socket.emit(_types_1.GameEventEnum.GAME_PLAYER_ENERGY, params);
        logger_1.default.info(`Redis game room player's energy updated`);
    }
    catch (error) {
        logger_1.default.error(`Error: Updating redis game room player's energy failed: ${error === null || error === void 0 ? void 0 : error.message}`);
    }
});
exports.updatePlayerGameEnergy = updatePlayerGameEnergy;
const updatePlayersGameEnergy = (scores, io) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield Promise.all(scores.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            // get user keys
            const mode = (0, utils_1.getGameMode)(item.mode);
            const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.playerId, item.catId, mode);
            // get random amount number
            const amount = (0, utils_1.getRandomNumber)(150, 250, true);
            // get random number to decrement energy gauge
            const gauge = (0, utils_1.getRandomNumber)(2, 4, true);
            // get random number to decrement energy turbo
            const turbo = (0, utils_1.getRandomNumber)(2, 4, true);
            // update player stats
            const _amount = yield redis_1.default.hIncrBy(playerKeys.energy, "amount", amount);
            const _gauge = yield redis_1.default.hIncrBy(playerKeys.energy, "gauge", -gauge);
            const _turbo = yield redis_1.default.hIncrBy(playerKeys.energy, "turbo", -turbo);
            console.log("Generated energy", { amount, gauge, turbo });
            return {
                playerId: item.playerId,
                catId: item.catId,
                amount: _amount,
                gauge: _gauge,
                turbo: _turbo,
            };
        })));
        //
        console.log("Updated players game energy after game round");
        console.log(result);
        // emit to game players
        yield Promise.all(result.map((item) => {
            io.in(item.playerId).emit(_types_1.GameEventEnum.GAME_PLAYER_ENERGY, item);
        }));
        logger_1.default.info(`Redis game room players' energy updated`);
    }
    catch (error) {
        logger_1.default.error(`Error: Updating redis game room players energy failed: ${error === null || error === void 0 ? void 0 : error.message}`);
    }
});
exports.updatePlayersGameEnergy = updatePlayersGameEnergy;
const isGameRoomExists = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const exists = yield redis_1.default.exists(`room:${roomId}`);
        return exists === 1;
    }
    catch (error) {
        return false;
    }
});
exports.isGameRoomExists = isGameRoomExists;
const updateGameRoom = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const timer = (_a = params.timer) !== null && _a !== void 0 ? _a : (0, utils_1.getRandomNumber)(10, 20, true);
    const roomKey = `room:${params.roomId}`;
    // console.log(`Update room - ${roomKey} payload `, { ...params, timer } )
    yield redis_1.default.hSet(roomKey, Object.assign(Object.assign({}, params), { timer }));
});
exports.updateGameRoom = updateGameRoom;
const notifyGameRoomPlayers = ({ roomId, io, mode, totalPlayers }) => {
    // broadcasting to the room the total number of participants
    const minPlayers = 3 - totalPlayers;
    io.to(roomId).emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, mode === client_1.GameMode.SINGLE ? `Swem says, get ready!` : `We have ${totalPlayers} ${totalPlayers === 1 ? "player" : "players"} & waiting for ${minPlayers} to start!`);
};
exports.notifyGameRoomPlayers = notifyGameRoomPlayers;
const composeTimerKey = (name) => {
    return name.toLowerCase();
};
// this function checks if the number of players in the room are up 3
const checkGameNumPlayers = (room, io) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const totalPlayers = yield (0, exports.getTotalRoomPlayers)(room.roomId);
    if (totalPlayers === 0)
        return;
    if ((totalPlayers >= 1 && totalPlayers < 3) && room.mode === client_1.GameMode.MULTI) {
        (0, exports.notifyGameRoomPlayers)({ roomId: room.roomId, mode: room.mode, totalPlayers, io });
        (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.CHAT }));
        (0, exports.gameChatTime)(room.roomId, io);
        return;
    }
    // generate a random themed question using Ai
    const gameQuestion = yield (0, ai_1.generateRoomQuestion)(room);
    const gameType = (0, helper_1.getGameType)(room.gameName);
    const catType = (0, helper_1.getGameCatType)(room.catName);
    if (!gameQuestion) {
        io.to(room.roomId).emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, "Swen says, you can chat now");
        yield (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.CHAT }));
        (0, exports.gameChatTime)(room.roomId, io);
        return;
    }
    //   store in redis based on the game room
    yield (0, exports.storeGameRoomQuestion)(room.roomId, gameQuestion);
    // mode
    const mode = (0, utils_1.getGameMode)(room.mode);
    const timerKey = (`${mode}_${room.catName}`).toLowerCase();
    const timers = {
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.LUCKYSPIN}`)]: 10,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.LUCKYSPIN}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.LUCKYFLIP}`)]: 10,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.LUCKYFLIP}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.LUCKYWHIZ}`)]: 10,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.LUCKYWHIZ}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.UNSCRAMBLE}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.UNSCRAMBLE}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.HANGMAN}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.HANGMAN}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.WORDMAKER}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.WORDMAKER}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.TYPEMANIA}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.TYPEMANIA}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.SINGLE}_${_types_1.GameCatType.ANAGRAM}`)]: 15,
        [composeTimerKey(`${client_1.GameMode.MULTI}_${_types_1.GameCatType.ANAGRAM}`)]: 15,
    };
    // const initTimer = timers[timerKey] ?? 20
    // console.log(" timerKey timerKey timerKey", timerKey, initTimer)
    const timer = (_a = timers[timerKey]) !== null && _a !== void 0 ? _a : 15; //gameType === GameType.ACRONYM ? 25 : initTimer
    yield (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.PLAY, timer }));
    //   store in redis based on the game room
    io.to(room.roomId).emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, "Swen says, get ready!");
    yield (0, exports.gamePlayTime)(room.roomId, io, gameQuestion);
});
exports.checkGameNumPlayers = checkGameNumPlayers;
// this function signifies time for voting
const getGameResult = (roomId, io) => __awaiter(void 0, void 0, void 0, function* () {
    const room = yield (0, exports.getGameRoom)(roomId);
    if (!room)
        return;
    // // get all the game answers for a particular room when answering is done
    // calculate players points
    const gameRoomScore = yield calculateGameRoomPoints(room);
    // persuade users to play when no game answers are available
    if (gameRoomScore.length === 0) {
        io.to(roomId).emit(_types_1.GameEventEnum.MESSAGE, (0, utils_1.composeMessage)({ content: "Please don't forget to always play!" }));
        resetRoomStreak(room.roomId);
    }
    // check if gamePoints is not empty
    if (gameRoomScore.length > 0) {
        // update game room streak and game achievement or set game room streak
        const item = gameRoomScore[0];
        if (item.score > 0) {
            updateWinningStreak(item, io);
        }
        else {
            resetRoomStreak(item.roomId);
        }
        // update players game energy
        (0, exports.updatePlayersGameEnergy)(gameRoomScore, io);
        //   emit event to client
        io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_SCORE, gameRoomScore);
        // update game points
        yield (0, exports.updateGamePlayersScores)(gameRoomScore);
        //   send in game room players
        const players = yield (0, exports.getGameRoomPlayersWithRank)(roomId, room.catId, room.mode);
        io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_PLAYERS, players);
    }
    else {
        // reset game room streak
        resetRoomStreak(room.roomId);
    }
    // chat again
    (0, exports.gameChatTime)(roomId, io, true);
    // if(room.mode === GameMode.MULTI){
    // }
    // else{
    //   checkGameNumPlayers(room, io);
    // }
});
exports.getGameResult = getGameResult;
// when it's play time
const gamePlayTime = (roomId, io, question) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const room = yield (0, exports.getGameRoom)(roomId);
    if (!room)
        return;
    const status = room.status;
    let countdown = (_a = room.timer) !== null && _a !== void 0 ? _a : 1;
    io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_QUESTION, {
        message: "Swen says, it's play time!",
        question,
    });
    const interval = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        --countdown;
        const isExists = yield (0, exports.isGameRoomExists)(roomId);
        if (!isExists)
            return clearInterval(interval);
        (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status,
            roomId, catId: room.catId, timer: countdown }));
        io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_STATE, { status, countdown });
        if (countdown < 1) {
            clearInterval(interval);
            const gameType = (0, helper_1.getGameType)(room.gameName);
            if (gameType === _types_1.GameType.ACRONYM) {
                (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.VOTE, roomId, catId: room.catId }));
                gameVoteTime(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.VOTE }), io);
            }
            else {
                (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.CHAT, roomId, catId: room.catId }));
                (0, exports.getGameResult)(roomId, io);
            }
        }
    }), 1000);
});
exports.gamePlayTime = gamePlayTime;
const gameChatTime = (roomId, io, notify) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const room = yield (0, exports.getGameRoom)(roomId);
    if (!room)
        return;
    const status = room.status;
    const isSolo = room.mode === client_1.GameMode.SINGLE;
    let countdown = isSolo ? 5 : (_a = room.timer) !== null && _a !== void 0 ? _a : 1;
    // emit initial message
    if (notify) {
        io.to(roomId).emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, isSolo ? "Get ready!" : "You can chat now!");
    }
    // set interval
    const interval = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        --countdown;
        const isExists = yield (0, exports.isGameRoomExists)(roomId);
        if (!isExists)
            return clearInterval(interval);
        // emit to the client side
        io.to(roomId).emit(_types_1.GameEventEnum.GAME_ROOM_STATE, { status, countdown });
        // update game timer
        yield (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { roomId, catId: room.catId, status, timer: countdown }));
        if (countdown < 1) {
            clearInterval(interval);
            // delete any previous game question & user answers
            yield (0, exports.deleteGameRoomQuestionAndAnswers)(room.roomId);
            (0, exports.checkGameNumPlayers)(room, io);
        }
    }), 1000);
});
exports.gameChatTime = gameChatTime;
// this function signifies time for voting
const gameVoteTime = (room, io) => __awaiter(void 0, void 0, void 0, function* () {
    // get all the game answers for a particular room when answering is done
    const answers = yield retrieveGameRoomAnswers(room.roomId);
    if (answers.length === 0) {
        (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.CHAT }));
        (0, exports.getGameResult)(room.roomId, io);
        return;
    }
    io.to(room.roomId).emit(_types_1.GameEventEnum.NOTIFY_MESSAGE, "It's voting time now!");
    const status = room.status;
    let countdown = 12;
    // emit to the client side
    io.to(room.roomId).emit(_types_1.GameEventEnum.GAME_ROOM_STATE, { status, countdown });
    //   emit event to client
    const roomAnswers = answers.sort((a, b) => b.timer - a.timer);
    io.to(room.roomId).emit(_types_1.GameEventEnum.GAME_ROOM_ANSWERS, roomAnswers);
    // interval
    const interval = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        countdown--;
        // emit to the client side
        io.to(room.roomId).emit(_types_1.GameEventEnum.GAME_ROOM_STATE, {
            status,
            countdown,
        });
        yield (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status, timer: countdown }));
        if (countdown < 1) {
            clearInterval(interval);
            (0, exports.updateGameRoom)(Object.assign(Object.assign({}, room), { status: _types_1.GameStatusEnum.CHAT }));
            (0, exports.getGameResult)(room.roomId, io);
        }
    }), 1000);
});
const createGame = (args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.game.create({ data: args });
        return { status: 200, data: result, message: "success" };
    }
    catch (error) {
        return { status: 500, data: null, message: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.createGame = createGame;
const getGames = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.game.findMany({});
        return { status: 200, data: result, message: "success" };
    }
    catch (error) {
        return { status: 500, data: null, message: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.getGames = getGames;
const createGameCategory = (args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.gameCategory.create({ data: args });
        return { status: 200, data: result, message: "success" };
    }
    catch (error) {
        return { status: 500, data: null, message: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.createGameCategory = createGameCategory;
const createGameCategoryRoom = (args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.gameRoom.create({ data: args });
        return { status: 200, data: result };
    }
    catch (error) {
        return { status: 500, data: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.createGameCategoryRoom = createGameCategoryRoom;
const getGameCategories = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const game = yield db_1.default.game.findUniqueOrThrow({ where: { id: gameId } });
        const categories = yield db_1.default.gameCategory.findMany({ where: { gameId } });
        return { status: 200, data: { game, categories }, message: "success" };
    }
    catch (error) {
        return { status: 500, data: null, message: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.getGameCategories = getGameCategories;
const getGameCategoryRooms = (catId, mode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rooms = yield db_1.default.gameRoom.findMany({ where: { catId } });
        // Fetch participant counts from Redis for each room
        const result = yield Promise.all(rooms.map((room) => __awaiter(void 0, void 0, void 0, function* () {
            const count = yield (0, exports.getTotalRoomParticipants)(`${mode}-${room.id}`);
            return Object.assign(Object.assign({}, room), { participants: count });
        })));
        return { status: 200, data: result, message: "success" };
    }
    catch (error) {
        return { status: 500, data: null, message: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.getGameCategoryRooms = getGameCategoryRooms;
const getGameCategoryRoom = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.gameRoom.findUniqueOrThrow({
            where: { id: roomId },
        });
        return { status: 200, data: result };
    }
    catch (error) {
        return { status: 500, data: error === null || error === void 0 ? void 0 : error.message };
    }
});
exports.getGameCategoryRoom = getGameCategoryRoom;
const checkGameRoom = (roomId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield db_1.default.gameRoom.findUniqueOrThrow({
            where: { id: roomId },
            include: { category: { include: { game: true } } },
        });
    }
    catch (error) {
        return null;
    }
});
exports.checkGameRoom = checkGameRoom;
const getGamePlayerRankings = (userId, rankType, mode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const keyPatterns = (0, utils_1.getPlayerRedisKeys)(userId, "*", mode);
        const pattern = rankType === "today"
            ? keyPatterns.today
            : rankType === "week"
                ? keyPatterns.week
                : keyPatterns.month;
        // Use SCAN to fetch a batch of keys
        const { keys } = yield redis_1.default.scan(0, {
            COUNT: 50000,
            MATCH: pattern,
        });
        // ranking store
        const rankings = [];
        // loop through keys and get player rank for each category
        for (const key of keys) {
            const catId = (0, utils_1.extractCatId)(key);
            if (!catId)
                break;
            // get category details
            const category = yield db_1.default.gameCategory.findUnique({
                where: { id: catId },
                include: { game: { select: { id: true, name: true } } },
            });
            if (!category)
                break;
            // get ranking
            const rankingKeys = (0, utils_1.getRankingKeys)(catId, mode);
            const rankingKey = rankType === "today"
                ? rankingKeys.today
                : rankType === "week"
                    ? rankingKeys.week
                    : rankingKeys.month;
            // get player data
            const infoKey = keyPatterns.info.replace("*", catId);
            const playerData = yield (0, exports.getRedisHashKey)(infoKey);
            if (!playerData)
                break;
            // get cat stats
            const playerCatStats = yield (0, exports.getRedisHashKey)(key);
            if (!playerCatStats)
                break;
            // Get player's rank from the sorted set leaderboard
            const playerRank = yield redis_1.default.zRevRank(rankingKey, userId);
            rankings.push(Object.assign(Object.assign(Object.assign({ category }, playerData), playerCatStats), { rank: playerRank !== null ? playerRank + 1 : 0 }));
        }
        return { status: 200, data: rankings };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGamePlayerRankings = getGamePlayerRankings;
const getGameWinnersStats = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Fetch all years
        const distinctYearStats = yield db_1.default.gameMonthStat.groupBy({
            by: ["year"],
        });
        // Process each year's stats
        const rankingStats = yield Promise.all(distinctYearStats.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            const { year } = item;
            // Fetch all months for the year
            const monthStats = yield db_1.default.gameMonthStat.groupBy({
                by: ["month"],
                where: { year },
            });
            // Process each month
            const monthCatStats = yield Promise.all(monthStats.map((monthStat) => __awaiter(void 0, void 0, void 0, function* () {
                const { month } = monthStat;
                // Fetch categories for the month and year
                const categories = yield db_1.default.gameMonthStat.groupBy({
                    by: ["catId"],
                    where: { year, month },
                });
                // Collect all category IDs
                const categoryIds = categories.map((c) => c.catId);
                // Fetch category details in bulk
                const categoryDetails = yield db_1.default.gameCategory.findMany({
                    where: { id: { in: categoryIds } },
                    include: { game: true },
                });
                // Fetch reward stats in bulk
                const rewardStats = yield db_1.default.gameMonthRewardStat.findMany({
                    where: { catId: { in: categoryIds }, year, month },
                });
                // Map categories to include their details and reward stats
                const cats = categories.map((c) => {
                    const catDetails = categoryDetails.find((cat) => cat.id === c.catId);
                    const rewardStat = rewardStats.find((rs) => rs.catId === c.catId);
                    return { cat: catDetails, rewardStats: rewardStat };
                });
                return Object.assign(Object.assign({}, monthStat), { categories: cats });
            })));
            return Object.assign(Object.assign({}, item), { stats: monthCatStats });
        })));
        if (rankingStats.length === 0) {
            return { status: 404, data: "no found" };
        }
        return { status: 200, data: rankingStats };
    }
    catch (error) {
        console.error("Error fetching game winners' stats:", error);
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGameWinnersStats = getGameWinnersStats;
const getGameWinners = (_a) => __awaiter(void 0, [_a], void 0, function* ({ page, limit, month, year, catId, }) {
    try {
        const skip = (page - 1) * limit;
        const result = yield db_1.default.gameMonthStat.findMany({
            where: { year, month, catId, rank: { gt: 0 } },
            skip,
            take: limit,
            orderBy: [{ rank: "asc" }],
            include: { player: true },
        });
        const data = yield Promise.all(result.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            const { player } = item, rest = __rest(item, ["player"]);
            // get reward txn if any
            const txn = yield db_1.default.transaction.findFirst({
                where: {
                    userId: rest.playerId,
                    category: "GAME_MONTHLY_REWARD",
                    type: "CREDIT",
                    metadata: { equals: { year: rest.year, month: rest.month } },
                },
            });
            // return
            return Object.assign(Object.assign({}, rest), { txn, name: player.name });
        })));
        return {
            status: data.length === 0 ? 404 : 200,
            data: data.length > 0 ? data : "Not found",
        };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGameWinners = getGameWinners;
const getGameCategoriesRankings = (rankType, mode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const keyPatterns = (0, utils_1.getRankingKeys)("*", mode);
        const pattern = rankType === "today"
            ? keyPatterns.today
            : rankType === "week"
                ? keyPatterns.week
                : keyPatterns.month;
        // Use SCAN to fetch a batch of keys
        const { keys } = yield redis_1.default.scan(0, {
            COUNT: 50000,
            MATCH: pattern,
        });
        // ranking store
        const rankings = [];
        // loop through keys and get player rank for each category
        for (const key of keys) {
            const catId = (0, utils_1.extractCatId)(key);
            if (!catId)
                break;
            // get category details
            const category = yield db_1.default.gameCategory.findUnique({
                where: { id: catId },
                include: { game: { select: { id: true, name: true } } },
            });
            if (!category)
                break;
            // get total participants
            const totalParticipants = yield redis_1.default.zCard(key);
            rankings.push(Object.assign(Object.assign({}, category), { totalParticipants }));
        }
        return { status: 200, data: rankings };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGameCategoriesRankings = getGameCategoriesRankings;
const getGamesRankingArchiveStats = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const beginningOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        // Get all distinct years
        const distinctYearStats = yield db_1.default.gameMonthStat.groupBy({
            by: ["year"],
            // where: { createdAt: { lt: beginningOfMonth}}
        });
        // Fetch ranking stats for each year
        const rankingStats = yield Promise.all(distinctYearStats.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            // Fetch all months for the given year
            const monthStats = yield db_1.default.gameMonthStat.groupBy({
                by: ["month"],
                where: { year: item.year },
            });
            // Fetch categories for each month
            const monthCatStats = yield Promise.all(monthStats.map((m) => __awaiter(void 0, void 0, void 0, function* () {
                // Fetch categories and counts for the specific month and year
                const categories = yield db_1.default.gameMonthStat.groupBy({
                    by: ["catId"],
                    _count: {
                        _all: true,
                    },
                    where: { year: item.year, month: m.month },
                });
                // Fetch category details in bulk to avoid individual queries
                const categoryIds = categories.map((c) => c.catId);
                const categoryDetails = yield db_1.default.gameCategory.findMany({
                    where: { id: { in: categoryIds } },
                    include: { game: true },
                });
                // Map category stats with their details
                const cats = categories.map((c) => {
                    const catDetails = categoryDetails.find((cat) => cat.id === c.catId);
                    return { cat: catDetails, totalParticipants: c._count._all };
                });
                return Object.assign(Object.assign({}, m), { categories: cats });
            })));
            return Object.assign(Object.assign({}, item), { stats: monthCatStats });
        })));
        if (rankingStats.length === 0) {
            return { status: 404, data: "Not found" };
        }
        return { status: 200, data: rankingStats };
    }
    catch (error) {
        console.error("Error fetching ranking stats:", error);
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGamesRankingArchiveStats = getGamesRankingArchiveStats;
const getGamesRankingArchiveData = (_a) => __awaiter(void 0, [_a], void 0, function* ({ page, limit, month, year, catId, }) {
    try {
        const skip = (page - 1) * limit;
        // get archive data
        const result = yield db_1.default.gameMonthStat.findMany({
            // where: { year, month, catId, rank: { gt: 0 } },
            where: { year, month, catId },
            skip,
            take: limit,
            orderBy: [{ rank: "asc" }],
            include: { player: true },
        });
        // format data
        const data = result.map((item) => {
            const { player } = item, rest = __rest(item, ["player"]);
            return Object.assign(Object.assign({}, rest), { name: player.name });
        });
        return {
            status: data.length === 0 ? 404 : 200,
            data: data.length > 0 ? data : "Not found",
        };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getGamesRankingArchiveData = getGamesRankingArchiveData;
const getUserGamesRankingArchiveStats = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get distinct count
        const distinctStats = yield db_1.default.gameMonthStat.groupBy({
            where: { playerId: userId },
            by: ["catId", "month", "year"], // Group by these fields
        });
        // get the related data
        const data = yield Promise.all(distinctStats.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            const category = yield db_1.default.gameCategory.findUniqueOrThrow({
                where: {
                    id: item.catId,
                },
                include: { game: true },
            });
            return Object.assign(Object.assign({}, category), { catId: item.catId, month: item.month, year: item.year });
        })));
        return { status: 200, data };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getUserGamesRankingArchiveStats = getUserGamesRankingArchiveStats;
const getUserGameRankingArchiveData = (_a) => __awaiter(void 0, [_a], void 0, function* ({ month, year, catId, userId, }) {
    try {
        // get archive data
        const result = yield db_1.default.gameMonthStat.findFirst({
            where: {
                year,
                month,
                catId,
                playerId: userId,
            },
            take: 1,
            include: { player: true },
        });
        if (!result)
            return { status: 404, data: "Not found." };
        // format data
        const { player } = result, rest = __rest(result, ["player"]);
        return { status: 200, data: Object.assign(Object.assign({}, rest), { name: player.name }) };
    }
    catch (error) {
        return {
            status: 500,
            data: "Sorry an error occurred, please try again later.",
        };
    }
});
exports.getUserGameRankingArchiveData = getUserGameRankingArchiveData;
// creating fake users and redis data for test purposes
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
function createRandomUser() {
    const uid = faker_1.faker.string.uuid().slice(-5);
    return {
        name: faker_1.faker.person.fullName(),
        username: faker_1.faker.internet.username() + uid,
        email: uid + faker_1.faker.internet.email(),
        avatar: faker_1.faker.image.avatar(),
        password: faker_1.faker.internet.password(),
        telId: faker_1.faker.string.uuid().slice(-12),
        wallet: { create: { bonus: 100 } },
    };
}
const createDummyUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const batchSize = 2000;
        let counter = 0;
        while (counter < 5000000) {
            const users = faker_1.faker.helpers.multiple(createRandomUser, {
                count: batchSize,
            });
            const createManyUsers = users.map((user) => db_1.default.user.create({ data: user }));
            yield db_1.default.$transaction(createManyUsers);
            counter += batchSize;
            logger_1.default.info(`Created bATCH ${counter} dummy users `);
        }
        logger_1.default.info(`Created ${counter} dummy users `);
    }
    catch (error) {
        logger_1.default.info(`Error: Dummy users failed ${error === null || error === void 0 ? void 0 : error.message}`);
    }
});
exports.createDummyUsers = createDummyUsers;
// export const createDummyRedisMonthlyScoreRecord = async () => {
//   try {
//     const batchSize = 500;
//     let counter = 0;
//     const total = await prisma.user.count();
//     while (counter < total) {
//       const users = await prisma.user.findMany({
//         skip: counter,
//         take: batchSize,
//       });
//       if (users.length === 0) break;
//       // insert new users into redis database
//       const categories = await prisma.gameCategory.findMany({});
//       if (categories.length === 0) break;
//       for (const category of categories) {
//         const rankingKeys = getRankingRewardKeys(category.id, "multi");
//         const spentKey = getSpentCoinsKey({
//           gameId: category.gameId,
//           catId: category.id,
//         });
//         const fakeUserScore = users.map((user) => {
//           // insert fake redis user details
//           redisClient.hSet(
//             `player:${user.id}:category:${category.id}:${2024}`,
//             {
//               id: user.id,
//               name: user.username,
//               createdAt: new Date().toISOString(),
//               lastLoggedIn: new Date().toISOString(),
//             }
//           );
//           // fake score
//           const numPlayed = getRandomNumber(2000, 20_000, true);
//           const score = getRandomNumber(20_000, 2_000_000, true);
//           // insert fake month player data
//           redisClient.hSet(
//             `player:${user.id}:category:${
//               category.id
//             }:${2024}:${11}:month:${11}`,
//             {
//               score,
//               numPlayed,
//             }
//           );
//           // fake month stat
//           // update category total players score and num played
//           redisClient.hSet(rankingKeys.rewardMonthStat, {
//             score: getRandomNumber(5_000_000_000, 20_000_000_000, true),
//             numPlayed: getRandomNumber(1_000_000, 10_000_000, true),
//           }),
//             // fake user scores
//             redisClient.zAdd(rankingKeys.rewardMonth, {
//               value: user.id,
//               score: score,
//             });
//           // fake total coins spent
//           redisClient.hSet(spentKey, {
//             coins: getRandomNumber(8_000_000_000, 30_000_000_000),
//             bonus: getRandomNumber(100_000_000, 500_000_000),
//             gameId: category.gameId,
//             catId: category.id,
//           });
//         });
//         await Promise.all(fakeUserScore);
//       }
//       counter += users.length;
//       console.log(`bATCH: ${counter} created successfully`);
//     }
//     logger.info(`Dummy monthly game score created successfully`);
//   } catch (error: any) {
//     console.log(`Error: Creating monthly dummy data failed ~ `, error?.message);
//   }
// };
const deleteAllRecords = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.gameMonthStat.deleteMany({ where: { score: { gt: 0 } } });
    yield db_1.default.gameMonthRewardStat.deleteMany({
        where: { totalScore: { gt: 0 } },
    });
    yield db_1.default.transaction.deleteMany({ where: { amount: { gt: 0 } } });
    yield db_1.default.gameAchievement.deleteMany({ where: { amount: { gt: 0 } } });
    logger_1.default.info("Deleted all records");
});
function clearRedisKeysByPattern(pattern) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // clear players stats redis keys
            let cursor = 0; // Initial cursor
            let keyCounts = 0;
            do {
                // Use SCAN to fetch a batch of keys
                const { cursor: newCursor, keys } = yield redis_1.default.scan(cursor, {
                    COUNT: 50000,
                    MATCH: pattern,
                });
                cursor = newCursor;
                keyCounts += keys.length;
                logger_1.default.info(`cursor: ${cursor}`);
                logger_1.default.info(`First key : ${keys[0]}`);
                logger_1.default.info(`Found ${keys.length} keys in this batch`);
                if (keys.length > 0) {
                    yield Promise.all(keys.map((key) => redis_1.default.del(key)));
                    logger_1.default.info(`Deleted ${keys.length} keys in this batch`);
                }
            } while (cursor !== 0); // SCAN stops when cursor is back to '0'
            logger_1.default.info(`All matching ${keyCounts} keys have been deleted.`);
        }
        catch (error) {
            logger_1.default.info("Error: Deleting players month stats failed.", error === null || error === void 0 ? void 0 : error.message);
        }
    });
}
const insertPlanFeatures = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.default.planFeature.createMany({
            data: [
                {
                    name: "Exclusive Experience",
                    planId: "cm53oc8a50000vwfy8sdlzh1f",
                    items: [
                        { id: (0, utils_1.generateUniqueRef)(), title: "Reply and profile boost", description: "Small" },
                        { id: (0, utils_1.generateUniqueRef)(), title: "Earn standard rewards", description: "" },
                        { id: (0, utils_1.generateUniqueRef)(), title: "Contains non-intrusive ads", description: "" },
                        { id: (0, utils_1.generateUniqueRef)(), title: "Send/receive friend requests in game rooms", description: "" }
                    ]
                },
                // organization
                {
                    name: "Exclusive Experience",
                    planId: "cm53oc8a50003vwfyz79hdaet",
                    items: [
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Reply and profile boost",
                            description: "Larger",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority placement in search suggestions",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority support for reports and issues.",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Partial Ads browsing experience",
                            description: "",
                        },
                    ],
                },
                {
                    name: "Exclusive Experience",
                    planId: "cm53oc8a50004vwfy508n9x9u",
                    items: [
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Reply and profile boost",
                            description: "Largest",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority placement in search suggestions",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority support for reports and issues.",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Ads-free browsing experience",
                            description: "",
                        },
                    ],
                },
                // government
                {
                    name: "Exclusive Experience",
                    planId: "cm53oc8a50006vwfyxyk8b7sq",
                    items: [
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Reply and profile boost",
                            description: "Larger",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority placement in search suggestions",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority support for reports and issues.",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Partial Ads browsing experience",
                            description: "",
                        },
                    ],
                },
                {
                    name: "Exclusive Experience",
                    planId: "cm53oc8a50006vwfyxyk8b7sq",
                    items: [
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Reply and profile boost",
                            description: "Largest",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority placement in search suggestions",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Priority support for reports and issues.",
                            description: "",
                        },
                        {
                            id: (0, utils_1.generateUniqueRef)(),
                            title: "Ads-free browsing experience",
                            description: "",
                        },
                    ],
                },
            ],
        });
        console.log("Inserted plan features");
    }
    catch (error) {
        console.log("Error: Plan Features ", error === null || error === void 0 ? void 0 : error.message);
    }
});
const addGameCategories = () => __awaiter(void 0, void 0, void 0, function* () {
    const games = [
        {
            name: "Trivia & Quiz",
            description: "Fast-paced games requiring quick thinking, precise timing, and swift reactions",
        },
        {
            name: "Acronym Arcade",
            description: "Test your wit and speed in this fun-filled game of guessing acronyms — perfect for quick thinkers!",
        },
        {
            name: "MindMash",
            description: "Brain games that challenge your thinking and reflexes, featuring word puzzles, typing races, and problem-solving challenges.",
        },
        {
            name: "Academia Adventure",
            description: "Test your knowledge on everything from math to history and prove you're the ultimate academic adventurer",
        },
        {
            name: "Sports & Games",
            description: "Explore the world of sports, athletes, and games from popular global sports like football, soccer, basketball in a diverse array of questions and challenge participants",
        },
        {
            name: "Country Mania",
            description: "Test your geographical skills by answering questions about flags, capitals, landmarks in a fun and interactive way!",
        },
    ];
    const triviaGroups = [
        {
            name: "Themed Quest",
            description: "Embark on a journey through themed challenges",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Olympic Games",
                "Famous Athletes",
                "Football & Basketball",
                "Esports & Gaming",
                "Unusual Sports",
                "Board Games Trivia",
                "Cricket & Baseball",
                "Extreme Sports",
            ],
        },
        {
            name: "Science & Technology",
            description: "Dive into the wonders of science and technological advancements.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Space Exploration",
                "Scientific Discoveries",
                "Animal Kingdom",
                "The Solar System",
                "Human Anatomy",
                "Physics in Action",
                "Chemistry Around Us",
                "Breakthrough Experiments",
                "Breakthrough Experiments",
                "Famous Scientists",
                "Physics in Everyday Life",
                "Human Evolution",
            ],
        },
        {
            name: "History & Geography",
            description: "Learn about historical events and geographic wonders.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Ancient Civilizations",
                "World Wars",
                "Historic Inventions",
                "Geographic Wonders",
                "Capitals & Countries",
                "Historic Leaders",
                "Revolutions in History",
                "Famous Explorers",
            ],
        },
        {
            name: "Pop Culture",
            description: "Test your knowledge of movies, TV, music, and celebrities.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Movies & TV",
                "Famous Books",
                "Music Through the Decades",
                "Superheroes & Comics",
                "Internet Culture",
                "Celebrity Gossip",
                "Animation & Cartoons",
                "Streaming Platforms",
            ],
        },
        {
            name: "Culture & Lifestyle",
            description: "Discover cultural traditions and lifestyle trends around the world.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Foods & Drinks",
                "World Festivals",
                "Fashion Through History",
                "Art Movements",
                "Myths & Legends",
                "Indigenous Tribes",
                "Traditional Dances",
            ],
        },
        {
            name: "Literature & Language",
            description: "Celebrate the beauty of words, literature, and language.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Quotes",
                "Word Origins",
                "Global Languages",
                "Classic Novels",
                "Literary Genres",
                "Poetry Across Cultures",
                "Famous Authors",
                "Word Play and Riddles",
            ],
        },
        {
            name: "Entertainment & Media",
            description: "From Hollywood to the internet, dive into entertainment trivia.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Hollywood Trivia",
                "Iconic TV Shows",
                "Award Ceremonies",
                "Famous Directors",
                "Internet Trends",
                "Viral Videos",
                "Movie Quotes",
                "Video Games Evolution",
            ],
        },
        {
            name: "Nature & Environment",
            description: "Explore the beauty and challenges of the natural world.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Endangered Species",
                "National Parks",
                "Natural Disasters",
                "Environmental Activism",
                "Plants & Trees",
                "Ocean Mysteries",
                "Global Wildlife",
                "Conservation Heroes",
            ],
        },
        {
            name: "Technology Trends",
            description: "Keep up with the latest trends in technology and innovation.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Innovations of the 21st Century",
                "Famous Tech Companies",
                "History of Computers",
                "Smartphones & Gadgets",
                "Artificial Intelligence",
                "Renewable Energy",
                "Virtual Reality",
                "Robotics",
            ],
        },
        {
            name: "World Cultures",
            description: "Learn about global cultures, religions, and traditions.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Global Religions",
                "Exotic Customs",
                "Unique Festivals",
                "Cultural Etiquettes",
                "Iconic Artifacts",
                "World Cuisines",
                "Legendary Kings and Queens",
                "Languages of the World",
            ],
        },
        {
            name: "Fun & Riddles",
            description: "Enjoy brain-teasing puzzles and entertaining trivia.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Brain Teasers",
                "Logical Puzzles",
                "Tongue Twisters",
                "Word Scrambles",
                "General Fun Facts",
            ],
        },
        {
            name: "Travel & Destinations",
            description: "Discover iconic landmarks and hidden travel gems.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Landmarks",
                "Exotic Beaches",
                "Hidden Travel Gems",
                "Travel Tips & Hacks",
                "UNESCO Heritage Sites",
                "World's Largest Cities",
                "Adventure Destinations",
                "Iconic Mountains",
            ],
        },
        {
            name: "Myths & Legends",
            description: "Uncover myths, legends, and folklore from around the world.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Greek Mythology",
                "Folklore Tales",
                "Urban Legends",
                "Legendary Heroes",
                "Mythical Creatures",
                "Norse Mythology",
                "Asian Legends",
                "Ancient Deities",
            ],
        },
        {
            name: "Health & Wellness",
            description: "Trivia about health, wellness, and medical breakthroughs.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Medical Discoveries",
                "Fitness Trends",
                "Nutrition & Diet",
                "Alternative Medicine",
                "Mental Health Awareness",
                "Herbal Remedies",
                "Famous Doctors",
                "History of Medicine",
            ],
        },
        {
            name: "Fashion & Trends",
            description: "Explore the world of fashion, designers, and trends.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Runway Hits",
                "Famous Designers",
                "Decades of Style",
                "Accessory Trends",
                "Sustainable Fashion",
                "Street Style",
                "Haute Couture",
                "Iconic Fashion Moments",
            ],
        },
        {
            name: "Technology Innovations",
            description: "Discover how technology shapes our world.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Space Technologies",
                "Breakthrough Gadgets",
                "The Internet Evolution",
                "Blockchain and Cryptocurrencies",
                "Future of Technology",
                "Autonomous Vehicles",
                "Smart Cities",
                "AI and Ethics",
            ],
        },
        {
            name: "Business & Economy",
            description: "Test your knowledge of global business and economic facts.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Stock Market Facts",
                "Global Trade",
                "Famous Entrepreneurs",
                "History of Money",
                "Billion-Dollar Companies",
                "Startup Culture",
                "Economic Theories",
                "Business Scandals",
            ],
        },
        {
            name: "Music & Arts",
            description: "Trivia about music, arts, and cultural expression.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Composers",
                "Afrobeat",
                "Hip Hop",
                "Rnb",
                "Country Music",
                "Pop Music",
                "Iconic Paintings",
                "Instruments Across Cultures",
                "Street Art & Graffiti",
                "Music Awards",
                "Album Cover Trivia",
                "The History of Opera",
                "Evolution of Dance",
            ],
        },
        {
            name: "Geography Facts",
            description: "Expand your knowledge about Earth's geography.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Mountains & Peaks",
                "Deserts of the World",
                "Rivers & Oceans",
                "Unique Countries",
                "Climate Zones",
                "Geopolitical Trivia",
                "Island Nations",
                "Famous World Borders",
            ],
        },
        {
            name: "Space Mysteries",
            description: "Explore the mysteries of outer space.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Black Holes",
                "The Milky Way",
                "Mars Exploration",
                "Exoplanets",
                "Space Missions",
                "Astronomical Events",
                "Theories of the Universe",
                "Space-Time Concepts",
            ],
        },
        {
            name: "Historical Eras",
            description: "Learn about key historical periods and their significance.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "The Renaissance",
                "The Industrial Revolution",
                "The Medieval Period",
                "The Enlightenment",
                "The Cold War",
                "Ancient Empires",
                "Colonial Histories",
                "The Age of Exploration",
            ],
        },
        {
            name: "Food & Drinks",
            description: "Discover trivia about culinary delights and beverages.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Culinary Styles",
                "Famous Cocktails",
                "Street Foods",
                "Iconic Dishes",
                "Global Ingredients",
                "Food History",
                "Dessert Specialties",
                "Drinks Around the World",
            ],
        },
        {
            name: "Famous People",
            description: "Trivia about influential figures throughout history.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "World Leaders",
                "Influential Women",
                "Inventors & Thinkers",
                "Revolutionaries",
                "Explorers & Adventurers",
                "Celebrities Who Changed the World",
                "Scientists and Mathematicians",
                "Philosophers and Theologians",
            ],
        },
        {
            name: "Festivals & Celebrations",
            description: "Trivia about global festivals and iconic celebrations.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Carnival Traditions",
                "Winter Festivals",
                "Harvest Celebrations",
                "Religious Holidays",
                "Music Festivals",
                "National Holidays",
                "Iconic Global Events",
                "Local Parades",
            ],
        },
        {
            name: "Quirky & Bizarre",
            description: "Weird and quirky trivia to surprise and amaze.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Odd Jobs",
                "Strange Laws",
                "Unusual Inventions",
                "Rare Animal Species",
                "Weird World Records",
                "Bizarre Foods",
                "Crazy Rituals",
                "Outlandish Events",
            ],
        },
        {
            name: "Urban Life",
            description: "Trivia about cities, urban development, and cultures.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "City Skylines",
                "Megacities",
                "Famous Streets",
                "Urban Development",
                "Transportation Systems",
                "The Rise of Suburbs",
                "Urban Legends",
                "Historical Cities",
            ],
        },
        {
            name: "Internet & Technology",
            description: "Trivia about the internet and digital culture.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Evolution of Social Media",
                "Online Security Tips",
                "The Rise of E-commerce",
                "Internet Memes",
                "Famous Websites",
                "Gaming Communities",
                "Online Trends",
                "Digital Influencers",
            ],
        },
        {
            name: "Time & Space",
            description: "Learn about the mysteries of time and space.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Ancient Calendars",
                "Timekeeping Devices",
                "Measuring Distance",
                "Theories of Relativity",
                "Space-Time Paradoxes",
                "Evolution of Clocks",
                "Time Travel in Fiction",
                "Cosmic Timelines",
            ],
        },
        {
            name: "War & Conflict",
            description: "Trivia about wars, battles, and historical conflicts.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Revolutionary Wars",
                "Military Tactics",
                "Cold War Espionage",
                "Naval Battles",
                "Famous Generals",
                "Civil Wars",
                "Modern Conflicts",
                "Peace Treaties",
            ],
        },
        {
            name: "Psychology & Philosophy",
            description: "Explore the depths of the mind and profound philosophical ideas.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Philosophers",
                "Cognitive Biases",
                "Psychology Theories",
                "Human Emotions",
                "Thought Experiments",
                "Existential Questions",
                "Behavioral Science",
                "Personality Types",
            ],
        },
        {
            name: "Mythology Around the World",
            description: "Delve into myths, legends, and deities from different cultures worldwide.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Celtic Myths",
                "African Folklore",
                "Indian Epics",
                "Japanese Kami Legends",
                "Native American Myths",
                "Mesopotamian Gods",
                "Australian Dreamtime",
                "Slavic Folklore",
            ],
        },
        {
            name: "Inventions & Discoveries",
            description: "Trivia about human ingenuity and scientific breakthroughs.",
            gameId: "cm53lflwj000wuymrx0fvjomp",
            topics: [
                "Famous Inventors",
                "Groundbreaking Patents",
                "Space Innovations",
                "Medical Milestones",
                "Transportation Revolutions",
                "The Age of Electricity",
                "Everyday Inventions",
                "Technological Marvels",
            ],
        },
    ];
    const acronymCategories = [
        {
            name: "Pop Culture & Slang",
            description: "Acronyms derived from movies, TV shows, music, internet trends, and common texting slang.",
            topics: [
                "Movies",
                "TV Shows",
                "Music Genres",
                "Internet Memes",
                "Texting Slang",
            ],
        },
        {
            name: "Business & Corporate",
            description: "Acronyms used in industries, corporate communication, and professional terminology.",
            topics: [
                "Corporate Titles",
                "Startup Terms",
                "Marketing Jargon",
                "Finance Terms",
                "Project Management",
            ],
        },
        {
            name: "Science & Technology",
            description: "Acronyms related to scientific discoveries, innovations, and technological concepts.",
            topics: [
                "Physics",
                "Biology",
                "Computer Science",
                "Space Exploration",
                "Artificial Intelligence",
            ],
        },
        {
            name: "Government, Politics & Law",
            description: "Acronyms tied to government agencies, political terms, and legal systems.",
            topics: [
                "Government Agencies",
                "Political Parties",
                "Constitutional Terms",
                "Military Organizations",
                "Legal Terms",
            ],
        },
        {
            name: "Sports & Gaming",
            description: "Acronyms from sports leagues, teams, gaming culture, and esports.",
            topics: [
                "Football Leagues",
                "Video Games",
                "Board Games",
                "Sports Teams",
                "Gaming Strategies",
            ],
        },
        {
            name: "Health & Wellness",
            description: "Acronyms related to fitness, nutrition, medical terms, and wellness practices.",
            topics: [
                "Fitness Techniques",
                "Nutrition Plans",
                "Medical Terms",
                "Mental Health",
                "Healthcare Professions",
            ],
        },
        {
            name: "Education & Academics",
            description: "Acronyms from schools, universities, and academic research.",
            topics: [
                "Educational Degrees",
                "School Subjects",
                "Research Fields",
                "Academic Institutions",
                "Standardized Tests",
            ],
        },
        {
            name: "Travel & Geography",
            description: "Acronyms associated with travel, locations, and geographical landmarks.",
            topics: [
                "Airports",
                "Country Codes",
                "Geographical Landmarks",
                "Travel Agencies",
                "Transportation Modes",
            ],
        },
        {
            name: "Historical & Cultural",
            description: "Acronyms tied to historical events, cultural movements, and traditions.",
            topics: [
                "Historical Events",
                "Cultural Organizations",
                "Festivals",
                "Historical Figures",
                "Cultural Movements",
            ],
        },
        {
            name: "Entertainment & Media",
            description: "Acronyms from the entertainment industry, including awards and productions.",
            topics: [
                "Award Shows",
                "Streaming Platforms",
                "Media Companies",
                "Movie Franchises",
                "TV Networks",
            ],
        },
        {
            name: "Finance & Economics",
            description: "Acronyms used in banking, investments, and economic discussions.",
            topics: [
                "Banking Terms",
                "Stock Market",
                "Cryptocurrencies",
                "Economic Theories",
                "Investment Strategies",
            ],
        },
        {
            name: "Environment & Conservation",
            description: "Acronyms about sustainability, environmental organizations, and conservation efforts.",
            topics: [
                "Climate Change",
                "Sustainability Programs",
                "Conservation Organizations",
                "Recycling Initiatives",
                "Environmental Laws",
            ],
        },
        {
            name: "Fashion & Lifestyle",
            description: "Acronyms from fashion trends, lifestyle habits, and popular brands.",
            topics: [
                "Fashion Trends",
                "Beauty Brands",
                "Lifestyle Choices",
                "Fitness Trends",
                "Clothing Lines",
            ],
        },
        {
            name: "Military & Defense",
            description: "Acronyms related to military operations, strategies, and equipment.",
            topics: [
                "Military Ranks",
                "Defense Strategies",
                "Weapon Systems",
                "Peacekeeping Missions",
                "Military Bases",
            ],
        },
        {
            name: "Daily Life & General Knowledge",
            description: "Acronyms encountered in everyday life and general trivia.",
            topics: [
                "Household Items",
                "Common Phrases",
                "Everyday Services",
                "Public Transportation",
                "Popular Apps",
            ],
        },
    ];
    const academiaCategories = [
        {
            name: "Mathematics",
            description: "Test your skills in various branches of mathematics, from algebra to calculus.",
            topics: [
                "Algebra",
                "Geometry",
                "Calculus",
                "Trigonometry",
                "Statistics",
                "Probability",
            ],
        },
        {
            name: "Science",
            description: "Dive into the world of science and explore topics from biology to physics.",
            topics: [
                "Physics",
                "Chemistry",
                "Biology",
                "Earth Science",
                "Astronomy",
                "Genetics",
            ],
        },
        {
            name: "History",
            description: "Explore the past, from ancient civilizations to modern history.",
            topics: [
                "Ancient Civilizations",
                "World History",
                "U.S. History",
                "Historical Events",
                "Wars and Conflicts",
                "Famous Leaders",
            ],
        },
        {
            name: "Literature",
            description: "Test your knowledge of literature, from famous authors to literary terms.",
            topics: [
                "Famous Authors",
                "Poetry",
                "Novels",
                "Literary Terms",
                "Genres",
                "Book Summaries",
            ],
        },
        {
            name: "Geography",
            description: "Learn about the world's countries, capitals, and geography.",
            topics: [
                "Countries",
                "Capitals",
                "Landforms",
                "Climate Zones",
                "Continents",
                "Natural Wonders",
            ],
        },
        {
            name: "Language Arts",
            description: "Master the art of grammar, writing, and reading comprehension.",
            topics: [
                "Grammar",
                "Vocabulary",
                "Reading Comprehension",
                "Writing Skills",
                "Punctuation",
                "Spelling",
            ],
        },
        {
            name: "Art & Music",
            description: "Explore the worlds of art and music, from history to theory.",
            topics: [
                "Famous Artists",
                "Art History",
                "Music Theory",
                "Instruments",
                "Famous Composers",
                "Art Movements",
            ],
        },
        {
            name: "Physical Education",
            description: "Learn about fitness, sports rules, and the importance of teamwork.",
            topics: [
                "Sports Rules",
                "Fitness",
                "Nutrition",
                "Teamwork",
                "Strength Training",
                "Cardio",
            ],
        },
        {
            name: "Social Studies",
            description: "Explore society, culture, government, and economics.",
            topics: [
                "Government",
                "Economics",
                "Sociology",
                "Cultural Studies",
                "Political Systems",
                "Law",
            ],
        },
        {
            name: "Technology",
            description: "Test your knowledge of technology, from programming to innovations.",
            topics: [
                "Computers",
                "Programming",
                "Innovations",
                "Digital Literacy",
                "Cybersecurity",
                "Artificial Intelligence",
            ],
        },
        {
            name: "Foreign Languages",
            description: "Learn and test your skills in various foreign languages.",
            topics: ["Spanish", "French", "German", "Latin", "Mandarin", "Italian"],
        },
        {
            name: "Philosophy & Logic",
            description: "Engage with thought-provoking topics in philosophy and logic.",
            topics: [
                "Famous Philosophers",
                "Logical Reasoning",
                "Ethics",
                "Thought Experiments",
                "Philosophical Theories",
                "Metaphysics",
            ],
        },
        {
            name: "Environmental Studies",
            description: "Learn about the environment, from ecology to climate change.",
            topics: [
                "Conservation",
                "Ecology",
                "Climate Change",
                "Renewable Energy",
                "Pollution",
                "Biodiversity",
            ],
        },
        {
            name: "Health Education",
            description: "Understand the basics of health, from anatomy to mental well-being.",
            topics: [
                "Anatomy",
                "Nutrition",
                "Mental Health",
                "Personal Safety",
                "First Aid",
                "Public Health",
            ],
        },
        {
            name: "Current Events",
            description: "Stay updated with the world by learning about the latest news and global issues.",
            topics: [
                "News",
                "Politics",
                "World Affairs",
                "Global Issues",
                "Environmental Policies",
                "Human Rights",
            ],
        },
    ];
    const sportsCategories = [
        {
            name: "Football (Soccer)",
            description: "Explore the world of football(soccer) and test your knowledge.",
            topics: [
                "FIFA World Cup",
                "Club Football",
                "National Teams",
                "Football Tactics",
                "Football History",
                "Football Positions",
                "Famous Football Players",
                "Football Leagues",
                "Referee Rules",
                "Football Equipment",
                "Olympic Games",
                "Famous Athletes",
                "Football & Basketball",
                "Esports & Gaming",
                "Unusual Sports",
                "Board Games Trivia",
                "Cricket & Baseball",
                "Extreme Sports",
            ],
        },
        {
            name: "Team Sports",
            description: "Sports played by two or more teams, each trying to outperform the others to score points or goals.",
            topics: [
                "Basketball",
                "Baseball",
                "Rugby",
                "Hockey (Field and Ice)",
                "Volleyball",
                "Lacrosse",
                "Water Polo",
                "Handball",
            ],
        },
        {
            name: "Racquet Sports",
            description: "Sports played with rackets, involving striking a ball or shuttlecock back and forth over a net.",
            topics: ["Tennis", "Badminton", "Table Tennis", "Squash", "Pickleball"],
        },
        {
            name: "Combat Sports",
            description: "Sports that involve fighting, typically one-on-one, using various techniques and skills.",
            topics: ["Boxing", "MMA (Mixed Martial Arts)", "Wrestling", "Fencing"],
        },
        {
            name: "Water Sports",
            description: "Sports that take place in or on the water, often involving swimming, rowing, or sailing.",
            topics: [
                "Swimming",
                "Surfing",
                "Canoeing/Kayaking",
                "Sailing",
                "Rowing",
                "Water Polo",
            ],
        },
        {
            name: "Winter Sports",
            description: "Sports played in winter conditions, often on snow or ice, requiring specialized equipment.",
            topics: [
                "Skiing (Alpine and Nordic)",
                "Snowboarding",
                "Ice Skating",
                "Speed Skating",
            ],
        },
        {
            name: "Adventure Sports",
            description: "Sports involving an element of risk or excitement, typically done in outdoor or rugged environments.",
            topics: [
                "Rock Climbing",
                "Parkour",
                "Hiking",
                "Cycling",
                "Mountain Biking",
            ],
        },
        {
            name: "Motorsports",
            description: "Sports involving vehicles, often competitive races on tracks or off-road terrain.",
            topics: ["Formula 1", "MotoGP", "Rally Racing", "NASCAR", "Go-Karting"],
        },
        {
            name: "Strength Sports",
            description: "Sports focused on physical strength, including weightlifting and competitions that require force.",
            topics: [
                "Weightlifting",
                "Powerlifting",
                "CrossFit",
                "Strongman Competitions",
            ],
        },
        {
            name: "Individual Sports",
            description: "Sports typically played individually, focusing on personal skill and performance.",
            topics: [
                "Golf",
                "Tennis",
                "Bowling",
                "Archery",
                "Snooker",
                "Billiards",
                "Darts",
            ],
        },
        {
            name: "Equestrian Sports",
            description: "Sports that involve horse riding, ranging from racing to jumping and dressage.",
            topics: ["Horse Racing", "Polo", "Equestrian Jumping", "Dressage"],
        },
        {
            name: "Extreme Sports",
            description: "Sports that involve high levels of risk and require adrenaline and skill.",
            topics: [
                "Skateboarding",
                "BMX",
                "Snowboarding",
                "Surfing",
                "Freestyle Motocross",
            ],
        },
        {
            name: "Sports with Balls",
            description: "Sports where players use a ball as the primary equipment, including team-based and individual sports.",
            topics: [
                "Golf",
                "Tennis",
                "Baseball",
                "Basketball",
                "Cricket",
                "Rugby",
                "Football (American)",
            ],
        },
        {
            name: "Track Sports",
            description: "Sports that take place on a track, typically involving running, cycling, and field events.",
            topics: ["Track Cycling", "Sprinting", "Hurdles", "Relay Races"],
        },
        {
            name: "Fitness and Exercise",
            description: "Sports and activities focused on improving physical fitness and health.",
            topics: ["Gymnastics", "Pilates", "Yoga", "Martial Arts", "Zumba"],
        },
        {
            name: "Board Sports",
            description: "Sports that involve a board as the primary equipment, usually involving balance and coordination.",
            topics: ["Skateboarding", "Snowboarding", "Surfing", "Windsurfing"],
        },
        {
            name: "Water-based Racing",
            description: "Sports that involve racing on water using boats, jets, or other equipment.",
            topics: ["Jet Skiing", "Canoeing", "Kayaking", "Sailing", "Rowing"],
        },
        {
            name: "Games and Recreation",
            description: "Casual, fun sports and games usually played for leisure or social engagement.",
            topics: [
                "Ultimate Frisbee",
                "Dodgeball",
                "Kickball",
                "Bocce Ball",
                "Horseshoes",
            ],
        },
        {
            name: "Social Sports",
            description: "Casual sports that encourage social interaction and recreation.",
            topics: ["Softball", "Cricket", "Bowling", "Ping Pong", "Pool", "Darts"],
        },
        {
            name: "E-sports",
            description: "Competitive video gaming, often with professional leagues and tournaments.",
            topics: [
                "League of Legends",
                "Fortnite",
                "Counter-Strike",
                "Call of Duty",
                "Dota 2",
            ],
        },
    ];
    const countries = [
        {
            name: "Afghanistan",
            description: "A landlocked country located in South Asia and Central Asia.",
            topics: [],
        },
        {
            name: "Albania",
            description: "A country in Southeastern Europe, known for its beaches and rugged landscapes.",
            topics: [],
        },
        {
            name: "Algeria",
            description: "The largest country in Africa, located in North Africa.",
            topics: [],
        },
        {
            name: "Andorra",
            description: "A tiny country in the Pyrenees mountains between France and Spain.",
            topics: [],
        },
        {
            name: "Angola",
            description: "A country in Southern Africa, known for its oil reserves and natural beauty.",
            topics: [],
        },
        {
            name: "Antigua and Barbuda",
            description: "A small Caribbean nation known for its pristine beaches and colonial architecture.",
            topics: [],
        },
        {
            name: "Argentina",
            description: "A country in South America, famous for its football and the Pampas grasslands.",
            topics: [],
        },
        {
            name: "Armenia",
            description: "A landlocked country in the Caucasus region, known for its ancient churches and rich culture.",
            topics: [],
        },
        {
            name: "Australia",
            description: "An island continent famous for its unique wildlife, beaches, and the Great Barrier Reef.",
            topics: [],
        },
        {
            name: "Austria",
            description: "A landlocked country in Central Europe, known for its classical music and Alpine landscapes.",
            topics: [],
        },
        {
            name: "Azerbaijan",
            description: "A country in the Caucasus region, rich in oil resources and diverse cultures.",
            topics: [],
        },
        {
            name: "Bahamas",
            description: "An island nation in the Caribbean, known for its white sandy beaches and clear blue waters.",
            topics: [],
        },
        {
            name: "Bahrain",
            description: "A small island country in the Persian Gulf, known for its oil wealth and historical significance.",
            topics: [],
        },
        {
            name: "Bangladesh",
            description: "A densely populated country in South Asia, known for its vibrant culture and river delta.",
            topics: [],
        },
        {
            name: "Barbados",
            description: "An island nation in the Caribbean, famous for its beaches and rum.",
            topics: [],
        },
        {
            name: "Belarus",
            description: "A country in Eastern Europe, known for its forests and Soviet-era monuments.",
            topics: [],
        },
        {
            name: "Belgium",
            description: "A country in Western Europe, famous for its medieval towns, beer, and chocolates.",
            topics: [],
        },
        {
            name: "Belize",
            description: "A small Central American country known for its Caribbean coastline and Mayan ruins.",
            topics: [],
        },
        {
            name: "Benin",
            description: "A West African country known for its historical significance in the Kingdom of Dahomey.",
            topics: [],
        },
        {
            name: "Bhutan",
            description: "A landlocked country in the Himalayas, known for its focus on happiness and sustainability.",
            topics: [],
        },
        {
            name: "Bolivia",
            description: "A landlocked country in South America, known for its Andes Mountains and salt flats.",
            topics: [],
        },
        {
            name: "Bosnia and Herzegovina",
            description: "A country in Southeastern Europe, known for its cultural diversity and Ottoman influence.",
            topics: [],
        },
        {
            name: "Botswana",
            description: "A landlocked country in Southern Africa, famous for its wildlife and the Okavango Delta.",
            topics: [],
        },
        {
            name: "Brazil",
            description: "The largest country in South America, known for its Amazon rainforest and football culture.",
            topics: [],
        },
        {
            name: "Brunei",
            description: "A small, wealthy country on the island of Borneo, known for its oil resources and Islamic culture.",
            topics: [],
        },
        {
            name: "Bulgaria",
            description: "A country in Southeast Europe, known for its historical sites and diverse landscapes.",
            topics: [],
        },
        {
            name: "Burkina Faso",
            description: "A landlocked country in West Africa, known for its cultural diversity and natural resources.",
            topics: [],
        },
        {
            name: "Burundi",
            description: "A small, landlocked country in East Africa, facing challenges related to poverty and conflict.",
            topics: [],
        },
        {
            name: "Cabo Verde",
            description: "An island nation off the coast of West Africa, known for its Creole culture and music.",
            topics: [],
        },
        {
            name: "Cambodia",
            description: "A Southeast Asian country, famous for the Angkor Wat temples and Khmer culture.",
            topics: [],
        },
        {
            name: "Cameroon",
            description: "A country in Central Africa, known for its cultural diversity and natural resources.",
            topics: [],
        },
        {
            name: "Canada",
            description: "The second-largest country in the world, known for its vast landscapes and multicultural population.",
            topics: [],
        },
        {
            name: "Central African Republic",
            description: "A landlocked country in Central Africa, facing political instability and poverty.",
            topics: [],
        },
        {
            name: "Chad",
            description: "A landlocked country in North-Central Africa, known for its deserts and wildlife.",
            topics: [],
        },
        {
            name: "Chile",
            description: "A long, narrow country in South America, famous for its wine and the Andes mountains.",
            topics: [],
        },
        {
            name: "China",
            description: "The most populous country in the world, with a rich history and rapidly growing economy.",
            topics: [],
        },
        {
            name: "Colombia",
            description: "A country in South America known for its coffee, cultural diversity, and beautiful landscapes.",
            topics: [],
        },
        {
            name: "Comoros",
            description: "An island nation off the coast of East Africa, known for its rich marine biodiversity.",
            topics: [],
        },
        {
            name: "Congo, Democratic Republic of the",
            description: "A country in Central Africa, known for its vast rainforests and mineral wealth.",
            topics: [],
        },
        {
            name: "Congo, Republic of the",
            description: "A country in Central Africa, known for its oil reserves and rainforests.",
            topics: [],
        },
        {
            name: "Costa Rica",
            description: "A country in Central America, known for its biodiversity and commitment to environmental conservation.",
            topics: [],
        },
        {
            name: "Croatia",
            description: "A country in Southeastern Europe, famous for its Adriatic coastline and medieval towns.",
            topics: [],
        },
        {
            name: "Cuba",
            description: "An island nation in the Caribbean, known for its communist regime, vibrant culture, and cigars.",
            topics: [],
        },
        {
            name: "Cyprus",
            description: "An island nation in the Eastern Mediterranean, known for its ancient history and beaches.",
            topics: [],
        },
        {
            name: "Czech Republic",
            description: "A country in Central Europe, famous for its castles, beer culture, and history.",
            topics: [],
        },
        {
            name: "Denmark",
            description: "A Nordic country, known for its progressive society, design, and happy population.",
            topics: [],
        },
        {
            name: "Djibouti",
            description: "A small country in the Horn of Africa, known for its strategic location and naval ports.",
            topics: [],
        },
        {
            name: "Dominica",
            description: "A small island nation in the Caribbean, famous for its volcanic landscapes and rainforests.",
            topics: [],
        },
        {
            name: "Dominican Republic",
            description: "An island country in the Caribbean, known for its beaches and resorts.",
            topics: [],
        },
        {
            name: "East Timor",
            description: "A small country in Southeast Asia, known for its pristine beaches and vibrant culture.",
            topics: [],
        },
        {
            name: "Ecuador",
            description: "A country in South America, famous for the Galápagos Islands and the Andes mountains.",
            topics: [],
        },
        {
            name: "Egypt",
            description: "A country in North Africa, famous for its ancient civilization and monuments like the pyramids.",
            topics: [],
        },
        {
            name: "El Salvador",
            description: "A small country in Central America, known for its volcanic landscapes and coffee production.",
            topics: [],
        },
        {
            name: "Equatorial Guinea",
            description: "A small country in Central Africa, known for its oil resources and cultural diversity.",
            topics: [],
        },
        {
            name: "Eritrea",
            description: "A country in the Horn of Africa, known for its Red Sea coastline and historical sites.",
            topics: [],
        },
        {
            name: "Estonia",
            description: "A Baltic country in Northern Europe, known for its medieval architecture and high-tech society.",
            topics: [],
        },
        {
            name: "Eswatini",
            description: "A small country in Southern Africa, known for its traditional monarchy and wildlife reserves.",
            topics: [],
        },
        {
            name: "Ethiopia",
            description: "A country in the Horn of Africa, known for its ancient civilization and diverse cultures.",
            topics: [],
        },
        {
            name: "Fiji",
            description: "An island nation in the South Pacific, known for its coral reefs and tropical climate.",
            topics: [],
        },
        {
            name: "Finland",
            description: "A Nordic country known for its stunning landscapes, saunas, and high standard of living.",
            topics: [],
        },
        {
            name: "France",
            description: "A country in Western Europe, famous for its art, cuisine, and historical landmarks.",
            topics: [],
        },
        {
            name: "Gabon",
            description: "A country in Central Africa, known for its rainforests and oil reserves.",
            topics: [],
        },
        {
            name: "Gambia",
            description: "A small country in West Africa, known for its river and unique geography.",
            topics: [],
        },
        {
            name: "Georgia",
            description: "A country at the intersection of Europe and Asia, known for its ancient wine-making tradition.",
            topics: [],
        },
        {
            name: "Germany",
            description: "A major European country known for its history, economy, and cultural contributions.",
            topics: [],
        },
        {
            name: "Ghana",
            description: "A country in West Africa, known for its gold, cocoa, and vibrant culture.",
            topics: [],
        },
        {
            name: "Greece",
            description: "A country in Southern Europe, famous for its ancient ruins and Mediterranean coastline.",
            topics: [],
        },
        {
            name: "Grenada",
            description: "An island nation in the Caribbean, known for its nutmeg production and stunning beaches.",
            topics: [],
        },
        {
            name: "Guatemala",
            description: "A Central American country, famous for its ancient Mayan ruins and colorful markets.",
            topics: [],
        },
        {
            name: "Guinea",
            description: "A country in West Africa, known for its mineral resources and diverse cultures.",
            topics: [],
        },
        {
            name: "Guinea-Bissau",
            description: "A country in West Africa, known for its beaches and historical significance.",
            topics: [],
        },
        {
            name: "Guyana",
            description: "A country in South America, known for its rainforests and the Essequibo River.",
            topics: [],
        },
        {
            name: "Haiti",
            description: "A Caribbean country, known for its history of revolution and cultural resilience.",
            topics: [],
        },
        {
            name: "Honduras",
            description: "A Central American country, known for its Mayan ruins and natural resources.",
            topics: [],
        },
        {
            name: "Hungary",
            description: "A landlocked country in Central Europe, known for its rich cultural heritage and thermal baths.",
            topics: [],
        },
        {
            name: "Iceland",
            description: "A Nordic country known for its dramatic landscapes, volcanoes, and geothermal energy.",
            topics: [],
        },
        {
            name: "India",
            description: "A vast country in South Asia, known for its rich culture, history, and diverse religions.",
            topics: [],
        },
        {
            name: "Indonesia",
            description: "An island nation in Southeast Asia, famous for its tropical climate and biodiversity.",
            topics: [],
        },
        {
            name: "Iran",
            description: "A country in the Middle East, known for its ancient civilization and oil resources.",
            topics: [],
        },
        {
            name: "Iraq",
            description: "A country in the Middle East, known for its historical significance and rich culture.",
            topics: [],
        },
        {
            name: "Ireland",
            description: "An island nation in Western Europe, famous for its green landscapes, pubs, and folklore.",
            topics: [],
        },
        {
            name: "Israel",
            description: "A country in the Middle East, known for its historical and religious significance.",
            topics: [],
        },
        {
            name: "Italy",
            description: "A country in Southern Europe, famous for its art, architecture, and cuisine.",
            topics: [],
        },
        {
            name: "Jamaica",
            description: "An island nation in the Caribbean, known for its music, culture, and beaches.",
            topics: [],
        },
        {
            name: "Japan",
            description: "An island nation in East Asia, known for its technology, culture, and natural beauty.",
            topics: [],
        },
        {
            name: "Jordan",
            description: "A country in the Middle East, known for its ancient landmarks like Petra and the Dead Sea.",
            topics: [],
        },
        {
            name: "Kazakhstan",
            description: "A large landlocked country in Central Asia, known for its vast steppes and oil resources.",
            topics: [],
        },
        {
            name: "Kenya",
            description: "A country in East Africa, known for its wildlife safaris and natural beauty.",
            topics: [],
        },
        {
            name: "Kiribati",
            description: "A small island nation in the Pacific Ocean, facing challenges due to climate change.",
            topics: [],
        },
        {
            name: "Korea, North",
            description: "A country in East Asia, known for its authoritarian regime and history of conflict.",
            topics: [],
        },
        {
            name: "Korea, South",
            description: "A country in East Asia, known for its technology, culture, and economy.",
            topics: [],
        },
        {
            name: "Kuwait",
            description: "A small country in the Middle East, known for its oil reserves and wealthy economy.",
            topics: [],
        },
        {
            name: "Kyrgyzstan",
            description: "A country in Central Asia, known for its mountains and nomadic culture.",
            topics: [],
        },
        {
            name: "Laos",
            description: "A landlocked country in Southeast Asia, known for its Buddhist culture and natural beauty.",
            topics: [],
        },
        {
            name: "Latvia",
            description: "A Baltic country in Northern Europe, known for its medieval architecture and forests.",
            topics: [],
        },
        {
            name: "Lebanon",
            description: "A small country in the Middle East, known for its history, culture, and Mediterranean coastline.",
            topics: [],
        },
        {
            name: "Lesotho",
            description: "A landlocked country in Southern Africa, known for its mountainous terrain and wool production.",
            topics: [],
        },
        {
            name: "Liberia",
            description: "A country in West Africa, known for its history as a settlement for freed American slaves.",
            topics: [],
        },
        {
            name: "Libya",
            description: "A country in North Africa, known for its oil reserves and political instability.",
            topics: [],
        },
        {
            name: "Liechtenstein",
            description: "A small country in Central Europe, known for its wealth, banking industry, and medieval castles.",
            topics: [],
        },
        {
            name: "Lithuania",
            description: "A Baltic country in Northern Europe, known for its medieval architecture and culture.",
            topics: [],
        },
        {
            name: "Luxembourg",
            description: "A small, wealthy country in Western Europe, known for its banking sector and castles.",
            topics: [],
        },
        {
            name: "Madagascar",
            description: "An island country off the coast of Africa, known for its unique wildlife and rainforests.",
            topics: [],
        },
        {
            name: "Malawi",
            description: "A landlocked country in Southeast Africa, known for its lakes and wildlife.",
            topics: [],
        },
        {
            name: "Malaysia",
            description: "A country in Southeast Asia, known for its modern cities and tropical rainforests.",
            topics: [],
        },
        {
            name: "Maldives",
            description: "An island nation in the Indian Ocean, famous for its luxury resorts and coral reefs.",
            topics: [],
        },
        {
            name: "Mali",
            description: "A country in West Africa, known for its ancient culture and desert landscapes.",
            topics: [],
        },
        {
            name: "Malta",
            description: "An island nation in the Mediterranean, known for its history and beaches.",
            topics: [],
        },
        {
            name: "Marshall Islands",
            description: "An island country in the Pacific Ocean, known for its tropical climate and marine life.",
            topics: [],
        },
        {
            name: "Mauritania",
            description: "A country in West Africa, known for its desert landscapes and ancient history.",
            topics: [],
        },
        {
            name: "Mauritius",
            description: "An island nation in the Indian Ocean, known for its beaches, reefs, and luxury resorts.",
            topics: [],
        },
        {
            name: "Mexico",
            description: "A country in North America, known for its rich culture, history, and cuisine.",
            topics: [],
        },
        {
            name: "Micronesia",
            description: "A country in the Pacific Ocean, known for its islands and unique culture.",
            topics: [],
        },
        {
            name: "Moldova",
            description: "A landlocked country in Eastern Europe, known for its wine production and Soviet-era influence.",
            topics: [],
        },
        {
            name: "Monaco",
            description: "A small, wealthy country on the Mediterranean coast, known for its casinos and luxury.",
            topics: [],
        },
        {
            name: "Mongolia",
            description: "A country in East Asia, known for its vast steppes, nomadic culture, and history.",
            topics: [],
        },
        {
            name: "Montenegro",
            description: "A small country in Southeastern Europe, known for its Adriatic coast and rugged mountains.",
            topics: [],
        },
        {
            name: "Morocco",
            description: "A country in North Africa, known for its deserts, mountains, and ancient cities.",
            topics: [],
        },
        {
            name: "Mozambique",
            description: "A country in Southeast Africa, known for its Indian Ocean coastline and wildlife.",
            topics: [],
        },
        {
            name: "Myanmar",
            description: "A country in Southeast Asia, known for its Buddhist culture and colonial architecture.",
            topics: [],
        },
        {
            name: "Namibia",
            description: "A country in Southern Africa, known for its deserts and wildlife reserves.",
            topics: [],
        },
        {
            name: "Nauru",
            description: "The smallest country in the world, located in the Pacific Ocean, known for its phosphate mining.",
            topics: [],
        },
        {
            name: "Nepal",
            description: "A country in the Himalayas, known for its mountains and being the home of Mount Everest.",
            topics: [],
        },
        {
            name: "Netherlands",
            description: "A country in Western Europe, known for its tulips, windmills, and canals.",
            topics: [],
        },
        {
            name: "New Zealand",
            description: "An island nation in the Pacific Ocean, known for its nature, indigenous culture, and movie industry.",
            topics: [],
        },
        {
            name: "Nicaragua",
            description: "A country in Central America, known for its volcanic landscapes and colonial architecture.",
            topics: [],
        },
        {
            name: "Niger",
            description: "A landlocked country in West Africa, known for its desert landscapes and rich history.",
            topics: [],
        },
        {
            name: "Nigeria",
            description: "A country in West Africa, known for its large population, oil reserves, and vibrant culture.",
            topics: [],
        },
        {
            name: "North Macedonia",
            description: "A country in Southeast Europe, known for its lakes and ancient history.",
            topics: [],
        },
        {
            name: "Norway",
            description: "A Nordic country known for its fjords, mountains, and high quality of life.",
            topics: [],
        },
        {
            name: "Oman",
            description: "A country on the Arabian Peninsula, known for its desert landscapes and historic architecture.",
            topics: [],
        },
        {
            name: "Pakistan",
            description: "A country in South Asia, known for its diverse landscapes, culture, and rich history.",
            topics: [],
        },
        {
            name: "Palau",
            description: "An island country in the Pacific Ocean, famous for its biodiversity and diving spots.",
            topics: [],
        },
        {
            name: "Panama",
            description: "A country in Central America, famous for the Panama Canal and its beaches.",
            topics: [],
        },
        {
            name: "Papua New Guinea",
            description: "A country in Oceania, known for its biodiversity and indigenous cultures.",
            topics: [],
        },
        {
            name: "Paraguay",
            description: "A landlocked country in South America, known for its rivers and unique culture.",
            topics: [],
        },
        {
            name: "Peru",
            description: "A country in South America, known for its ancient Incan history and the Andes mountains.",
            topics: [],
        },
        {
            name: "Philippines",
            description: "An island nation in Southeast Asia, known for its beaches, wildlife, and history.",
            topics: [],
        },
        {
            name: "Poland",
            description: "A country in Central Europe, known for its history, culture, and scenic landscapes.",
            topics: [],
        },
        {
            name: "Portugal",
            description: "A country in Southern Europe, known for its beaches, wines, and historical landmarks.",
            topics: [],
        },
        {
            name: "Qatar",
            description: "A wealthy country in the Middle East, known for its oil reserves and modern architecture.",
            topics: [],
        },
        {
            name: "Romania",
            description: "A country in Eastern Europe, known for its castles, mountains, and rich history.",
            topics: [],
        },
        {
            name: "Russia",
            description: "The largest country in the world, spanning Eastern Europe and Asia, known for its history, culture, and landscapes.",
            topics: [],
        },
        {
            name: "Rwanda",
            description: "A country in East Africa, known for its wildlife, including mountain gorillas, and its recovery from the 1994 genocide.",
            topics: [],
        },
        {
            name: "Saint Kitts and Nevis",
            description: "A two-island nation in the Caribbean, known for its volcanic landscapes and beaches.",
            topics: [],
        },
        {
            name: "Saint Lucia",
            description: "An island nation in the Caribbean, known for its volcanic peaks and luxury resorts.",
            topics: [],
        },
        {
            name: "Saint Vincent and the Grenadines",
            description: "An island nation in the Caribbean, known for its sailing and beaches.",
            topics: [],
        },
        {
            name: "Samoa",
            description: "An island nation in the Pacific Ocean, known for its Polynesian culture and beautiful beaches.",
            topics: [],
        },
        {
            name: "San Marino",
            description: "One of the world's oldest republics, located in Italy, known for its medieval architecture.",
            topics: [],
        },
        {
            name: "Sao Tome and Principe",
            description: "An island nation in the Gulf of Guinea, known for its cocoa production and tropical climate.",
            topics: [],
        },
        {
            name: "Saudi Arabia",
            description: "A country in the Middle East, known for its oil reserves, Islamic history, and desert landscapes.",
            topics: [],
        },
        {
            name: "Senegal",
            description: "A country in West Africa, known for its beaches, cultural heritage, and music.",
            topics: [],
        },
        {
            name: "Serbia",
            description: "A country in Southeastern Europe, known for its medieval history and vibrant culture.",
            topics: [],
        },
        {
            name: "Seychelles",
            description: "An island nation in the Indian Ocean, known for its beaches and marine biodiversity.",
            topics: [],
        },
        {
            name: "Sierra Leone",
            description: "A country in West Africa, known for its beaches, natural resources, and history of conflict.",
            topics: [],
        },
        {
            name: "Singapore",
            description: "A city-state in Southeast Asia, known for its cleanliness, economy, and cultural diversity.",
            topics: [],
        },
        {
            name: "Slovakia",
            description: "A landlocked country in Central Europe, known for its castles, mountains, and culture.",
            topics: [],
        },
        {
            name: "Slovenia",
            description: "A small country in Central Europe, known for its mountains, lakes, and history.",
            topics: [],
        },
        {
            name: "Solomon Islands",
            description: "An island nation in the Pacific Ocean, known for its WWII history and marine biodiversity.",
            topics: [],
        },
        {
            name: "Somalia",
            description: "A country in the Horn of Africa, known for its coastline and cultural history.",
            topics: [],
        },
        {
            name: "South Africa",
            description: "A country in Southern Africa, known for its diverse culture, wildlife, and history.",
            topics: [],
        },
        {
            name: "South Sudan",
            description: "The world's newest country, located in East-Central Africa, facing ongoing conflicts.",
            topics: [],
        },
        {
            name: "Spain",
            description: "A country in Southwestern Europe, known for its history, culture, and beautiful landscapes.",
            topics: [],
        },
        {
            name: "Sri Lanka",
            description: "An island country in South Asia, known for its beaches, wildlife, and Buddhist heritage.",
            topics: [],
        },
        {
            name: "Sudan",
            description: "A country in North-East Africa, known for its ancient history and political struggles.",
            topics: [],
        },
        {
            name: "Suriname",
            description: "A country in South America, known for its rainforests and diverse culture.",
            topics: [],
        },
        {
            name: "Sweden",
            description: "A Nordic country, known for its welfare system, forests, and historical sites.",
            topics: [],
        },
        {
            name: "Switzerland",
            description: "A landlocked country in Europe, known for its neutrality, banking system, and mountains.",
            topics: [],
        },
        {
            name: "Syria",
            description: "A country in the Middle East, known for its ancient history and ongoing civil war.",
            topics: [],
        },
        {
            name: "Taiwan",
            description: "A self-governing island nation in East Asia, known for its technology and cultural influences.",
            topics: [],
        },
        {
            name: "Tajikistan",
            description: "A landlocked country in Central Asia, known for its mountains and Persian heritage.",
            topics: [],
        },
        {
            name: "Tanzania",
            description: "A country in East Africa, known for its wildlife reserves, including Serengeti National Park.",
            topics: [],
        },
        {
            name: "Thailand",
            description: "A country in Southeast Asia, known for its beaches, temples, and vibrant street life.",
            topics: [],
        },
        {
            name: "Togo",
            description: "A country in West Africa, known for its beaches and cultural diversity.",
            topics: [],
        },
        {
            name: "Tonga",
            description: "An island nation in the South Pacific, known for its monarchy and tropical beauty.",
            topics: [],
        },
        {
            name: "Trinidad and Tobago",
            description: "An island nation in the Caribbean, known for its carnival and diverse culture.",
            topics: [],
        },
        {
            name: "Tunisia",
            description: "A country in North Africa, known for its Mediterranean beaches and ancient ruins.",
            topics: [],
        },
        {
            name: "Turkey",
            description: "A country straddling Eastern Europe and Asia, known for its culture, history, and food.",
            topics: [],
        },
        {
            name: "Turkmenistan",
            description: "A country in Central Asia, known for its deserts and gas reserves.",
            topics: [],
        },
        {
            name: "Tuvalu",
            description: "One of the smallest countries in the world, known for its islands and climate change challenges.",
            topics: [],
        },
        {
            name: "Uganda",
            description: "A country in East Africa, known for its wildlife, including mountain gorillas.",
            topics: [],
        },
        {
            name: "Ukraine",
            description: "A country in Eastern Europe, known for its history, culture, and political conflict.",
            topics: [],
        },
        {
            name: "United Arab Emirates",
            description: "A country in the Arabian Peninsula, known for its modern cities and oil wealth.",
            topics: [],
        },
        {
            name: "United Kingdom",
            description: "A country in Western Europe, known for its monarchy, history, and cultural contributions.",
            topics: [],
        },
        {
            name: "United States",
            description: "A country in North America, known for its global influence, economy, and diverse landscapes.",
            topics: [],
        },
        {
            name: "Uruguay",
            description: "A small country in South America, known for its beaches, politics, and football culture.",
            topics: [],
        },
        {
            name: "Uzbekistan",
            description: "A landlocked country in Central Asia, known for its Silk Road heritage and deserts.",
            topics: [],
        },
        {
            name: "Vanuatu",
            description: "An island nation in the Pacific Ocean, known for its volcanic landscapes and indigenous culture.",
            topics: [],
        },
        {
            name: "Vatican City",
            description: "The smallest country in the world, an independent city-state located within Rome, Italy.",
            topics: [],
        },
        {
            name: "Venezuela",
            description: "A country in South America, known for its oil reserves and political instability.",
            topics: [],
        },
        {
            name: "Vietnam",
            description: "A country in Southeast Asia, known for its history, food, and landscapes.",
            topics: [],
        },
        {
            name: "Yemen",
            description: "A country in the Arabian Peninsula, known for its ancient history and ongoing conflict.",
            topics: [],
        },
        {
            name: "Zambia",
            description: "A landlocked country in Southern Africa, known for its wildlife and Victoria Falls.",
            topics: [],
        },
        {
            name: "Zimbabwe",
            description: "A country in Southern Africa, known for its wildlife and political history.",
            topics: [],
        },
    ];
    const popCultureRooms = [
        {
            name: "Hollywood Hits",
            description: "Guess acronyms inspired by blockbuster movies and famous Hollywood dialogues.",
        },
        {
            name: "TV Time",
            description: "Decode acronyms based on popular TV shows and their iconic moments.",
        },
        {
            name: "Chart-Topping Tunes",
            description: "Uncover acronyms from hit songs, artists, and music genres.",
        },
        {
            name: "Internet Memes",
            description: "Crack acronyms from viral memes and internet sensations.",
        },
        {
            name: "Slang Savvy",
            description: "Test your knowledge of trendy texting and social media slang.",
        },
        {
            name: "Streaming Stars",
            description: "Guess acronyms from famous series and characters on streaming platforms.",
        },
        {
            name: "Pop Icons",
            description: "Identify acronyms related to legendary pop culture figures and celebrities.",
        },
        {
            name: "Award Season",
            description: "Explore acronyms tied to award-winning movies, shows, and performances.",
        },
        {
            name: "Fandom Frenzy",
            description: "Guess acronyms from famous fan bases and their beloved franchises.",
        },
        {
            name: "Classic Cinema",
            description: "Decode acronyms from timeless movies and classic Hollywood.",
        },
        {
            name: "Social Media Buzz",
            description: "Uncover acronyms from trending hashtags and viral challenges.",
        },
        {
            name: "Gaming Glory",
            description: "Identify acronyms from iconic video games and esports legends.",
        },
        {
            name: "Retro Vibes",
            description: "Guess acronyms inspired by 80s and 90s pop culture.",
        },
        {
            name: "Blockbuster Bonanza",
            description: "Decode acronyms from the biggest box office hits of all time.",
        },
        {
            name: "Lyrics Labyrinth",
            description: "Unravel acronyms hidden in famous song lyrics.",
        },
        {
            name: "Animated Adventures",
            description: "Guess acronyms from beloved animated movies and series.",
        },
        {
            name: "Comedy Gold",
            description: "Identify acronyms from iconic comedians and hilarious sitcoms.",
        },
        {
            name: "Drama Queens",
            description: "Decode acronyms tied to emotional TV dramas and soap operas.",
        },
        {
            name: "Fashion Faves",
            description: "Uncover acronyms related to iconic fashion moments and designers.",
        },
        {
            name: "Romantic Classics",
            description: "Guess acronyms from beloved romantic movies and songs.",
        },
        {
            name: "Streaming Craze",
            description: "Decode acronyms from trending shows and movies on streaming platforms.",
        },
        {
            name: "Sci-Fi Spectacles",
            description: "Identify acronyms from legendary sci-fi movies and franchises.",
        },
        {
            name: "Fantasy Fandom",
            description: "Unravel acronyms from magical worlds and fantasy sagas.",
        },
        {
            name: "Superhero Spotlight",
            description: "Guess acronyms tied to superheroes and their epic adventures.",
        },
        {
            name: "Reality TV Drama",
            description: "Decode acronyms from famous reality shows and their stars.",
        },
        {
            name: "Villain Vault",
            description: "Identify acronyms from iconic villains and their evil plans.",
        },
        {
            name: "Musical Legends",
            description: "Guess acronyms from legendary bands and solo artists.",
        },
        {
            name: "Teen Trends",
            description: "Decode acronyms from shows, movies, and slang popular among teens.",
        },
        {
            name: "Horror Haven",
            description: "Identify acronyms from spine-chilling horror movies and stories.",
        },
        {
            name: "Adventure Awaits",
            description: "Unravel acronyms tied to epic adventure movies and characters.",
        },
        {
            name: "Action Packed",
            description: "Guess acronyms from thrilling action movies and series.",
        },
        {
            name: "K-Pop Craze",
            description: "Decode acronyms from famous K-Pop groups and songs.",
        },
        {
            name: "Bollywood Beats",
            description: "Identify acronyms from iconic Bollywood movies and stars.",
        },
        {
            name: "Slang Central",
            description: "Guess acronyms from global slang and internet culture.",
        },
        {
            name: "Dance Floor Anthems",
            description: "Decode acronyms from famous party and dance songs.",
        },
        {
            name: "Award Show Icons",
            description: "Identify acronyms from unforgettable award show moments.",
        },
        {
            name: "Cult Classics",
            description: "Unravel acronyms from movies and shows with a cult following.",
        },
        {
            name: "Fantasy TV Tales",
            description: "Guess acronyms from magical TV shows and their characters.",
        },
        {
            name: "Sitcom Spotlight",
            description: "Decode acronyms from beloved sitcoms and their hilarious casts.",
        },
        {
            name: "True Crime Stories",
            description: "Identify acronyms from gripping true crime series and podcasts.",
        },
        {
            name: "Digital Influencers",
            description: "Guess acronyms from famous YouTubers and TikTok stars.",
        },
        {
            name: "Streaming Binge",
            description: "Decode acronyms tied to binge-worthy shows and series.",
        },
        {
            name: "Texting Trends",
            description: "Unravel acronyms from modern texting habits and emojis.",
        },
        {
            name: "Inspirational Icons",
            description: "Guess acronyms from motivational figures in pop culture.",
        },
        {
            name: "Gamer's Galaxy",
            description: "Decode acronyms from iconic games and online communities.",
        },
        {
            name: "Epic Sagas",
            description: "Identify acronyms from long-running TV and movie franchises.",
        },
        {
            name: "Music Madness",
            description: "Guess acronyms from top-charting songs and album titles.",
        },
        {
            name: "Virtual Celebrities",
            description: "Decode acronyms tied to avatars and virtual influencers.",
        },
    ];
    const footballGameRooms = [
        {
            name: "Goal Masters",
            description: "Show your soccer knowledge and outscore your rivals!",
        },
        {
            name: "Kickoff Clash",
            description: "A thrilling room for ultimate football trivia battles.",
        },
        {
            name: "Penalty Pros",
            description: "Test your skills in a room inspired by penalty shootouts.",
        },
        {
            name: "Dribble Kings",
            description: "Compete in a game room focused on dribbling legends.",
        },
        {
            name: "FIFA Frenzy",
            description: "Take on FIFA-themed challenges and claim victory!",
        },
        {
            name: "Champions Arena",
            description: "Enter a room celebrating the greatest Champions League moments.",
        },
        {
            name: "World Cup Wizards",
            description: "Prove your expertise in World Cup history and facts.",
        },
        {
            name: "Striker's Zone",
            description: "A room dedicated to the most iconic goal scorers in football.",
        },
        {
            name: "Legendary Boots",
            description: "Answer questions about the greatest players of all time.",
        },
        {
            name: "Tactics Board",
            description: "A game room for football strategy and tactics enthusiasts.",
        },
    ];
    const nigeriaStateRooms = [
        { name: "Abia Braves", description: "Join the game in God's Own State." },
        {
            name: "Adamawa Kickers",
            description: "Test your skills in the Land of Beauty.",
        },
        { name: "Akwa Ibom Stars", description: "Play in the Land of Promise." },
        {
            name: "Anambra Kings",
            description: "Compete in the Light of the Nation.",
        },
        { name: "Bauchi Strikers", description: "Battle in the Pearl of Tourism." },
        {
            name: "Bayelsa United",
            description: "Challenge yourself in the Glory of All Lands.",
        },
        {
            name: "Benue Warriors",
            description: "Compete in the Food Basket of the Nation.",
        },
        {
            name: "Borno Knights",
            description: "Join the fun in the Home of Peace.",
        },
        {
            name: "Cross River Legends",
            description: "Explore the Land of Tourism.",
        },
        {
            name: "Delta Diamonds",
            description: "Shine in the Big Heart of the Nation.",
        },
        {
            name: "Ebonyi Titans",
            description: "Compete in the Salt of the Nation.",
        },
        { name: "Edo Royals", description: "Play in the Heartbeat of the Nation." },
        {
            name: "Ekiti Champs",
            description: "Join the game in the Land of Honor.",
        },
        {
            name: "Enugu Flames",
            description: "Challenge yourself in the Coal City State.",
        },
        {
            name: "Gombe Falcons",
            description: "Play in the Jewel in the Savannah.",
        },
        {
            name: "Imo Stallions",
            description: "Join the fun in the Eastern Heartland.",
        },
        { name: "Jigawa Jets", description: "Fly high in the New World." },
        { name: "Kaduna Warriors", description: "Play in the Centre of Learning." },
        { name: "Kano Rovers", description: "Explore the Centre of Commerce." },
        {
            name: "Katsina Stars",
            description: "Shine bright in the Home of Hospitality.",
        },
        { name: "Kebbi Tigers", description: "Battle in the Land of Equity." },
        { name: "Kogi Strikers", description: "Compete in the Confluence State." },
        {
            name: "Kwara Falcons",
            description: "Soar high in the State of Harmony.",
        },
        { name: "Lagos Legends", description: "Play in the Centre of Excellence." },
        {
            name: "Nasarawa Lions",
            description: "Join the game in the Home of Solid Minerals.",
        },
        { name: "Niger Gladiators", description: "Compete in the Power State." },
        { name: "Ogun Giants", description: "Battle in the Gateway State." },
        { name: "Ondo Trailblazers", description: "Explore the Sunshine State." },
        { name: "Osun Wizards", description: "Play in the Land of Virtue." },
        { name: "Oyo Masters", description: "Compete in the Pace Setter State." },
        {
            name: "Plateau Heroes",
            description: "Explore the Home of Peace and Tourism.",
        },
        {
            name: "Rivers Sharks",
            description: "Join the game in the Treasure Base of the Nation.",
        },
        {
            name: "Sokoto Wolves",
            description: "Play in the Seat of the Caliphate.",
        },
        {
            name: "Taraba Legends",
            description: "Compete in the Nature's Gift to the Nation.",
        },
        {
            name: "Yobe Eagles",
            description: "Soar high in the Pride of the Sahel.",
        },
        {
            name: "Zamfara Hawks",
            description: "Challenge yourself in the Home of Agricultural Products.",
        },
        {
            name: "FCT Titans",
            description: "Join the game in the Centre of Unity.",
        },
    ];
    const scienceRooms = [
        {
            name: "Physics Pioneers",
            description: "Explore the wonders of motion, energy, and matter.",
        },
        {
            name: "Chemistry Lab",
            description: "Dive into the world of atoms, elements, and reactions.",
        },
        {
            name: "Biology Explorers",
            description: "Uncover the mysteries of life and living organisms.",
        },
        {
            name: "Space Odyssey",
            description: "Journey through the cosmos and explore the universe.",
        },
        {
            name: "Earth Science Hub",
            description: "Learn about the planet's structure, climate, and history.",
        },
        {
            name: "Genetics Lab",
            description: "Discover the secrets of DNA and the code of life.",
        },
        {
            name: "Tech Wizards",
            description: "Innovate with cutting-edge technology and inventions.",
        },
        {
            name: "Environmental Quest",
            description: "Understand ecosystems and the importance of sustainability.",
        },
        {
            name: "Quantum Realm",
            description: "Enter the mind-bending world of quantum physics.",
        },
        {
            name: "Astronomy Club",
            description: "Gaze at the stars and uncover celestial secrets.",
        },
        {
            name: "Robotics Arena",
            description: "Build and program the machines of the future.",
        },
        {
            name: "Medical Marvels",
            description: "Learn about breakthroughs in health and medicine.",
        },
        {
            name: "Geology Rocks",
            description: "Study the Earth's rocks, minerals, and natural phenomena.",
        },
        {
            name: "AI Frontiers",
            description: "Explore artificial intelligence and machine learning.",
        },
        {
            name: "Science Trivia",
            description: "Test your knowledge with fun and challenging science facts.",
        },
    ];
    const mindMashGames = [
        {
            name: "TypeMania",
            description: "A fast-paced typing game where players compete to type words or phrases as quickly and accurately as possible.",
        },
        {
            name: "Hangman",
            description: "A classic word-guessing game where players try to reveal a hidden word by guessing one letter at a time before running out of attempts.",
        },
        {
            name: "Anagram",
            description: "A challenging word puzzle game where players rearrange letters to form new words or phrases.",
        },
        {
            name: "Unscramble",
            description: "A fun and engaging game where players unscramble jumbled letters to discover the correct word or phrase.",
        },
        {
            name: "WordMaker",
            description: "Given a base word, form as many smaller words as possible using its letters. A fun and challenging game to test your vocabulary skills!",
        },
        {
            name: "LuckyFlip",
            description: "This game combines excitement with unpredictability, making it perfect for casual gamers and risk-takers alike.",
        },
        {
            name: "LuckyWhiz",
            description: "A game of luck and logic, where you make quick decisions to win. Guess correctly and rise to the top!",
        },
        {
            name: "LuckySpin",
            description: "Spin the wheel of fortune and guess the word or number! The more you play, the luckier you get!",
        },
    ];
    const typeManiaRooms = [
        {
            name: "Speed Racer",
            description: "Race against the clock to type words as quickly as possible.",
        },
        {
            name: "Perfect Precision",
            description: "Type each word with accuracy to score high without any mistakes.",
        },
        {
            name: "Rapid Fire",
            description: "A fast-paced typing challenge where every second counts!",
        },
        {
            name: "Accuracy Master",
            description: "Focus on typing correctly and fast to outpace your competitors.",
        },
        {
            name: "Timed Typist",
            description: "Type as many words as you can in the shortest time possible!",
        },
    ];
    const hangManRooms = [
        {
            name: "Classic Hangout",
            description: "Test your vocabulary skills with classic hangman challenges.",
        },
        {
            name: "Mystery Words",
            description: "Guess the hidden words in this thrilling hangman experience.",
        },
        {
            name: "Speed Hangman",
            description: "Race against the clock to solve hangman puzzles.",
        },
        {
            name: "Trivia Hangman",
            description: "Combine trivia knowledge with hangman fun in this unique room.",
        },
        {
            name: "Themed Hangman",
            description: "Enjoy hangman games with themes like movies, sports, and more.",
        },
    ];
    const anagramGameRooms = [
        {
            name: "Anagram Arena",
            description: "Compete with others to solve anagrams and climb the leaderboard.",
        },
        {
            name: "Word Shuffle",
            description: "Unravel the mystery of shuffled letters in this exciting game room.",
        },
        {
            name: "Quick Race",
            description: "Race against the clock to unscramble words and earn points.",
        },
        {
            name: "Letter Twist",
            description: "Test your word skills in a series of challenging anagram puzzles.",
        },
        {
            name: "Anagram Blitz",
            description: "A fast-paced anagram-solving room for the ultimate wordsmiths.",
        },
    ];
    const unscrambleGameRooms = [
        {
            name: "Unscramble Frenzy",
            description: "Solve scrambled words in a high-energy, competitive environment.",
        },
        {
            name: "Word Unjumble",
            description: "Relax and unscramble words at your own pace in this casual room.",
        },
        {
            name: "Unscramble Quest",
            description: "Embark on a journey through progressively harder unscramble challenges.",
        },
        {
            name: "Puzzle Unscramble",
            description: "Test your brainpower by solving intricate scrambled word puzzles.",
        },
        {
            name: "Speed Unscramble",
            description: "Compete against the clock to unscramble words and set records.",
        },
    ];
    const luckyFlipGameRooms = [
        {
            name: "Fortune",
            description: "Test your luck in the Fortune room, where every flip could lead to massive rewards or unexpected surprises.",
        },
        {
            name: "Blaze",
            description: "Step into Blaze, a high-energy room where the stakes are hot, and the rewards are even hotter!",
        },
        {
            name: "Goldmine",
            description: "Explore Goldmine, where each flip uncovers hidden treasures and massive multipliers.",
        },
        {
            name: "Spark",
            description: "Light up your luck in Spark, a quick-paced room designed for instant thrills and big wins.",
        },
        {
            name: "Mystic",
            description: "Unveil the unknown in Mystic, a room filled with secrets and magical rewards waiting to be discovered.",
        },
    ];
    const wordMakerGameRooms = [
        {
            name: "WordMaker Playground",
            description: "Build as many words as possible from random sets of letters.",
        },
        {
            name: "Letter Crafter",
            description: "Combine letters to craft unique and high-scoring words.",
        },
        {
            name: "WordMaker Blitz",
            description: "A fast-paced game where quick thinking makes you a word master.",
        },
        {
            name: "Letter Alchemy",
            description: "Transform scrambled letters into powerful words in this magical room.",
        },
        {
            name: "WordMaster Workshop",
            description: "Hone your word-making skills and outsmart your opponents.",
        },
    ];
    const luckyWhizGameRooms = [
        {
            name: "Whiz Fortune",
            description: "Test your luck and knowledge in this exciting game of chance.",
        },
        {
            name: "Trivia Jackpot",
            description: "Spin the wheel and answer trivia for a chance to hit the jackpot.",
        },
        {
            name: "Lucky Genius",
            description: "Combine your wits and luck to outshine your opponents.",
        },
        {
            name: "Fortune Frenzy",
            description: "A high-stakes game where luck and quick thinking are your best allies.",
        },
        {
            name: "Spin & Win",
            description: "Spin the wheel, answer questions, and claim your winnings!",
        },
    ];
    const luckySpinGameRooms = [
        {
            name: "Spin Mania",
            description: "Spin the wheel and win big rewards in this thrilling game room.",
        },
        {
            name: "Wheel of Fortune",
            description: "Test your luck and take a chance to claim amazing prizes.",
        },
        {
            name: "Lucky Spins Galore",
            description: "Endless spins and endless fun in this ultimate lucky spin challenge.",
        },
        {
            name: "Fortune Spin",
            description: "Step up, spin the wheel, and let fortune decide your fate.",
        },
        {
            name: "Golden Wheel",
            description: "A high-stakes spinning game where luck is the ultimate treasure.",
        },
    ];
    // await prisma.gameRoom.createMany({ data: luckyFlipGameRooms.map(p => ({...p, catId: "cm5v9hv6200008aox1sjuemwv" }))})
    // console.log("Data created")
    // await prisma.gameCategory.createMany({ data: mindMashGames.map((item) => ({...item, gameId: "cm58umo4c0000cniowaf6gc5c" }))});
    // console.log("Data created")
});
const executeRecords = () => __awaiter(void 0, void 0, void 0, function* () {
    // await insertPlanFeatures()
    // await prisma.user.deleteMany();
    // await createDummyUsers();
    // await createDummyRedisMonthlyScoreRecord()
    // await deleteAllRecords()
    // clearRedisKeysByPattern(`player:*:category:*:2024:12:today:3`)
    // await getTopRankingPlayersOfTheYearByCategory();
    yield addGameCategories();
});
executeRecords();
