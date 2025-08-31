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
exports.calculateWordMakerPlayerScore = exports.composeGameAnswer = exports.getGameCatType = exports.getGameType = exports.getCategoryRankingPlayerData = exports.getRewardTopRankingPlayers = exports.syncPrismaSenderRecipientWalletToRedis = exports.syncRedisSenderRecipientWalletToPrisma = exports.syncPrismaUserWalletToRedis = exports.syncRedisUserWalletToPrisma = exports.getRedisHashKey = void 0;
const db_1 = __importDefault(require("@/db"));
const redis_1 = __importDefault(require("@/redis"));
const _types_1 = require("@/@types");
const utils_1 = require("@/utils");
const wordlist_english_1 = __importDefault(require("wordlist-english")); // ES Modules
const getRedisHashKey = (key) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield redis_1.default.hGetAll(key);
    if (Object.values(result).length === 0)
        return null;
    return (0, utils_1.parseStringNumbers)(result);
});
exports.getRedisHashKey = getRedisHashKey;
const syncRedisUserWalletToPrisma = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // check and sync the sender redis wallet to prisma
        const walletKey = `user:${userId}:wallet`;
        const exists = yield redis_1.default.exists(walletKey);
        if (exists !== 0) {
            const redisWallet = yield (0, exports.getRedisHashKey)(walletKey);
            if (redisWallet) {
                // sync user redis and prisma wallet
                yield db_1.default.wallet.update({
                    where: { id: redisWallet.id, userId: redisWallet.userId },
                    data: {
                        credit: redisWallet.credit,
                        coins: redisWallet.amount,
                        bonus: redisWallet.bonus,
                    },
                });
            }
        }
        return { message: "Success", isError: false };
    }
    catch (error) {
        return { message: error === null || error === void 0 ? void 0 : error.message, isError: true };
    }
});
exports.syncRedisUserWalletToPrisma = syncRedisUserWalletToPrisma;
const syncPrismaUserWalletToRedis = (userId, userWallet) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // check and sync the sender redis wallet to prisma
        const walletKey = `user:${userId}:wallet`;
        const exists = yield redis_1.default.exists(walletKey);
        if (exists !== 0) {
            // check and sync the sender prisma wallet to redis
            yield Promise.all([
                redis_1.default.hSet(walletKey, "credit", userWallet.credit.toFixed(2)),
                redis_1.default.hSet(walletKey, "amount", userWallet.coins.toFixed(2)),
                redis_1.default.hSet(walletKey, "bonus", userWallet.bonus.toFixed(2)),
            ]);
        }
        return { message: "Success", isError: false };
    }
    catch (error) {
        return { message: error === null || error === void 0 ? void 0 : error.message, isError: true };
    }
});
exports.syncPrismaUserWalletToRedis = syncPrismaUserWalletToRedis;
const syncRedisSenderRecipientWalletToPrisma = (senderId, recipientId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // check and sync the sender redis wallet to prisma
        const senderWalletKey = `user:${senderId}:wallet`;
        const checkSenderKey = yield redis_1.default.exists(senderWalletKey);
        const isSenderExists = checkSenderKey !== 0;
        if (isSenderExists) {
            const redisWallet = yield (0, exports.getRedisHashKey)(senderWalletKey);
            if (redisWallet) {
                // sync user redis and prisma wallet
                yield db_1.default.wallet.update({
                    where: { id: redisWallet.id, userId: redisWallet.userId },
                    data: {
                        credit: redisWallet.credit,
                        coins: redisWallet.amount,
                        bonus: redisWallet.bonus,
                    },
                });
            }
        }
        // check and sync the sender redis wallet to prisma
        const recipientWalletKey = `user:${recipientId}:wallet`;
        const checkRecipientKey = yield redis_1.default.exists(recipientWalletKey);
        const isRecipientExists = checkRecipientKey !== 0;
        if (isRecipientExists) {
            const redisWallet = yield (0, exports.getRedisHashKey)(recipientWalletKey);
            if (redisWallet) {
                // sync user redis and prisma wallet
                yield db_1.default.wallet.update({
                    where: { id: redisWallet.id, userId: redisWallet.userId },
                    data: {
                        credit: redisWallet.credit,
                        coins: redisWallet.amount,
                        bonus: redisWallet.bonus,
                    },
                });
            }
        }
        return {
            message: "Data synced successfully",
            isError: false,
            data: { isSenderExists, isRecipientExists },
        };
    }
    catch (error) {
        return { message: error === null || error === void 0 ? void 0 : error.message, isError: true };
    }
});
exports.syncRedisSenderRecipientWalletToPrisma = syncRedisSenderRecipientWalletToPrisma;
const syncPrismaSenderRecipientWalletToRedis = (_a) => __awaiter(void 0, [_a], void 0, function* ({ isSenderExists, senderWallet, isRecipientExists, recipientWallet, }) {
    try {
        if (isSenderExists) {
            // check and sync the sender prisma wallet to redis
            const senderWalletKey = `user:${senderWallet.userId}:wallet`;
            yield Promise.all([
                redis_1.default.hSet(senderWalletKey, "credit", senderWallet.credit.toFixed(2)),
                redis_1.default.hSet(senderWalletKey, "amount", senderWallet.coins.toFixed(2)),
                redis_1.default.hSet(senderWalletKey, "bonus", senderWallet.bonus.toFixed(2)),
            ]);
        }
        if (isRecipientExists) {
            // check and sync the recipient prisma wallet to redis
            const recipientWalletKey = `user:${recipientWallet.userId}:wallet`;
            yield Promise.all([
                redis_1.default.hSet(recipientWalletKey, "credit", recipientWallet.credit.toFixed(2)),
                redis_1.default.hSet(recipientWalletKey, "amount", recipientWallet.coins.toFixed(2)),
                redis_1.default.hSet(recipientWalletKey, "bonus", recipientWallet.bonus.toFixed(2)),
            ]);
        }
    }
    catch (error) {
        console.log("Error: Syncing prisma sender and recipient wallet to redis failed. ", error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.syncPrismaSenderRecipientWalletToRedis = syncPrismaSenderRecipientWalletToRedis;
// Function to get leaderboard
const getRewardTopRankingPlayers = (_a, rewardType_1) => __awaiter(void 0, [_a, rewardType_1], void 0, function* ({ page, limit, catId, rankingKey, mode }, rewardType) {
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
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.value, catId, mode);
        // Get player details from hash
        const playerInfo = yield redis_1.default.hGetAll(playerKeys.info);
        // Get player's rank from the sorted set leaderboard
        const player = playerInfo;
        // Get player stat
        const keys = (0, utils_1.getPlayerRewardKeys)(item.value, catId, mode);
        const key = rewardType === "MONTH"
            ? keys.month
            : rewardType === "WEEK"
                ? keys.week
                : keys.day;
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
exports.getRewardTopRankingPlayers = getRewardTopRankingPlayers;
// Function to get a category ranking based on MONTH, WEEK or DAY using offset
const getCategoryRankingPlayerData = (_a, type_1) => __awaiter(void 0, [_a, type_1], void 0, function* ({ offset, limit, catId, rankingKey, mode }, type) {
    // Get players from the sorted set leaderboard
    const min = "1000000000000000000";
    const max = "0";
    const result = yield redis_1.default.zRangeWithScores(rankingKey, min, max, {
        LIMIT: { offset, count: limit },
        BY: "SCORE",
        REV: true,
    });
    // Fetch details and ranks for each player in the room
    const playersData = yield Promise.all(result.map((item) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        // player hash unique keys
        const playerKeys = (0, utils_1.getPlayerRedisKeys)(item.value, catId, mode);
        // Get player details from hash
        const playerInfo = yield redis_1.default.hGetAll(playerKeys.info);
        // Get player's rank from the sorted set leaderboard
        const player = playerInfo;
        // Get player stat
        const keys = (0, utils_1.getPlayerRewardKeys)(item.value, catId, mode);
        const key = type === "MONTH" ? keys.month : type === "WEEK" ? keys.week : keys.day;
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
exports.getCategoryRankingPlayerData = getCategoryRankingPlayerData;
const getGameType = (gameName) => {
    const name = gameName.toLowerCase();
    if (name.includes("acronym"))
        return _types_1.GameType.ACRONYM;
    if (name.includes("academia"))
        return _types_1.GameType.ACADEMIA;
    if (name.includes("sports"))
        return _types_1.GameType.SPORTS;
    if (name.includes("country"))
        return _types_1.GameType.COUNTRY;
    if (name.includes("mindmash"))
        return _types_1.GameType.MINDMASH;
    return _types_1.GameType.TRIVIA;
};
exports.getGameType = getGameType;
const getGameCatType = (catName) => {
    const name = catName.toLowerCase();
    if (name.includes(_types_1.GameCatType.ANAGRAM.toLowerCase()))
        return _types_1.GameCatType.ANAGRAM;
    if (name.includes(_types_1.GameCatType.HANGMAN.toLowerCase()))
        return _types_1.GameCatType.HANGMAN;
    if (name.includes(_types_1.GameCatType.TYPEMANIA.toLowerCase()))
        return _types_1.GameCatType.TYPEMANIA;
    if (name.includes(_types_1.GameCatType.UNSCRAMBLE.toLowerCase()))
        return _types_1.GameCatType.UNSCRAMBLE;
    if (name.includes(_types_1.GameCatType.LUCKYSPIN.toLowerCase()))
        return _types_1.GameCatType.LUCKYSPIN;
    if (name.includes(_types_1.GameCatType.LUCKYWHIZ.toLowerCase()))
        return _types_1.GameCatType.LUCKYWHIZ;
    if (name.includes(_types_1.GameCatType.WORDMAKER.toLowerCase()))
        return _types_1.GameCatType.WORDMAKER;
    if (name.includes(_types_1.GameCatType.LUCKYFLIP.toLowerCase()))
        return _types_1.GameCatType.LUCKYFLIP;
    return undefined;
};
exports.getGameCatType = getGameCatType;
const composeGameAnswer = ({ params, room, user, }) => {
    if (params.gameType === _types_1.GameType.ACRONYM) {
        const body = Object.assign(Object.assign({}, params), { votes: [], name: user.name, room: room.name, roomId: room.id, catId: room.catId, playerId: user.id, answerId: (0, utils_1.generateUniqueRef)(), gameType: _types_1.GameType.ACRONYM, voted: false, score: 0, mode: room.mode });
        return body;
    }
    const body = Object.assign(Object.assign({}, params), { roomId: room.id, catId: room.catId, playerId: user.id, name: user.name, mode: room.mode });
    return body;
};
exports.composeGameAnswer = composeGameAnswer;
// Helper function to get the frequency of each letter in the word
function getLetterFrequency(word) {
    const freq = {};
    for (let char of word) {
        freq[char] = (freq[char] || 0) + 1;
    }
    return freq;
}
function canFormFromBaseWord(baseWord, word) {
    const baseWordFreq = getLetterFrequency(baseWord);
    const wordFreq = getLetterFrequency(word);
    // Check if every letter in the word is present in baseWord with enough frequency
    for (let letter in wordFreq) {
        if (!baseWordFreq[letter] || baseWordFreq[letter] < wordFreq[letter]) {
            return false;
        }
    }
    return true;
}
function filterWordsFromBaseWord(baseWord, guesses) {
    return guesses.filter(g => canFormFromBaseWord(baseWord, g.text));
}
const calculateWordMakerPlayerScore = (baseWord, entries) => {
    console.log("Base word: ", baseWord);
    const words = wordlist_english_1.default['english'];
    // filter words with length greater than 2
    const playerEntries = entries.filter(w => w.text.length > 2);
    console.log("playerEntries: ", playerEntries);
    // get valid words from base word
    const validBaseWords = filterWordsFromBaseWord(baseWord.toLocaleLowerCase(), playerEntries);
    console.log("valid words ", validBaseWords);
    // check if english words exist
    const validEnglishWords = validBaseWords.filter(w => words.includes(w.text));
    console.log("englishWords: ", validEnglishWords);
    // calculate score
    const score = validEnglishWords.reduce((total, item) => {
        return total + (item.text.length * 5) + item.timer; // Sum up scores for all guesses
    }, 0);
    return { score, answer: validEnglishWords.map(i => i.text).join(",") };
};
exports.calculateWordMakerPlayerScore = calculateWordMakerPlayerScore;
