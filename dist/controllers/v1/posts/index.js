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
exports.createPostTipController = exports.voteQuizPostController = exports.votePollPostController = exports.createPostHightlightController = exports.createPostPinController = exports.createPostMediaLogController = exports.createPostClickController = exports.createPostViewController = exports.createPostImpressionController = exports.hidePostReplyController = exports.restorePostController = exports.deletePostController = exports.notInterestedPostController = exports.reportPostController = exports.createPostReplyController = exports.createPostQuoteController = exports.updateRepostsController = exports.updatePostSharesController = exports.updatePostBookmarksController = exports.updatePostReactionsController = exports.getEmbedPostController = exports.getPostDetailsController = exports.getPostRepostersController = exports.getPostQuotesController = exports.getPostRepliesController = exports.getNewsfeedController = exports.createPostController = void 0;
const schema_1 = require("@/schema");
const post_1 = require("@/schema/post");
const posts_1 = require("@/services/v1/posts");
const sseEmitter_1 = __importDefault(require("@/sseEmitter"));
const utils_1 = require("@/utils");
const helpers_1 = require("@/utils/helpers");
const createPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.body, post_1.PostCreateSchema);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const user = req.user;
        const result = yield (0, posts_1.createPost)(zodData, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostController = createPostController;
const getNewsfeedController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const feedType = req.params.feedType;
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QueryParams);
        const zodData = zodResult.data;
        if (!zodData || !feedType) {
            return res
                .status(400)
                .send(!feedType ? "Invalid feed type provided" : zodResult.message);
        }
        const result = yield (0, posts_1.getNewsfeed)(Object.assign({ feed: feedType }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getNewsfeedController = getNewsfeedController;
const getPostRepliesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        if (!id)
            return res.status(400).send("Invalid id provided");
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QueryParams);
        const zodData = zodResult.data;
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const user = req.user;
        const result = yield (0, posts_1.getPostReplies)(Object.assign({ postId: id, userId: user.id }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getPostRepliesController = getPostRepliesController;
const getPostQuotesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QueryParams);
        const zodData = zodResult.data;
        if (!zodData || !postId)
            return res
                .status(400)
                .send(!postId ? "Invalid post id" : zodResult.message);
        const user = req.user;
        const result = yield (0, posts_1.getPostQuotes)(Object.assign({ postId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getPostQuotesController = getPostQuotesController;
const getPostRepostersController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.query, schema_1.QueryParams);
        const zodData = zodResult.data;
        if (!zodData || !postId)
            return res
                .status(400)
                .send(!postId ? "Invalid post id" : zodResult.message);
        const user = req.user;
        const result = yield (0, posts_1.getPostReposters)(Object.assign({ postId }, zodData), user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getPostRepostersController = getPostRepostersController;
const getPostDetailsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.getPostFeedDetails)(postId, user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getPostDetailsController = getPostDetailsController;
const getEmbedPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.getPostFeedDetails)(postId, user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getEmbedPostController = getEmbedPostController;
const updatePostReactionsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.updatePostReactions)(postId, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send({
                liked: data.liked,
                userId: (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.userId,
                id: (_b = data === null || data === void 0 ? void 0 : data.data) === null || _b === void 0 ? void 0 : _b.postId,
            }, "post_reaction");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.updatePostReactionsController = updatePostReactionsController;
const updatePostBookmarksController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.updatePostBookmarks)(postId, user.id);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send({
                saved: data.isBookmarked,
                userId: (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.userId,
                id: (_b = data === null || data === void 0 ? void 0 : data.data) === null || _b === void 0 ? void 0 : _b.postId,
            }, "post_bookmark");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.updatePostBookmarksController = updatePostBookmarksController;
const updatePostSharesController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.updatePostShares)(postId, user.id);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send({ userId: user === null || user === void 0 ? void 0 : user.id, id: data === null || data === void 0 ? void 0 : data.id }, "post_share");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.updatePostSharesController = updatePostSharesController;
const updateRepostsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const postId = req.params.id;
        const user = req.user;
        const result = yield (0, posts_1.updateReposts)(postId, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send({
                reposted: data.isReposted,
                userId: (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.userId,
                childId: (_b = data === null || data === void 0 ? void 0 : data.data) === null || _b === void 0 ? void 0 : _b.id, // created reposted post child ID
                postId: (_c = data === null || data === void 0 ? void 0 : data.data) === null || _c === void 0 ? void 0 : _c.parentId, // parent reposted post ID
            }, "post_repost");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.updateRepostsController = updateRepostsController;
const createPostQuoteController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, post_1.PostCreateSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid quoted post id");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, posts_1.createPostQuote)(postId, user.id, zodData);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send({
                quoted: data.isQuoted,
                userId: (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.userId,
                id: (_b = data === null || data === void 0 ? void 0 : data.data) === null || _b === void 0 ? void 0 : _b.postId,
            }, "post_quote");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostQuoteController = createPostQuoteController;
const createPostReplyController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, post_1.PostCreateSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid reply post id");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, posts_1.createPostReply)(postId, zodData, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, "post_reply");
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostReplyController = createPostReplyController;
const reportPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.ReportCreateSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid reply post id");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, posts_1.reportPost)(zodData, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_report_${data.userId}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.reportPostController = reportPostController;
const notInterestedPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        if (!postId)
            return res.status(400).send("Invalid post id");
        const result = yield (0, posts_1.notInterestedPost)(postId, user.id);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_not_interested_${data.userId}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.notInterestedPostController = notInterestedPostController;
const deletePostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        if (!postId)
            return res.status(400).send("Invalid quoted post id");
        const result = yield (0, posts_1.deletePost)(postId, user);
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_delete`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.deletePostController = deletePostController;
const restorePostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        if (!postId)
            return res.status(400).send("Invalid quoted post id");
        const result = yield (0, posts_1.restorePost)(postId, user);
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_restore`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.restorePostController = restorePostController;
const hidePostReplyController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        const result = yield (0, posts_1.hidePostReply)(postId, user);
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_hidden`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.hidePostReplyController = hidePostReplyController;
const createPostImpressionController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostImpressionSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const payload = {
            device: reqInfo.device,
            meta: reqInfo.ipInfo,
            postId,
            userId: user.id,
            sessionId: zodData.sessionId,
            timestamp: zodData.timestamp,
            referer: req.headers["referer"]
        };
        // save impression in redis queue
        // const result = await insertImpressionQueue(payload)
        const result = yield (0, posts_1.createPostImpression)(payload);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_impression`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostImpressionController = createPostImpressionController;
const createPostViewController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostViewSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const payload = {
            device: reqInfo.device,
            meta: reqInfo.ipInfo,
            postId,
            userId: user.id,
            sessionId: zodData.sessionId,
            timestamp: zodData.timestamp,
            duration: zodData.duration,
            referer: req.headers["referer"]
        };
        // save view in redis queue
        // const result = await insertImpressionQueue(payload)
        const result = yield (0, posts_1.createPostView)(payload);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_view`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostViewController = createPostViewController;
const createPostClickController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostClickSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const payload = Object.assign({ device: reqInfo.device, meta: reqInfo.ipInfo, postId, userId: user.id, referer: req.headers["referer"] }, zodData);
        // save view in redis queue
        const result = yield (0, posts_1.createPostClick)(payload);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostClickController = createPostClickController;
const createPostMediaLogController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostMediaLogSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const payload = Object.assign(Object.assign({}, zodData), { postId, device: reqInfo.device, meta: reqInfo.ipInfo, userId: user.id, referer: req.headers["referer"] });
        // save view in redis queue
        // const result = await insertImpressionQueue(payload)
        const result = yield (0, posts_1.createPostMediaLog)(payload);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_media_action`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostMediaLogController = createPostMediaLogController;
const createPostPinController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostPinSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid reply post id");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, posts_1.createPostPin)(zodData, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_pin_${data.userId}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostPinController = createPostPinController;
const createPostHightlightController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostHighlightSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid reply post id");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const result = yield (0, posts_1.createPostHighlight)(zodData, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_highlight_${data.userId}`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostHightlightController = createPostHightlightController;
const votePollPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const postId = (_a = req === null || req === void 0 ? void 0 : req.params) === null || _a === void 0 ? void 0 : _a.id;
        const optionId = (_b = req === null || req === void 0 ? void 0 : req.body) === null || _b === void 0 ? void 0 : _b.optionId;
        const user = req.user;
        if (!postId || !optionId)
            return res.status(400).send("Invalid post or option id");
        const result = yield (0, posts_1.votePollPost)(postId, optionId, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.votePollPostController = votePollPostController;
const voteQuizPostController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const postId = (_a = req === null || req === void 0 ? void 0 : req.params) === null || _a === void 0 ? void 0 : _a.id;
        const optionId = (_b = req === null || req === void 0 ? void 0 : req.body) === null || _b === void 0 ? void 0 : _b.optionId;
        const user = req.user;
        if (!postId || !optionId)
            return res.status(400).send("Invalid post or option id");
        const result = yield (0, posts_1.voteQuizPost)(postId, optionId, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.voteQuizPostController = voteQuizPostController;
const createPostTipController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    try {
        const user = req.user;
        const postId = req.params.id;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.CreatePostTipSchema);
        const zodData = zodResult.data;
        if (!postId)
            return res.status(400).send("Invalid ID provided");
        if (!zodData)
            return res.status(400).send(zodResult.message);
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        const payload = Object.assign(Object.assign({}, zodData), { postId, device: reqInfo.device, meta: reqInfo.ipInfo, senderId: user.id, referer: req.headers["referer"] });
        // save tip in redis queue?
        // const result = await createPostTip(payload)
        const result = yield (0, posts_1.createPostTip)(payload, user);
        // emit sse event
        const data = result.data;
        if (typeof data !== "string") {
            sseEmitter_1.default.send(result.data, `post_tip`);
        }
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.createPostTipController = createPostTipController;
