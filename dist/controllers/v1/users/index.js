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
exports.getUserMediaPostsController = exports.getUserHighlightPostsController = exports.getUserBookmarksController = exports.getUserLikesController = exports.getUserRepliesController = exports.getUserPostsController = exports.getUserFollowRequestsController = exports.getUserVerifiedFollowersController = exports.getUserFriendsController = exports.getUserFollowingController = exports.getUserFollowersController = exports.profileVisitorController = exports.reactivateAccountController = exports.reportUserController = exports.muteUserController = exports.blockUserController = exports.getUserProfileOverviewController = exports.getConnectionsController = exports.userLocationController = exports.followUserController = exports.userUserTaskSettingsController = exports.userActiveSubscriptionController = exports.userStatsController = exports.userAchievementsController = exports.searchUsersController = exports.searchUserController = void 0;
const schema_1 = require("@/schema");
const gameSchema_1 = require("@/schema/gameSchema");
const user_1 = require("@/schema/user");
const users_1 = require("@/services/v1/users");
const sseEmitter_1 = __importDefault(require("@/sseEmitter"));
const utils_1 = require("@/utils");
const helpers_1 = require("@/utils/helpers");
const zod_1 = require("zod");
const searchUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.body, gameSchema_1.SearchUserSchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.searchUser)(zodResult.data.query);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.searchUserController = searchUserController;
const searchUsersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const SearchSchema = zod_1.z.object({
            query: zod_1.z.string(),
            page: zod_1.z.number().optional().default(1),
            limit: zod_1.z.number().optional().default(50),
        });
        const { query, limit, page } = yield SearchSchema.parseAsync({
            query: req.query.q,
        });
        const result = yield (0, users_1.searchUsers)({ query, limit, page });
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res
                .status(400)
                .send(error === null || error === void 0 ? void 0 : error.issues.map((issue) => issue.message).toString());
        }
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.searchUsersController = searchUsersController;
const userAchievementsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.query, gameSchema_1.rewardQuerySchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.getUserAchievements)(zodResult.data);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.userAchievementsController = userAchievementsController;
const userStatsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const result = yield (0, users_1.getUserStats)(user === null || user === void 0 ? void 0 : user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.userStatsController = userStatsController;
const userActiveSubscriptionController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const result = yield (0, users_1.getUserActiveSubscription)(user === null || user === void 0 ? void 0 : user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.userActiveSubscriptionController = userActiveSubscriptionController;
const userUserTaskSettingsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const result = yield (0, users_1.getUserTaskSettings)(user === null || user === void 0 ? void 0 : user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.userUserTaskSettingsController = userUserTaskSettingsController;
const followUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.body, user_1.FollowUserSchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        console.log("Follow request ", zodResult.data);
        const result = yield (0, users_1.followUser)(zodResult.data, user);
        console.log("Follow response ", result);
        if (typeof result.data !== "string") {
            console.log("emitted sse event user_follower");
            sseEmitter_1.default.send(result.data, "user_follower");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.followUserController = followUserController;
const userLocationController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.body, user_1.UserLocationSchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.logUserLocation)(user.id, zodResult.data);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.userLocationController = userLocationController;
const getConnectionsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QueryParams);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.getConnections)(user.id, zodResult.data);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getConnectionsController = getConnectionsController;
const getUserProfileOverviewController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const targetUserId = req.params.id;
        const user = req.user;
        if (!targetUserId)
            return res.status(400).send("Invalid identifier provided");
        const result = yield (0, users_1.getUserProfileOverview)(targetUserId, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserProfileOverviewController = getUserProfileOverviewController;
const blockUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const blockedId = req.params.id;
        if (!blockedId)
            return res.status(400).send("Invalid ID provided");
        const result = yield (0, users_1.blockUser)(blockedId, user);
        if (typeof result.data !== "string") {
            sseEmitter_1.default.send(result.data, `user_blocked_${user.id}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.blockUserController = blockUserController;
const muteUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const mutedId = req.params.id;
        if (!mutedId)
            return res.status(400).send("Invalid  ID provided");
        const result = yield (0, users_1.muteUser)(mutedId, user);
        if (typeof result.data !== "string") {
            sseEmitter_1.default.send(result.data, `user_muted_${user.id}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.muteUserController = muteUserController;
const reportUserController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const reportedId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.ReportCreateSchema);
        const zodData = zodResult.data;
        if (!reportedId)
            return res.status(400).send("Invalid reported ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.reportUser)(zodData, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `user_reported_${user.id}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.reportUserController = reportUserController;
const reactivateAccountController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Reactivation payload ", req.body);
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.ReactivateSchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, users_1.reactivateAccount)(zodData, user);
        console.log("Reactivation response ", result);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.reactivateAccountController = reactivateAccountController;
const profileVisitorController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const userId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.VisitorCreateSchema);
        const zodData = zodResult.data;
        if (!userId)
            return res.status(400).send("Invalid User ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const result = yield (0, users_1.profileVisit)(Object.assign(Object.assign({}, zodData), { device: reqInfo.device, meta: reqInfo.ipInfo, referer: req.headers["referer"] }), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.profileVisitorController = profileVisitorController;
const getUserFollowersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const QueryParams = schema_1.SearchQuerySchema.pick({ limit: true, page: true, id: true });
        const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.query), { id: req.params.id }), QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const { id } = zodData, rest = __rest(zodData, ["id"]);
        const result = yield (0, users_1.getUserFollowers)(Object.assign(Object.assign({}, rest), { targetUserId: id, currentUserId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserFollowersController = getUserFollowersController;
const getUserFollowingController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const QueryParams = schema_1.SearchQuerySchema.pick({ limit: true, page: true, id: true });
        const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.query), { id: req.params.id }), QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const { id } = zodData, rest = __rest(zodData, ["id"]);
        const result = yield (0, users_1.getUserFollowing)(Object.assign(Object.assign({}, rest), { targetUserId: id, currentUserId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserFollowingController = getUserFollowingController;
const getUserFriendsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const QueryParams = schema_1.SearchQuerySchema.pick({ limit: true, page: true, id: true });
        const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.query), { id: req.params.id }), QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const { id } = zodData, rest = __rest(zodData, ["id"]);
        const result = yield (0, users_1.getUserFriends)(Object.assign(Object.assign({}, rest), { targetUserId: id, currentUserId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserFriendsController = getUserFriendsController;
const getUserVerifiedFollowersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const QueryParams = schema_1.SearchQuerySchema.pick({ limit: true, page: true, id: true });
        const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.query), { id: req.params.id }), QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const { id } = zodData, rest = __rest(zodData, ["id"]);
        const result = yield (0, users_1.getUserVerifiedFollowers)(Object.assign(Object.assign({}, rest), { targetUserId: id, currentUserId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserVerifiedFollowersController = getUserVerifiedFollowersController;
const getUserFollowRequestsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const QueryParams = schema_1.SearchQuerySchema.pick({ limit: true, page: true, id: true });
        const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.query), { id: req.params.id }), QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const { id } = zodData, rest = __rest(zodData, ["id"]);
        const result = yield (0, users_1.getUserFollowRequests)(Object.assign(Object.assign({}, rest), { targetUserId: id, currentUserId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserFollowRequestsController = getUserFollowRequestsController;
const getUserPostsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserPosts)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserPostsController = getUserPostsController;
const getUserRepliesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserReplies)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserRepliesController = getUserRepliesController;
const getUserLikesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserLikedPosts)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserLikesController = getUserLikesController;
const getUserBookmarksController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserBookmarkPosts)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserBookmarksController = getUserBookmarksController;
const getUserHighlightPostsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserHighlightPosts)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserHighlightPostsController = getUserHighlightPostsController;
const getUserMediaPostsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const user = req.user;
        const Params = schema_1.QueryParams.pick({ limit: true, page: true });
        const zodResult = (0, utils_1.validateZodInput)(req.query, Params);
        const zodData = zodResult.data;
        if (!zodData || !userId) {
            return res
                .status(400)
                .send(!userId ? "Invalid user ID provided" : zodResult.message);
        }
        const result = yield (0, users_1.getUserMediaPosts)(Object.assign({ userId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getUserMediaPostsController = getUserMediaPostsController;
