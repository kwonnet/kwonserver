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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserGameRankingArchiveController = exports.getUserGamesRankingArchiveStatsController = exports.getGamesRankingArchiveController = exports.getGamesRankingArchiveStatsController = exports.getGameCategoriesRankingsController = exports.getGameWinnersController = exports.getGameWinnersStatsController = exports.getGamePlayerRankingsController = exports.getGameCategoryRoomsController = exports.getGameCategoriesController = exports.createGameCategoryRoomController = exports.createGameCategoryController = exports.getGamesController = exports.createGameController = exports.getGameLeaderboardController = void 0;
const games_1 = require("@/services/v1/games");
const gameSchema_1 = require("@/schema/gameSchema");
const utils_1 = require("@/utils");
const client_1 = require("@prisma/client");
const getGameLeaderboardController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const query = req.query;
    const page = parseInt((_a = query === null || query === void 0 ? void 0 : query.page) !== null && _a !== void 0 ? _a : 1);
    const limit = parseInt((_b = query === null || query === void 0 ? void 0 : query.limit) !== null && _b !== void 0 ? _b : 10);
    const catId = query.catId;
    const ranking = query.ranking;
    const _mode = (_c = query === null || query === void 0 ? void 0 : query.mode) === null || _c === void 0 ? void 0 : _c.toUpperCase();
    if (!Object.values(client_1.GameMode).includes(_mode)) {
        return res.status(400).send("Invalid mode value - value can be either single or multi");
    }
    const mode = _mode === client_1.GameMode.MULTI ? client_1.GameMode.MULTI : client_1.GameMode.SINGLE;
    const data = yield (0, games_1.getGameLeaderboard)({ page, limit, catId, ranking, mode });
    return res.json(data);
});
exports.getGameLeaderboardController = getGameLeaderboardController;
const createGameController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = yield gameSchema_1.createGameSchema.parseAsync(req.body);
        const result = yield (0, games_1.createGame)(zodResult);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createGameController = createGameController;
const getGamesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, games_1.getGames)();
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGamesController = getGamesController;
const createGameCategoryController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = yield gameSchema_1.createGameCategorySchema.parseAsync(req.body);
        const result = yield (0, games_1.createGameCategory)(zodResult);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createGameCategoryController = createGameCategoryController;
const createGameCategoryRoomController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = yield gameSchema_1.createGameCategoryRoomSchema.parseAsync(req.body);
        const result = yield (0, games_1.createGameCategoryRoom)(zodResult);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createGameCategoryRoomController = createGameCategoryRoomController;
const getGameCategoriesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, games_1.getGameCategories)(req.params.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGameCategoriesController = getGameCategoriesController;
const getGameCategoryRoomsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, games_1.getGameCategoryRooms)(req.params.id, String(req.query.mode));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGameCategoryRoomsController = getGameCategoryRoomsController;
const getGamePlayerRankingsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.query, gameSchema_1.userRankQuerySchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const mode = "multi";
        const result = yield (0, games_1.getGamePlayerRankings)(zodData.userId, zodData.rankType, mode);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGamePlayerRankingsController = getGamePlayerRankingsController;
const getGameWinnersStatsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, games_1.getGameWinnersStats)();
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGameWinnersStatsController = getGameWinnersStatsController;
const getGameWinnersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.query, gameSchema_1.winnersQuerySchema);
        const zodData = zodResult.data;
        console.log(zodData);
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, games_1.getGameWinners)(zodData);
        console.log(result);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGameWinnersController = getGameWinnersController;
const getGameCategoriesRankingsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rankingTypeSchema = gameSchema_1.userRankQuerySchema.pick({ rankType: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, rankingTypeSchema);
        const zodData = zodResult.data;
        console.log("RankingsController ", zodData);
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const mode = "single";
        const result = yield (0, games_1.getGameCategoriesRankings)(zodData.rankType, mode);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGameCategoriesRankingsController = getGameCategoriesRankingsController;
const getGamesRankingArchiveStatsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, games_1.getGamesRankingArchiveStats)();
        // console.log(result)
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGamesRankingArchiveStatsController = getGamesRankingArchiveStatsController;
const getGamesRankingArchiveController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.query, gameSchema_1.winnersQuerySchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, games_1.getGamesRankingArchiveData)(zodData);
        console.log("Archive data ", result);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getGamesRankingArchiveController = getGamesRankingArchiveController;
const getUserGamesRankingArchiveStatsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const result = yield (0, games_1.getUserGamesRankingArchiveStats)(String((_a = req.user) === null || _a === void 0 ? void 0 : _a.id));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserGamesRankingArchiveStatsController = getUserGamesRankingArchiveStatsController;
const getUserGameRankingArchiveController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userArchiveSchema = gameSchema_1.querySchema.pick({
            catId: true,
            month: true,
            year: true,
            userId: true,
        });
        const zodResult = (0, utils_1.validateZodInput)(req.query, userArchiveSchema);
        const zodData = zodResult.data;
        console.log("user ranking archive", zodData);
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, games_1.getUserGameRankingArchiveData)(zodData);
        console.log("user ranking archive", result);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserGameRankingArchiveController = getUserGameRankingArchiveController;
