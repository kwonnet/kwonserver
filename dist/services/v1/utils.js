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
exports.getAuthUser = exports.transformPost = exports.composePostAuthor = exports.composeUserConnection = exports.composePublicUser = exports.getUserStatusMessage = void 0;
exports.convertBigInts = convertBigInts;
exports.checkExpiryTime = checkExpiryTime;
exports.checkPollPermissions = checkPollPermissions;
exports.checkQuizPermissions = checkQuizPermissions;
exports.checkReplyPermissions = checkReplyPermissions;
const db_1 = __importDefault(require("@/db"));
const client_1 = require("@prisma/client");
const getUserStatusMessage = (user, isPersonal = false) => {
    var _a;
    const arr = user.metadata[((_a = user === null || user === void 0 ? void 0 : user.metadata) === null || _a === void 0 ? void 0 : _a.length) - 1];
    if (user.status === client_1.UserStatus.SUSPENDED) {
        return `This account is temporarily suspended${(arr === null || arr === void 0 ? void 0 : arr.reason) ? ` for ${arr.reason}` : `${isPersonal ? ". You can appeal or contact support." : ""}`}`;
    }
    if (user.status === client_1.UserStatus.BANNED) {
        return `This account is banned permanently${(arr === null || arr === void 0 ? void 0 : arr.reason) ? ` for ${arr.reason}` : `${isPersonal ? ". You can appeal or contact support." : ""}`}`;
    }
    if (user.status === client_1.UserStatus.PRIVATE) {
        return `This account is private`;
    }
    if (user.status === client_1.UserStatus.DEACTIVATED) {
        return `This account is deactivated`;
    }
    return "";
};
exports.getUserStatusMessage = getUserStatusMessage;
const composePublicUser = (user, includeEmail = false) => {
    const subscription = user === null || user === void 0 ? void 0 : user.subscriptions[0];
    const statuses = [
        client_1.UserStatus.ACTIVE,
        client_1.UserStatus.PRIVATE,
    ];
    return Object.assign(Object.assign({ id: user.id, avatar: user.avatar, username: user.username, name: user.name, role: user.role, userType: user.userType, bio: user === null || user === void 0 ? void 0 : user.bio, createdAt: user.createdAt, country: user === null || user === void 0 ? void 0 : user.country }, (includeEmail && { email: user === null || user === void 0 ? void 0 : user.email })), { meta: Object.assign(Object.assign({}, user.meta), { isPro: !!subscription, isLegacy: user.accountVerified, isActive: statuses.includes(String(user === null || user === void 0 ? void 0 : user.status)), isPrivate: (user === null || user === void 0 ? void 0 : user.status) === client_1.UserStatus.PRIVATE, message: (0, exports.getUserStatusMessage)(user), accountStatus: user === null || user === void 0 ? void 0 : user.status, tier: 1, level: 1 }) });
};
exports.composePublicUser = composePublicUser;
const composeUserConnection = (user) => {
    const _user = (0, exports.composePublicUser)(user);
    return Object.assign(Object.assign({}, _user), { conn: {
            followerCount: user.followerCount || 0,
            followingCount: user.followingCount || 0,
            isFollowingUser: user.isFollowingUser,
            isFollowedByUser: user.isFollowedByUser,
            followingStatus: user.followingStatus,
            followedStatus: user.followerStatus,
            mutualCount: user.mutualCount || 0,
        }, mutualFollowers: user.mutualFollowers || [] });
};
exports.composeUserConnection = composeUserConnection;
function convertBigInts(obj) {
    if (!obj || typeof obj !== "object")
        return obj;
    for (const key in obj) {
        if (typeof obj[key] === "bigint") {
            obj[key] = Number(obj[key]);
        }
        else if (typeof obj[key] === "object") {
            obj[key] = convertBigInts(obj[key]);
        }
    }
    return obj;
}
const composePostAuthor = (user) => {
    var _a, _b, _c, _d;
    const _user = (0, exports.composePublicUser)(user);
    return Object.assign(Object.assign({}, _user), { conn: {
            isFollowedByUser: ((_a = user === null || user === void 0 ? void 0 : user.followers) === null || _a === void 0 ? void 0 : _a.length) > 0, // whether the current user follows the author
            isFollowingUser: ((_b = user === null || user === void 0 ? void 0 : user.following) === null || _b === void 0 ? void 0 : _b.length) > 0, // whether the author is following the user
            followerCount: user.followerCount || 0,
            followingCount: user.followingCount || 0,
            followingStatus: (_c = user === null || user === void 0 ? void 0 : user.following[0]) === null || _c === void 0 ? void 0 : _c.status,
            followedStatus: (_d = user === null || user === void 0 ? void 0 : user.followers[0]) === null || _d === void 0 ? void 0 : _d.status,
            mutualCount: 0,
        }, mutualFollowers: [] });
};
exports.composePostAuthor = composePostAuthor;
function checkExpiryTime(targetDate) {
    const now = new Date().getTime();
    const target = new Date(targetDate).getTime();
    const difference = target - now;
    return difference <= 0 ? true : false;
}
function checkPollPermissions(post, user) {
    var _a, _b, _c, _d;
    const isPoll = post.type === client_1.PostTypeEnum.POLL;
    const poll = post.poll;
    let updatedPost = Object.assign({}, post);
    if (isPoll && poll) {
        const votes = (poll.options.flatMap((option) => option.voters || []) || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const lastOption = votes[0];
        const tenSecondsPassed = lastOption
            ? (Date.now() - new Date(lastOption.createdAt).getTime()) / 1000 > 10
            : false;
        const isExpired = checkExpiryTime(poll.expireAt);
        const hasVoted = !!(poll.isMultiVote
            ? tenSecondsPassed
            : poll.options.some((option) => { var _a; return ((_a = option.voters) === null || _a === void 0 ? void 0 : _a.length) > 0; }));
        let canVote = true;
        if (poll.scope !== client_1.ScopeEnum.NONE) {
            const matchCountry = (_a = poll.countries) === null || _a === void 0 ? void 0 : _a.some((c) => { var _a; return c.countryId === ((_a = user === null || user === void 0 ? void 0 : user.country) === null || _a === void 0 ? void 0 : _a.id); });
            const matchContinent = (_b = poll.continents) === null || _b === void 0 ? void 0 : _b.some((c) => { var _a; return c.continentId === ((_a = user === null || user === void 0 ? void 0 : user.country) === null || _a === void 0 ? void 0 : _a.continentId); });
            canVote = !!(matchCountry || matchContinent);
        }
        updatedPost.poll = Object.assign(Object.assign({}, poll), { hasVoted,
            isExpired,
            canVote });
    }
    // Recursively check nested posts
    return Object.assign(Object.assign({}, updatedPost), { parent: post.parent ? checkPollPermissions(post.parent, user) : undefined, replies: ((_c = post.replies) === null || _c === void 0 ? void 0 : _c.map((reply) => checkPollPermissions(reply, user))) || [], thread: ((_d = post.thread) === null || _d === void 0 ? void 0 : _d.map((tp) => checkPollPermissions(tp, user))) || [] });
}
function checkQuizPermissions(post, user) {
    var _a, _b, _c, _d, _e;
    const isQuiz = post.type === client_1.PostTypeEnum.QUIZ;
    const quiz = post.quiz;
    let updatedPost = Object.assign({}, post);
    if (isQuiz && quiz) {
        const hasVoted = !!((_a = quiz.options) === null || _a === void 0 ? void 0 : _a.some((option) => { var _a; return ((_a = option.participants) === null || _a === void 0 ? void 0 : _a.length) > 0; }));
        const isExpired = checkExpiryTime(quiz.expireAt);
        let canVote = true;
        if (quiz.scope !== client_1.ScopeEnum.NONE) {
            const matchCountry = (_b = quiz.countries) === null || _b === void 0 ? void 0 : _b.some((c) => { var _a; return c.countryId === ((_a = user === null || user === void 0 ? void 0 : user.country) === null || _a === void 0 ? void 0 : _a.id); });
            const matchContinent = (_c = quiz.continents) === null || _c === void 0 ? void 0 : _c.some((c) => { var _a; return c.continentId === ((_a = user === null || user === void 0 ? void 0 : user.country) === null || _a === void 0 ? void 0 : _a.continentId); });
            canVote = !!(matchCountry || matchContinent);
        }
        updatedPost.quiz = Object.assign(Object.assign({}, quiz), { hasVoted,
            isExpired,
            canVote });
    }
    // Recursively transform nested posts
    return Object.assign(Object.assign({}, updatedPost), { parent: post.parent ? checkQuizPermissions(post.parent, user) : undefined, replies: ((_d = post.replies) === null || _d === void 0 ? void 0 : _d.map((reply) => checkQuizPermissions(reply, user))) || [], thread: ((_e = post.thread) === null || _e === void 0 ? void 0 : _e.map((tp) => checkQuizPermissions(tp, user))) || [] });
}
/**
 * Check if the current user has the required permission to reply to this post
 * @param post current post
 * @param user current user
 * @returns post
 */
function checkReplyPermissions(post, userCanReply, user) {
    var _a, _b;
    const checkCanReply = (_post) => {
        var _a, _b, _c, _d, _e;
        const canHideReply = (_post === null || _post === void 0 ? void 0 : _post.root) ? ((_a = _post.root) === null || _a === void 0 ? void 0 : _a.userId) === (user === null || user === void 0 ? void 0 : user.id) : _post.userId === (user === null || user === void 0 ? void 0 : user.id);
        const scope = ((_b = _post === null || _post === void 0 ? void 0 : _post.root) === null || _b === void 0 ? void 0 : _b.scope) || _post.scope;
        let canReply = false;
        if (_post.userId === (user === null || user === void 0 ? void 0 : user.id)) {
            canReply = true;
        }
        else {
            switch (scope) {
                case client_1.PostScopeEnum.ANYONE:
                    canReply = true;
                    break;
                case client_1.PostScopeEnum.VERIFIED:
                    canReply = !!((_c = user === null || user === void 0 ? void 0 : user.meta) === null || _c === void 0 ? void 0 : _c.isPro);
                    break;
                case client_1.PostScopeEnum.FOLLOWED:
                    // canReply = _post?.author?.conn?.isFollowing
                    canReply = userCanReply;
                    break;
                case client_1.PostScopeEnum.MENTIONS:
                    const isMentioned = ((_d = _post.tagUsers) === null || _d === void 0 ? void 0 : _d.some((u) => u.id === (user === null || user === void 0 ? void 0 : user.id))) ||
                        ((_e = _post.mentions) === null || _e === void 0 ? void 0 : _e.some((u) => u.id === (user === null || user === void 0 ? void 0 : user.id)));
                    canReply = !!isMentioned;
                    break;
            }
        }
        return Object.assign(Object.assign({}, _post), { scope, actions: Object.assign(Object.assign({}, _post.actions), { canReply, canHideReply }) });
    };
    return Object.assign(Object.assign({}, checkCanReply(post)), { parent: post.parent ? checkCanReply(post.parent) : undefined, replies: ((_a = post.replies) === null || _a === void 0 ? void 0 : _a.map((reply) => checkCanReply(reply))) || [], thread: ((_b = post.thread) === null || _b === void 0 ? void 0 : _b.map((threadPost) => checkCanReply(threadPost))) || [] });
}
const transformPost = (post, userCanReply, user) => {
    var _a, _b;
    const { likes = [], bookmarks = [], parentChain = [], thread = [], replies = [], reposts = [], user: postUser } = post, rest = __rest(post, ["likes", "bookmarks", "parentChain", "thread", "replies", "reposts", "user"]);
    // First transform the core post
    let transformed = Object.assign(Object.assign({}, rest), { parentChain, totalHiddenReplies: (_b = (_a = rest === null || rest === void 0 ? void 0 : rest._count) === null || _a === void 0 ? void 0 : _a.replies) !== null && _b !== void 0 ? _b : 0, author: (0, exports.composePostAuthor)(postUser), actions: {
            hasReposted: reposts.length > 0,
            hasLiked: likes.length > 0,
            hasSaved: bookmarks.length > 0
        } });
    if (transformed === null || transformed === void 0 ? void 0 : transformed.parent) {
        transformed.parent = (0, exports.transformPost)(transformed.parent, userCanReply, user);
    }
    // Then transform nested fields recursively
    if (parentChain.length > 0) {
        transformed.parentChain = parentChain.map((p) => (0, exports.transformPost)(p, userCanReply, user));
    }
    if (thread.length > 0) {
        transformed.thread = thread.map((p) => (0, exports.transformPost)(p, userCanReply, user));
    }
    if (replies.length > 0) {
        transformed.replies = replies.map((p) => (0, exports.transformPost)(p, userCanReply, user));
    }
    // Apply permission checks to the whole transformed post
    transformed = checkPollPermissions(transformed, user);
    transformed = checkQuizPermissions(transformed, user);
    transformed = checkReplyPermissions(transformed, userCanReply, user);
    return transformed;
};
exports.transformPost = transformPost;
const getAuthUser = (userId, includeEmail) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield db_1.default.user.findFirst({
            where: { id: userId },
            include: {
                subscriptions: {
                    where: {
                        status: {
                            in: [
                                client_1.SubStatusEnum.ACTIVE,
                                client_1.SubStatusEnum.TRIAL,
                                client_1.SubStatusEnum.PAYMENT_ERROR,
                            ],
                        },
                    },
                },
                country: {
                    select: {
                        id: true,
                        name: true,
                        iso2: true,
                        iso3: true,
                        emoji: true,
                        continentId: true,
                    },
                },
            },
        });
        if (!user)
            return { data: "User not found", status: 404 };
        // check account status
        const statuses = [client_1.UserStatus.BANNED, client_1.UserStatus.SUSPENDED];
        if (statuses.includes(user.status)) {
            return { data: (0, exports.getUserStatusMessage)(user), status: 401 };
        }
        // response
        return {
            data: (0, exports.composePublicUser)(user, includeEmail),
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getAuthUser = getAuthUser;
// export const getAuthUser = async (userId?: string) => {
//   try {
//     const user = await prisma.user.findFirst({
//       where: { id: userId },
//       include: {
//         subscriptions: {
//           where: {
//             status: {
//               in: [
//                 SubStatusEnum.ACTIVE,
//                 SubStatusEnum.TRIAL,
//                 SubStatusEnum.PAYMENT_ERROR,
//               ],
//             },
//           },
//         },
//         country: {
//           select: {
//             id: true,
//             name: true,
//             iso2: true,
//             iso3: true,
//             emoji: true,
//             continentId: true,
//           },
//         },
//       },
//     });
//     if (!user) return undefined;
//     return composePublicUser(user)
//   } catch (error) {
//     return undefined;
//   }
// };
