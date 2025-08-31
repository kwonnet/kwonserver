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
exports.getUserMediaPosts = exports.getUserHighlightPosts = exports.getUserBookmarkPosts = exports.getUserLikedPosts = exports.getUserReplies = exports.getUserPosts = exports.getUserFollowRequests = exports.getUserVerifiedFollowers = exports.getUserFriends = exports.getUserFollowing = exports.getUserFollowers = exports.getMutualFollowings = exports.getSuggestedConnections = exports.getConnections = exports.logUserLocation = exports.profileVisit = exports.reactivateAccount = exports.reportUser = exports.muteUser = exports.blockUser = exports.followUser = exports.getUserTaskSettings = exports.getUserActiveSubscription = exports.getUserStats = exports.getUserAchievements = exports.searchUsers = exports.searchUser = void 0;
exports.getMutualFollowsSuggestions = getMutualFollowsSuggestions;
exports.getPopularCreatorsSuggestions = getPopularCreatorsSuggestions;
exports.getEngagementAndInterestSuggestions = getEngagementAndInterestSuggestions;
exports.getNearYouSuggestions = getNearYouSuggestions;
exports.getUserProfileOverview = getUserProfileOverview;
const client_1 = require("@prisma/client");
const _types_1 = require("@/@types");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("../utils");
const user_1 = require("@/@types/user");
const searchUser = (query) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield db_1.default.user.findFirst({
            where: {
                OR: [
                    { id: { endsWith: query, mode: "insensitive" } },
                    { username: { equals: query, mode: "insensitive" } },
                    { email: { equals: query, mode: "insensitive" } },
                ],
            },
        });
        if (!user) {
            return { data: "User not found", status: 404 };
        }
        if (user.status !== client_1.UserStatus.ACTIVE) {
            return { data: (0, utils_1.getUserStatusMessage)(user), status: 400 };
        }
        return {
            data: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                name: user.name,
            },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.searchUser = searchUser;
const searchUsers = (_a) => __awaiter(void 0, [_a], void 0, function* ({ query, limit, page, }) {
    try {
        const users = yield db_1.default.user.findMany({
            where: {
                OR: [
                    { username: { search: query, mode: "insensitive" } },
                    { name: { search: query, mode: "insensitive" } },
                ],
            },
            skip: (page - 1) * limit,
            take: limit,
        });
        if (users.length === 0) {
            return { data: "Not found", status: 404 };
        }
        return {
            data: users.map((user) => ({
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                name: user.name,
            })),
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.searchUsers = searchUsers;
const getUserAchievements = (query) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { catId, userId, year, page, limit } = query;
        const skip = (page - 1) * limit;
        const whereClause = {
            AND: [
                { playerId: userId }, // Always include `userId` since it's required
                ...(catId ? [{ catId }] : []), // Add `catId` condition only if it's not null
                ...(year
                    ? [
                        {
                            createdAt: {
                                gte: new Date(`${year}-01-01T00:00:00.000Z`),
                                lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
                            },
                        },
                    ]
                    : []), // Add `year` condition only if it's not null
            ],
        };
        const result = yield db_1.default.gameAchievement.findMany({
            where: whereClause,
            skip: skip,
            take: limit,
        });
        if (result.length === 0) {
            return { data: "Not found", status: 404 };
        }
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserAchievements = getUserAchievements;
const getUserStats = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const [totalInvites, earned, totalAwards, totalTxns, totalTaskNotDone, totalTaskDone,] = yield db_1.default.$transaction([
            // get total referral
            db_1.default.referral.count({ where: { referrerId: id } }),
            // get total referral reward amount
            db_1.default.referral.aggregate({
                _sum: { amount: true },
                where: { referrerId: id },
            }),
            // get total game achievements
            db_1.default.gameAchievement.count({ where: { playerId: id } }),
            // get total txns
            db_1.default.transaction.count({ where: { userId: id } }),
            // get total unperformed tasks
            db_1.default.task.count({
                where: {
                    performedBy: {
                        none: {
                            userId: id,
                        },
                    },
                },
            }),
            // get total performed tasks
            db_1.default.userTask.count({ where: { userId: id } }),
        ]);
        return {
            data: {
                totalAwards,
                totalTxns,
                totalInvites,
                totalEarned: (_a = earned._sum.amount) !== null && _a !== void 0 ? _a : 0,
                totalTaskNotDone,
                totalTaskDone,
            },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserStats = getUserStats;
const getUserActiveSubscription = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sub = yield db_1.default.subscription.findFirst({
            where: { userId, isPrimary: true },
            include: {
                plan: {
                    select: {
                        accountType: true,
                        id: true,
                        createdAt: true,
                        features: true,
                        discount: true,
                        name: true,
                        price: true,
                        tier: true,
                        updatedAt: true,
                    },
                },
            },
        });
        if (!sub) {
            return { data: "Not found", status: 404 };
        }
        return { data: sub, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserActiveSubscription = getUserActiveSubscription;
const getUserTaskSettings = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield db_1.default.userTaskSettings.findFirst({
            where: { userId },
        });
        if (!settings) {
            return { data: "Not found", status: 404 };
        }
        return { data: settings, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserTaskSettings = getUserTaskSettings;
const followUser = (params, user) => __awaiter(void 0, void 0, void 0, function* () {
    const { recipientId, senderId, action } = params;
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // get recipient details
            const recipient = yield tx.user.findUniqueOrThrow({
                where: { id: recipientId },
            });
            const isPrivate = recipient.status === client_1.UserStatus.PRIVATE;
            const statuses = [client_1.UserStatus.ACTIVE, client_1.UserStatus.PRIVATE];
            let status = client_1.FollowStatus.REJECTED;
            if (_types_1.UserFollowAction.FOLLOW && !statuses.includes(recipient === null || recipient === void 0 ? void 0 : recipient.status)) {
                throw new Error((0, utils_1.getUserStatusMessage)(recipient));
            }
            if (action === _types_1.UserFollowAction.CANCEL ||
                action === _types_1.UserFollowAction.UNFOLLOW) {
                yield tx.follow.delete({
                    where: {
                        followerId_followingId: {
                            followerId: senderId,
                            followingId: recipientId,
                        },
                    },
                });
                if (_types_1.UserFollowAction.UNFOLLOW) {
                    // insert unfollow history
                    yield db_1.default.followHistory.create({
                        data: {
                            followerId: senderId,
                            followingId: recipientId,
                            action: client_1.FollowAction.UNFOLLOW,
                        },
                    });
                }
            }
            else if (action === _types_1.UserFollowAction.REJECT) {
                yield tx.follow.delete({
                    where: {
                        followerId_followingId: {
                            followerId: recipientId,
                            followingId: senderId,
                        },
                    },
                });
            }
            else if (action === _types_1.UserFollowAction.ACCEPT) {
                yield tx.follow.update({
                    where: {
                        followerId_followingId: {
                            followerId: recipientId,
                            followingId: senderId,
                        },
                    },
                    data: { status: client_1.FollowStatus.ACCEPTED },
                });
                status = client_1.FollowStatus.ACCEPTED;
            }
            else {
                (status = isPrivate ? client_1.FollowStatus.PENDING : client_1.FollowStatus.ACCEPTED),
                    // insert follow
                    yield tx.follow.create({
                        data: {
                            followerId: senderId,
                            followingId: recipientId,
                            status,
                        },
                    });
                // insert history
                yield db_1.default.followHistory.create({
                    data: {
                        followerId: senderId,
                        followingId: recipientId,
                        action: client_1.FollowAction.FOLLOW,
                    },
                });
                // check if there is similar notif
                const check = yield tx.notification.findFirst({
                    where: {
                        senderId,
                        recipientId,
                        type: client_1.NotifTypeEnum.USER,
                    },
                });
                if (!check) {
                    // insert notification
                    yield tx.notification.create({
                        data: {
                            senderId,
                            recipientId,
                            type: client_1.NotifTypeEnum.USER,
                            message: isPrivate
                                ? `${user.name} rquested to connect with you`
                                : `${user.name} followed you`,
                            title: isPrivate ? `New connection request` : "New user follow",
                        },
                    });
                }
            }
            return { status };
            // return { ...result2, isFollow: isPrivate };
        }));
        return { data: Object.assign(Object.assign({}, result), params), status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.followUser = followUser;
const blockUser = (blockedId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // check user already blocked else block
            const result = yield tx.blockUser.findFirst({
                where: { blockerId: user.id, blockedId },
            });
            if (result) {
                yield tx.blockUser.delete({ where: { id: result.id } });
                // insert history
                yield db_1.default.blockHistory.create({
                    data: {
                        blockerId: user.id,
                        blockedId,
                        action: client_1.BlockAction.UNBLOCK,
                    },
                });
                return Object.assign(Object.assign({}, result), { isBlocked: false });
            }
            // insert blocK
            const result2 = yield tx.blockUser.create({
                data: { blockerId: user.id, blockedId },
            });
            // insert history
            yield db_1.default.blockHistory.create({
                data: {
                    blockerId: user.id,
                    blockedId,
                    action: client_1.BlockAction.BLOCK,
                },
            });
            // check if current user follows the blocked and unfollow
            const result3 = yield tx.follow.findFirst({
                where: { followerId: user.id, followingId: blockedId },
            });
            if (result3) {
                yield tx.follow.delete({ where: { id: result3.id } });
                // insert history
                yield db_1.default.followHistory.create({
                    data: {
                        followerId: user.id,
                        followingId: blockedId,
                        action: client_1.FollowAction.UNFOLLOW,
                    },
                });
            }
            return Object.assign(Object.assign({}, result2), { isBlocked: true });
        }));
        return { data: data, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.blockUser = blockUser;
const muteUser = (mutedId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // check user already muted and else mute
            const result = yield tx.muteUser.findFirst({
                where: { muterId: user.id, mutedId },
            });
            if (result) {
                yield tx.muteUser.delete({ where: { id: result.id } });
                // insert history
                yield db_1.default.muteHistory.create({
                    data: {
                        muterId: user.id,
                        mutedId,
                        action: client_1.MuteAction.UNMUTE,
                    },
                });
                return Object.assign(Object.assign({}, result), { isMuted: false });
            }
            // insert mute
            const result2 = yield tx.muteUser.create({
                data: { muterId: user.id, mutedId },
            });
            // insert history
            yield db_1.default.muteHistory.create({
                data: {
                    muterId: user.id,
                    mutedId,
                    action: client_1.MuteAction.MUTE,
                },
            });
            return Object.assign(Object.assign({}, result2), { isMuted: true });
        }));
        return { data: data, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.muteUser = muteUser;
const reportUser = (body, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const report = yield db_1.default.userReport.findFirst({
            where: { reportedId: body.id, reporterId: user.id },
            orderBy: [{ createdAt: "desc" }],
        });
        // check if the user has already reported the post with 24 hours
        if (report &&
            new Date(report.createdAt).getTime() >
                new Date(Date.now() - 1000 * 60 * 60 * 24).getTime()) {
            return {
                data: "You have already reported this user, wait till after 24hrs to report again",
                status: 400,
            };
        }
        // check if the user exists
        const reported = yield db_1.default.user.findUniqueOrThrow({
            where: { id: body.id },
        });
        // report the post
        yield db_1.default.userReport.create({
            data: {
                reportedId: body.id,
                reporterId: user.id,
                reason: body.code,
                meta: body.meta,
                message: body.message,
            },
        });
        return { data: { id: reported.id, userId: user.id }, status: 200 };
    }
    catch (error) {
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.reportUser = reportUser;
const reactivateAccount = (body, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const account = yield db_1.default.user.findUniqueOrThrow({
            where: { id: body.userId },
        });
        const isOwner = body.userId === user.id;
        const adminEnabledStatuses = [
            client_1.UserStatus.BANNED,
            client_1.UserStatus.SUSPENDED,
        ];
        if (isOwner && adminEnabledStatuses.includes(account === null || account === void 0 ? void 0 : account.status)) {
            return {
                data: "You're not authorised to perform this action, please contact support",
                status: 403,
            };
        }
        yield db_1.default.user.update({
            where: { id: body.userId },
            data: {
                status: body.isActive ? client_1.UserStatus.ACTIVE : client_1.UserStatus.DEACTIVATED,
            },
        });
        return { data: body, status: 200 };
    }
    catch (error) {
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.reactivateAccount = reactivateAccount;
const profileVisit = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // check user already muted and else mute
            const result = yield tx.profileVisit.findFirst({
                where: { userId: args.userId, visitorId: user.id },
            });
            // create visit data
            yield tx.profileVisit.create({
                data: Object.assign(Object.assign({}, args), { visitorId: user.id }),
            });
            // check if already exists or create new notification
            if (!result) {
                // may be send notification?
                yield tx.notification.create({
                    data: {
                        senderId: user.id,
                        recipientId: args.userId,
                        type: client_1.NotifTypeEnum.USER,
                        message: `${user.name} visited your profile`,
                        title: "New profile visit",
                    },
                });
            }
        }));
        return { data: args, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.profileVisit = profileVisit;
const logUserLocation = (userId, args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.userLocation.upsert({
            where: { userId: userId },
            update: args,
            create: Object.assign({ userId: userId }, args),
        });
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.logUserLocation = logUserLocation;
const getConnections = (userId, args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (args.type === user_1.ConnTypeEnum.POPULAR_CREATORS) {
            return yield getPopularCreatorsSuggestions(userId, args.limit);
        }
        if (args.type === user_1.ConnTypeEnum.MUTUAL_FOLLOWS) {
            return yield getMutualFollowsSuggestions(userId, args.limit);
        }
        if (args.type === user_1.ConnTypeEnum.NEAR_YOU) {
            return yield getNearYouSuggestions(userId, args.limit);
        }
        if (args.type === user_1.ConnTypeEnum.INTEREST) {
            return yield getEngagementAndInterestSuggestions(userId, args.limit);
        }
        return (0, exports.getSuggestedConnections)(userId, args.limit);
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getConnections = getConnections;
const getSuggestedConnections = (userId, limit) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$queryRawUnsafe(`
      WITH user_following AS (
        SELECT "followingId" FROM "Follow" WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS targetId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      base_verified AS (
        SELECT u.*, 'VERIFIED' AS "connectionType"
        FROM "User" u
        WHERE u."accountVerified" = true
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
        LIMIT 50
      ),

      base_new_users AS (
        SELECT u.*, 'NEW_USER' AS "connectionType"
        FROM "User" u
        WHERE u."createdAt" > NOW() - INTERVAL '3 days'
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
        LIMIT 50
      ),

      base_trending AS (
        SELECT u.*, 'TRENDING' AS "connectionType"
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        WHERE p."createdAt" > NOW() - INTERVAL '7 days'
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
        GROUP BY u.id
        ORDER BY COUNT(p.id) DESC
        LIMIT 50
      ),

      combined AS (
        SELECT * FROM base_verified
        UNION ALL
        SELECT * FROM base_new_users
        UNION ALL
        SELECT * FROM base_trending
      )

      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.bio,
        u.email,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u."connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.targetId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.targetId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM combined u
      ORDER BY u.id, RANDOM()
      LIMIT $2;
    `, userId, limit);
        const suggestions = result.map((user) => (0, utils_1.composeUserConnection)(user));
        const notFound = suggestions.length === 0;
        return {
            data: notFound ? "not found" : suggestions,
            status: notFound ? 404 : 200,
        };
    }
    catch (error) {
        throw error;
    }
});
exports.getSuggestedConnections = getSuggestedConnections;
/**
 * Get mutual follows and friends of friends
 * @param userId string
 * @param limit number
 * @param offset  number
 * @returns UserConnection[]
 */
function getMutualFollowsSuggestions(userId_1) {
    return __awaiter(this, arguments, void 0, function* (userId, limit = 20, offset = 0) {
        try {
            const result = yield db_1.default.$queryRawUnsafe(`
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS targetId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      combined_suggestions AS (
        SELECT u.*, 'MUTUAL_FOLLOWS' AS "connectionType"
        FROM "User" u
        JOIN "Follow" f ON u.id = f."followingId"
        WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)

        UNION ALL

        SELECT u.*, 'SECOND_DEGREE' AS "connectionType"
        FROM "User" u
        JOIN "Follow" f ON u.id = f."followingId"
        WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
      )

      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.email,
        u.bio,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u."connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.targetId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.targetId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM combined_suggestions u
      ORDER BY u.id, u."connectionType"  -- Ensures consistent prioritization
      LIMIT $2;
      `, userId, limit);
            const suggestions = result.map((user) => (0, utils_1.composeUserConnection)(user));
            const notFound = suggestions.length === 0;
            return {
                data: notFound ? "not found" : suggestions,
                status: notFound ? 404 : 200,
            };
        }
        catch (error) {
            throw error;
        }
    });
}
/**
 * Retrieve popular creators
 * @param userId string
 * @param limit number
 * @param offset number
 * @returns UserConnection[]
 */
function getPopularCreatorsSuggestions(userId_1) {
    return __awaiter(this, arguments, void 0, function* (userId, limit = 20, offset = 0) {
        try {
            const result = yield db_1.default.$queryRawUnsafe(`
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS creatorId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      )

      SELECT 
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.email,
        u.bio,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",

        COUNT(f."followerId")::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.creatorId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.creatorId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM "User" u
      LEFT JOIN "Follow" f ON u.id = f."followingId"
      WHERE u.id != $1
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
      GROUP BY u.id
      ORDER BY "followerCount" DESC
      LIMIT $2;
    `, userId, limit);
            const suggestions = result.map((user) => (0, utils_1.composeUserConnection)(user));
            const notFound = suggestions.length === 0;
            return {
                data: notFound ? "not found" : suggestions,
                status: notFound ? 404 : 200,
            };
        }
        catch (error) {
            throw error;
        }
    });
}
/**
 * Retrieves suggested users based engaged posts and hash tags
 * @param userId string
 * @param limit number
 * @returns UserConnection[]
 */
function getEngagementAndInterestSuggestions(userId_1) {
    return __awaiter(this, arguments, void 0, function* (userId, limit = 20) {
        try {
            const result = yield db_1.default.$queryRawUnsafe(`
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      engagements AS (
        SELECT DISTINCT "postId" FROM "LikedPost" WHERE "userId" = $1
        UNION
        SELECT DISTINCT "postId" FROM "Bookmark" WHERE "userId" = $1
        UNION
        SELECT DISTINCT id AS "postId" FROM "Post" WHERE "userId" = $1 AND kind = 'REPLY'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS suggestedUserId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      all_suggestions AS (
        SELECT DISTINCT u.*
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        WHERE p.id IN (SELECT "postId" FROM engagements)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)

        UNION

        SELECT DISTINCT u.*
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        JOIN "PostHashTag" ph ON ph."postId" = p.id
        WHERE ph."tagId" IN (
          SELECT DISTINCT ph2."tagId"
          FROM engagements e
          JOIN "PostHashTag" ph2 ON ph2."postId" = e."postId"
        )
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
      )

      SELECT
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.bio,
        u.email,
        u.meta,
        u.status,
        u.role,
        u."userType",
        u.metadata,
        u."createdAt",
        u."accountVerified" AS "isVerified",
        'SUGGESTED' AS "connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followerCount",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followingCount",

        CAST((
          SELECT COUNT(*) FROM mutuals m
          WHERE m.suggestedUserId = u.id
        ) AS INTEGER) AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', CAST((
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              ) AS INTEGER),
              'followingCount', CAST((
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              ) AS INTEGER)
            )
          ) ORDER BY mu."accountVerified" DESC, 
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.suggestedUserId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM all_suggestions u
      LIMIT $2;
    `, userId, limit);
            console.log(result[1]);
            const suggestions = result.map((user) => (0, utils_1.composeUserConnection)(user));
            const notFound = suggestions.length === 0;
            return {
                data: notFound ? "not found" : suggestions,
                status: notFound ? 404 : 200,
            };
        }
        catch (error) {
            console.log(error);
            throw error;
        }
    });
}
function getNearYouSuggestions(userId_1) {
    return __awaiter(this, arguments, void 0, function* (userId, limit = 20, radiusInKm = 50) {
        try {
            const result = yield db_1.default.$queryRawUnsafe(`
      WITH user_following AS (
        SELECT "followingId" FROM "Follow" WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      current_user_location AS (
        SELECT latitude, longitude FROM "UserLocation" WHERE "userId" = $1
      ),

      mutuals AS (
        SELECT
          f1."followingId" AS "mutualId",
          f2."followingId" AS "suggestedUserId"
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followingId" = f2."followingId"
        WHERE f1."followerId" = $1 AND f2."followerId" != $1
          AND f1.status = 'ACCEPTED' AND f2.status = 'ACCEPTED'
      )

      SELECT
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u.status,
        u.metadata,
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u.role,
        u."userType",
        u.bio,
        u.email,
        'NEAR_YOU' AS "connectionType",

        (
          6371 * acos(
            cos(radians(cul.latitude)) * cos(radians(ul2.latitude)) *
            cos(radians(ul2.longitude) - radians(cul.longitude)) +
            sin(radians(cul.latitude)) * sin(radians(ul2.latitude))
          )
        ) AS distance_km,

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followerCount",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followingCount",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country,

        CAST((
          SELECT COUNT(*) FROM mutuals
          WHERE mutuals."suggestedUserId" = u.id
        ) AS INTEGER) AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(sub) ORDER BY sub."isVerified" DESC, sub."conn"->>'followerCount' DESC)
          FROM (
            SELECT
              mu.id,
              mu.username,
              mu.name,
              mu.avatar,
              mu."accountVerified" AS "isVerified",
              jsonb_build_object(
                'followerCount', CAST((
                  SELECT COUNT(*) FROM "Follow"
                  WHERE "followingId" = mu.id AND status = 'ACCEPTED'
                ) AS INTEGER),
                'followingCount', CAST((
                  SELECT COUNT(*) FROM "Follow"
                  WHERE "followerId" = mu.id AND status = 'ACCEPTED'
                ) AS INTEGER)
              ) AS conn
            FROM mutuals m
            JOIN "User" mu ON mu.id = m."mutualId"
            WHERE m."suggestedUserId" = u.id
            LIMIT 5
          ) sub
        ), '[]'::jsonb) AS "mutualFollowers"

      FROM "User" u
      JOIN "UserLocation" ul2 ON ul2."userId" = u.id
      CROSS JOIN current_user_location cul
      WHERE u.id != $1
        AND u."status" = 'ACTIVE'
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
        AND ul2.latitude IS NOT NULL
        AND ul2.longitude IS NOT NULL

      ORDER BY distance_km ASC
      LIMIT $2;
    `, userId, limit);
            const suggestions = result.map((user) => (0, utils_1.composeUserConnection)(user));
            const notFound = suggestions.length === 0;
            return {
                data: notFound ? "not found" : suggestions,
                status: notFound ? 404 : 200,
            };
        }
        catch (error) {
            throw error;
        }
    });
}
/**
 * Get targeted user mini profile including current user top followings following the targeted user
 * @param targetUserId string  - username or ID
 * @param currentUserId string - userId
 * @returns object
 */
function getUserProfileOverview(targetUserId, currentUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            // Get the target user
            const user = yield db_1.default.user.findFirst({
                where: {
                    OR: [
                        { id: { equals: targetUserId, mode: "insensitive" } },
                        { username: { equals: targetUserId, mode: "insensitive" } },
                    ],
                },
                select: {
                    id: true,
                    username: true,
                    name: true,
                    bio: true,
                    avatar: true,
                    meta: true,
                    role: true,
                    userType: true,
                    accountVerified: true,
                    createdAt: true,
                    metadata: true,
                    status: true,
                    _count: {
                        select: {
                            followers: {
                                where: { status: client_1.FollowStatus.ACCEPTED },
                            },
                            following: {
                                where: { status: client_1.FollowStatus.ACCEPTED },
                            },
                        },
                    },
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
                    // 1. is follower following current user?
                    following: {
                        where: { followingId: currentUserId },
                        select: { id: true, status: true },
                    },
                    // 2. is current user following follower?
                    followers: {
                        where: { followerId: currentUserId },
                        select: { id: true, status: true },
                    },
                },
            });
            if (!user)
                return { data: "User account not found", status: 404 };
            // Find the current user's followings who are also following the target user
            const result = user.id === currentUserId
                ? { count: 0, followers: [] }
                : yield (0, exports.getMutualFollowings)(user.id, currentUserId);
            // compose result
            const data = Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(user)), { conn: {
                    followerCount: user._count.followers,
                    followingCount: user._count.following,
                    mutualCount: result.count,
                    isFollowingUser: user.following.length > 0,
                    isFollowedByUser: user.followers.length > 0,
                    followingStatus: (_a = user === null || user === void 0 ? void 0 : user.following[0]) === null || _a === void 0 ? void 0 : _a.status,
                    followedStatus: (_b = user === null || user === void 0 ? void 0 : user.followers[0]) === null || _b === void 0 ? void 0 : _b.status,
                }, mutualFollowers: result.followers.map((f) => (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(f)), { conn: {
                        followerCount: f._count.followers,
                        followingCount: f._count.following,
                    } }))) });
            return { data, status: 200 };
        }
        catch (error) {
            return { data: "Error occurred, please try again", status: 500 };
        }
    });
}
const getMutualFollowings = (targetUserId_1, currentUserId_1, ...args_1) => __awaiter(void 0, [targetUserId_1, currentUserId_1, ...args_1], void 0, function* (targetUserId, currentUserId, limit = 5) {
    try {
        const [followers, count] = yield db_1.default.$transaction([
            db_1.default.user.findMany({
                where: {
                    // You follow them
                    followers: {
                        some: {
                            followerId: currentUserId, // <- YOU are the follower
                        },
                    },
                    // And they follow the target user
                    following: {
                        some: {
                            followingId: targetUserId,
                        },
                    },
                },
                select: {
                    id: true,
                    username: true,
                    name: true,
                    avatar: true,
                    bio: true,
                    meta: true,
                    role: true,
                    userType: true,
                    accountVerified: true,
                    createdAt: true,
                    metadata: true,
                    status: true,
                    _count: {
                        select: {
                            followers: true,
                            following: true,
                        },
                    },
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
                orderBy: [{ followers: { _count: "desc" } }],
                take: limit,
            }),
            db_1.default.user.count({
                where: {
                    // You follow them
                    followers: {
                        some: {
                            followerId: currentUserId, // <- YOU are the follower
                        },
                    },
                    // And they follow the target user
                    following: {
                        some: {
                            followingId: targetUserId,
                        },
                    },
                },
            }),
        ]);
        return { followers, count };
    }
    catch (error) {
        throw error;
    }
});
exports.getMutualFollowings = getMutualFollowings;
const getUserFollowers = (_a) => __awaiter(void 0, [_a], void 0, function* ({ targetUserId, currentUserId, limit = 50, page = 1, }) {
    const skip = (page - 1) * limit;
    try {
        const result = yield db_1.default.follow.findMany({
            where: {
                followingId: targetUserId,
            },
            include: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        meta: true,
                        role: true,
                        userType: true,
                        accountVerified: true,
                        createdAt: true,
                        metadata: true,
                        status: true,
                        _count: {
                            select: {
                                followers: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                                following: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                            },
                        },
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
                        // 1. is follower following current user?
                        following: {
                            where: { followingId: currentUserId },
                            select: { id: true, status: true },
                        },
                        // 2. is current user following follower?
                        followers: {
                            where: { followerId: currentUserId },
                            select: { id: true, status: true },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
            skip,
            take: limit,
        });
        if (result.length === 0) {
            return { status: 404, data: "not found" };
        }
        // compose result
        const data = result.map((r) => {
            var _a, _b, _c, _d;
            return (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(r.follower)), { conn: {
                    followerCount: r.follower._count.followers,
                    followingCount: r.follower._count.following,
                    isFollowingUser: r.follower.following.length > 0,
                    isFollowedByUser: r.follower.followers.length > 0,
                    followingStatus: (_b = (_a = r.follower) === null || _a === void 0 ? void 0 : _a.following[0]) === null || _b === void 0 ? void 0 : _b.status,
                    followedStatus: (_d = (_c = r.follower) === null || _c === void 0 ? void 0 : _c.followers[0]) === null || _d === void 0 ? void 0 : _d.status,
                } }));
        });
        return { status: 200, data };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserFollowers = getUserFollowers;
const getUserFollowing = (_a) => __awaiter(void 0, [_a], void 0, function* ({ targetUserId, currentUserId, limit = 50, page = 1, }) {
    const skip = (page - 1) * limit;
    try {
        const result = yield db_1.default.follow.findMany({
            where: {
                followerId: targetUserId,
            },
            include: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        meta: true,
                        role: true,
                        userType: true,
                        accountVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                            select: {
                                followers: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                                following: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                            },
                        },
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
                        // 1. is follower following current user?
                        following: {
                            where: { followingId: currentUserId },
                            select: { id: true, status: true },
                        },
                        // 2. is current user following follower?
                        followers: {
                            where: { followerId: currentUserId },
                            select: { id: true, status: true },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
            skip,
            take: limit,
        });
        if (result.length === 0) {
            return { status: 404, data: "not found" };
        }
        // compose result
        const data = result.map((r) => {
            var _a, _b, _c, _d;
            return (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(r.following)), { conn: {
                    followerCount: r.following._count.followers,
                    followingCount: r.following._count.following,
                    isFollowingUser: r.following.following.length > 0,
                    isFollowedByUser: r.following.followers.length > 0,
                    followingStatus: (_b = (_a = r.following) === null || _a === void 0 ? void 0 : _a.following[0]) === null || _b === void 0 ? void 0 : _b.status,
                    followedStatus: (_d = (_c = r.following) === null || _c === void 0 ? void 0 : _c.followers[0]) === null || _d === void 0 ? void 0 : _d.status,
                } }));
        });
        return { status: 200, data };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserFollowing = getUserFollowing;
const getUserFriends = (_a) => __awaiter(void 0, [_a], void 0, function* ({ targetUserId, currentUserId, limit = 50, page = 1, }) {
    const skip = (page - 1) * limit;
    try {
        const result = yield db_1.default.user.findMany({
            where: {
                AND: [
                    {
                        followers: {
                            some: { followerId: targetUserId, status: client_1.FollowStatus.ACCEPTED },
                        },
                    },
                    {
                        following: {
                            some: {
                                followingId: targetUserId,
                                status: client_1.FollowStatus.ACCEPTED,
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                username: true,
                name: true,
                avatar: true,
                bio: true,
                meta: true,
                role: true,
                userType: true,
                accountVerified: true,
                createdAt: true,
                metadata: true,
                status: true,
                _count: {
                    select: {
                        followers: {
                            where: { status: client_1.FollowStatus.ACCEPTED },
                        },
                        following: {
                            where: { status: client_1.FollowStatus.ACCEPTED },
                        },
                    },
                },
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
                // 1. is follower following current user?
                following: {
                    where: { followingId: currentUserId },
                    select: { id: true, status: true },
                },
                // 2. is current user following follower?
                followers: {
                    where: { followerId: currentUserId },
                    select: { id: true, status: true },
                },
            },
            orderBy: [{ createdAt: "desc" }],
            skip,
            take: limit,
        });
        if (result.length === 0) {
            return { status: 404, data: "not found" };
        }
        // compose result
        const data = result.map((r) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(r)), { conn: {
                    followerCount: r._count.followers,
                    followingCount: r._count.following,
                    isFollowingUser: r.following.length > 0,
                    isFollowedByUser: r.followers.length > 0,
                    followingStatus: (_a = r === null || r === void 0 ? void 0 : r.following[0]) === null || _a === void 0 ? void 0 : _a.status,
                    followedStatus: (_b = r === null || r === void 0 ? void 0 : r.followers[0]) === null || _b === void 0 ? void 0 : _b.status,
                } }));
        });
        return { status: 200, data };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserFriends = getUserFriends;
const getUserVerifiedFollowers = (_a) => __awaiter(void 0, [_a], void 0, function* ({ targetUserId, currentUserId, limit = 50, page = 1, }) {
    const skip = (page - 1) * limit;
    try {
        const result = yield db_1.default.follow.findMany({
            where: {
                followingId: targetUserId,
                follower: {
                    OR: [
                        {
                            accountVerified: true,
                        },
                        {
                            subscriptions: {
                                some: {
                                    status: {
                                        in: [
                                            client_1.SubStatusEnum.ACTIVE,
                                            client_1.SubStatusEnum.TRIAL,
                                            client_1.SubStatusEnum.PAYMENT_ERROR,
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
            include: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        meta: true,
                        role: true,
                        userType: true,
                        accountVerified: true,
                        createdAt: true,
                        metadata: true,
                        status: true,
                        _count: {
                            select: {
                                followers: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                                following: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                            },
                        },
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
                        // 1. is follower following current user?
                        following: {
                            where: { followingId: currentUserId },
                            select: { id: true, status: true },
                        },
                        // 2. is current user following follower?
                        followers: {
                            where: { followerId: currentUserId },
                            select: { id: true, status: true },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
            skip,
            take: limit,
        });
        if (result.length === 0) {
            return { status: 404, data: "not found" };
        }
        // compose result
        const data = result.map((r) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(r.follower)), { conn: {
                    followerCount: r.follower._count.followers,
                    followingCount: r.follower._count.following,
                    isFollowingUser: r.follower.following.length > 0,
                    isFollowedByUser: r.follower.followers.length > 0,
                    followingStatus: (_a = r === null || r === void 0 ? void 0 : r.follower.following[0]) === null || _a === void 0 ? void 0 : _a.status,
                    followedStatus: (_b = r === null || r === void 0 ? void 0 : r.follower.followers[0]) === null || _b === void 0 ? void 0 : _b.status,
                } }));
        });
        return { status: 200, data };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserVerifiedFollowers = getUserVerifiedFollowers;
const getUserFollowRequests = (_a) => __awaiter(void 0, [_a], void 0, function* ({ targetUserId, currentUserId, limit = 50, page = 1, }) {
    const skip = (page - 1) * limit;
    try {
        const result = yield db_1.default.follow.findMany({
            where: {
                followingId: targetUserId,
                status: client_1.FollowStatus.PENDING,
            },
            include: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        name: true,
                        avatar: true,
                        bio: true,
                        meta: true,
                        role: true,
                        userType: true,
                        accountVerified: true,
                        createdAt: true,
                        metadata: true,
                        status: true,
                        _count: {
                            select: {
                                followers: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                                following: {
                                    where: { status: client_1.FollowStatus.ACCEPTED },
                                },
                            },
                        },
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
                        // 1. is follower following current user?
                        following: {
                            where: { followingId: currentUserId },
                            select: { id: true, status: true },
                        },
                        // 2. is current user following follower?
                        followers: {
                            where: { followerId: currentUserId },
                            select: { id: true, status: true },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
            skip,
            take: limit,
        });
        if (result.length === 0) {
            return { status: 404, data: "not found" };
        }
        // compose result
        const data = result.map((r) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, (0, utils_1.composePublicUser)(r.follower)), { conn: {
                    followerCount: r.follower._count.followers,
                    followingCount: r.follower._count.following,
                    isFollowingUser: r.follower.following.length > 0,
                    isFollowedByUser: r.follower.followers.length > 0,
                    followingStatus: (_a = r === null || r === void 0 ? void 0 : r.follower.following[0]) === null || _a === void 0 ? void 0 : _a.status,
                    followedStatus: (_b = r === null || r === void 0 ? void 0 : r.follower.followers[0]) === null || _b === void 0 ? void 0 : _b.status,
                } }));
        });
        return { status: 200, data };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getUserFollowRequests = getUserFollowRequests;
const getUserPosts = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const feedPosts = yield db_1.default.post.findMany({
            where: {
                OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
                status: client_1.PostStatus.PUBLISHED,
                deletedAt: null,
                userId,
            },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                thread: false,
                media: true,
                root: {
                    select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                            where: {
                                followerId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
                        following: {
                            where: {
                                followingId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
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
                                continent: true,
                            },
                        },
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                quiz: {
                    include: {
                        options: {
                            include: {
                                participants: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                parent: {
                    include: {
                        media: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                root: {
                                    select: {
                                        id: true,
                                        scope: true,
                                        userId: true,
                                        rootId: true,
                                    },
                                },
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        metadata: true,
                                        createdAt: true,
                                        status: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                            },
                        },
                    },
                },
                likes: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        // Step 3: Attach repost status to feed posts
        const data = feedPosts.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })));
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserPosts = getUserPosts;
const getUserReplies = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const feedPosts = yield db_1.default.post.findMany({
            where: {
                OR: [{ kind: "REPLY" }, { kind: "REPOST" }, { kind: "QUOTE" }],
                status: client_1.PostStatus.PUBLISHED,
                deletedAt: null,
                userId,
            },
            skip: (page - 1) * limit,
            take: 2,
            include: {
                thread: false,
                media: true,
                root: {
                    select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                            where: {
                                followerId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
                        following: {
                            where: {
                                followingId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
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
                                continent: true,
                            },
                        },
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                quiz: {
                    include: {
                        options: {
                            include: {
                                participants: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                parent: {
                    include: {
                        media: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                root: {
                                    select: {
                                        id: true,
                                        scope: true,
                                        userId: true,
                                        rootId: true,
                                    },
                                },
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        metadata: true,
                                        createdAt: true,
                                        status: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                            },
                        },
                    },
                },
                likes: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        const buildAncestry = (post) => {
            const trail = [];
            let current = post;
            let depth = 0;
            while (current && depth < 3) {
                trail.unshift(current);
                current = current.parent;
                depth++;
            }
            return trail.slice(1);
        };
        // Step 3: Attach repost status to feed posts
        const data = feedPosts
            .map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })))
            .map((post) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, post), { parentChain: buildAncestry(post.parent), hasMoreAncestors: ((_b = (_a = post.parent) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0 ? void 0 : _b.id) !== undefined }));
        });
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserReplies = getUserReplies;
const getUserLikedPosts = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const result = yield db_1.default.likedPost.findMany({
            where: {
                userId,
                post: {
                    status: client_1.PostStatus.PUBLISHED,
                    deletedAt: null,
                },
            },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                post: {
                    include: {
                        thread: false,
                        media: true,
                        root: {
                            select: {
                                id: true,
                                scope: true,
                                userId: true,
                                rootId: true,
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        metadata: true,
                                        createdAt: true,
                                        status: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                parent: {
                                    include: {
                                        media: true,
                                        root: {
                                            select: {
                                                id: true,
                                                scope: true,
                                                userId: true,
                                                rootId: true,
                                            },
                                        },
                                        user: {
                                            select: {
                                                id: true,
                                                name: true,
                                                username: true,
                                                avatar: true,
                                                bio: true,
                                                role: true,
                                                userType: true,
                                                meta: true,
                                                isVerified: true,
                                                metadata: true,
                                                createdAt: true,
                                                status: true,
                                                followers: {
                                                    where: {
                                                        followerId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                    },
                                                },
                                                following: {
                                                    where: {
                                                        followingId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                    },
                                                },
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
                                                        continent: true,
                                                    },
                                                },
                                            },
                                        },
                                        quiz: {
                                            include: {
                                                options: {
                                                    include: {
                                                        participants: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        poll: {
                                            include: {
                                                options: {
                                                    include: {
                                                        voters: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        likes: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                        bookmarks: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        const feedPosts = result.map((r) => r.post);
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        // Step 3: Attach repost status to feed posts
        const data = feedPosts.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })));
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserLikedPosts = getUserLikedPosts;
const getUserBookmarkPosts = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const result = yield db_1.default.bookmark.findMany({
            where: {
                userId,
                post: {
                    status: client_1.PostStatus.PUBLISHED,
                    deletedAt: null,
                },
            },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                post: {
                    include: {
                        thread: false,
                        media: true,
                        root: {
                            select: {
                                id: true,
                                scope: true,
                                userId: true,
                                rootId: true,
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        metadata: true,
                                        createdAt: true,
                                        status: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                parent: {
                                    include: {
                                        media: true,
                                        root: {
                                            select: {
                                                id: true,
                                                scope: true,
                                                userId: true,
                                                rootId: true,
                                            },
                                        },
                                        user: {
                                            select: {
                                                id: true,
                                                name: true,
                                                username: true,
                                                avatar: true,
                                                bio: true,
                                                role: true,
                                                userType: true,
                                                meta: true,
                                                isVerified: true,
                                                metadata: true,
                                                createdAt: true,
                                                status: true,
                                                followers: {
                                                    where: {
                                                        followerId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                        status: true
                                                    },
                                                },
                                                following: {
                                                    where: {
                                                        followingId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                        status: true
                                                    },
                                                },
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
                                                        continent: true,
                                                    },
                                                },
                                            },
                                        },
                                        quiz: {
                                            include: {
                                                options: {
                                                    include: {
                                                        participants: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        poll: {
                                            include: {
                                                options: {
                                                    include: {
                                                        voters: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        likes: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                        bookmarks: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        const feedPosts = result.map((r) => r.post);
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        // Step 3: Attach repost status to feed posts
        const data = feedPosts.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })));
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserBookmarkPosts = getUserBookmarkPosts;
const getUserHighlightPosts = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const result = yield db_1.default.postHighlight.findMany({
            where: {
                userId,
                post: {
                    status: client_1.PostStatus.PUBLISHED,
                    deletedAt: null,
                },
            },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                post: {
                    include: {
                        thread: false,
                        media: true,
                        root: {
                            select: {
                                id: true,
                                scope: true,
                                userId: true,
                                rootId: true,
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        metadata: true,
                                        createdAt: true,
                                        status: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                parent: {
                                    include: {
                                        media: true,
                                        root: {
                                            select: {
                                                id: true,
                                                scope: true,
                                                userId: true,
                                                rootId: true,
                                            },
                                        },
                                        user: {
                                            select: {
                                                id: true,
                                                name: true,
                                                username: true,
                                                avatar: true,
                                                bio: true,
                                                role: true,
                                                userType: true,
                                                meta: true,
                                                isVerified: true,
                                                metadata: true,
                                                createdAt: true,
                                                status: true,
                                                followers: {
                                                    where: {
                                                        followerId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                        status: true
                                                    },
                                                },
                                                following: {
                                                    where: {
                                                        followingId: user.id,
                                                    },
                                                    select: {
                                                        id: true,
                                                        followerId: true,
                                                        followingId: true,
                                                        status: true
                                                    },
                                                },
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
                                                        continent: true,
                                                    },
                                                },
                                            },
                                        },
                                        quiz: {
                                            include: {
                                                options: {
                                                    include: {
                                                        participants: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        poll: {
                                            include: {
                                                options: {
                                                    include: {
                                                        voters: {
                                                            where: {
                                                                userId: user.id,
                                                            },
                                                        },
                                                    },
                                                },
                                                continents: true,
                                                countries: true,
                                            },
                                        },
                                        likes: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                        bookmarks: {
                                            where: {
                                                userId: user.id, // Check if the current user has liked the post
                                            },
                                            select: {
                                                id: true, // Fetch only the like ID (or boolean flag)
                                                userId: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        const feedPosts = result.map((r) => r.post);
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        // Step 3: Attach repost status to feed posts
        const data = feedPosts.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })));
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserHighlightPosts = getUserHighlightPosts;
const getUserMediaPosts = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, limit = 21, page = 1 } = args;
        const feedPosts = yield db_1.default.post.findMany({
            where: {
                status: client_1.PostStatus.PUBLISHED,
                deletedAt: null,
                userId,
                media: { some: {} },
            },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                thread: false,
                media: true,
                root: {
                    select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                            where: {
                                followerId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
                        following: {
                            where: {
                                followingId: user.id,
                            },
                            select: { id: true, followerId: true, followingId: true, status: true },
                        },
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
                                continent: true,
                            },
                        },
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                quiz: {
                    include: {
                        options: {
                            include: {
                                participants: {
                                    where: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                        continents: true,
                        countries: true,
                    },
                },
                parent: {
                    include: {
                        media: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                username: true,
                                avatar: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                isVerified: true,
                                metadata: true,
                                createdAt: true,
                                status: true,
                                followers: {
                                    where: {
                                        followerId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
                                following: {
                                    where: {
                                        followingId: user.id,
                                    },
                                    select: { id: true, followerId: true, followingId: true, status: true },
                                },
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
                                        continent: true,
                                    },
                                },
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        poll: {
                            include: {
                                options: {
                                    include: {
                                        voters: {
                                            where: {
                                                userId: user.id,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                        likes: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        bookmarks: {
                            where: {
                                userId: user.id, // Check if the current user has liked the post
                            },
                            select: {
                                id: true, // Fetch only the like ID (or boolean flag)
                                userId: true,
                            },
                        },
                        parent: {
                            include: {
                                media: true,
                                root: {
                                    select: {
                                        id: true,
                                        scope: true,
                                        userId: true,
                                        rootId: true,
                                    },
                                },
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true,
                                        avatar: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        isVerified: true,
                                        followers: {
                                            where: {
                                                followerId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
                                        following: {
                                            where: {
                                                followingId: user.id,
                                            },
                                            select: { id: true, followerId: true, followingId: true, status: true },
                                        },
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
                                                continent: true,
                                            },
                                        },
                                    },
                                },
                                quiz: {
                                    include: {
                                        options: {
                                            include: {
                                                participants: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                poll: {
                                    include: {
                                        options: {
                                            include: {
                                                voters: {
                                                    where: {
                                                        userId: user.id,
                                                    },
                                                },
                                            },
                                        },
                                        continents: true,
                                        countries: true,
                                    },
                                },
                                likes: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                                bookmarks: {
                                    where: {
                                        userId: user.id, // Check if the current user has liked the post
                                    },
                                    select: {
                                        id: true, // Fetch only the like ID (or boolean flag)
                                        userId: true,
                                    },
                                },
                            },
                        },
                    },
                },
                likes: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId: user.id, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
            orderBy: [{ createdAt: "desc" }],
        });
        // Step 2: Fetch all reposts by the current user for these posts
        const postIds = feedPosts.map((post) => post.id); // Collect all post IDs
        const userReposts = yield db_1.default.post.findMany({
            where: {
                userId: user.id, // Current user's posts
                kind: client_1.PostKindEnum.REPOST, // Only reposts
                OR: [
                    { parentId: { in: postIds } }, // User reposted the post itself
                    { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                ],
            },
            select: {
                id: true, // User's repost (child repost)
                parentId: true, // Get only parent post IDs (original posts the user reposted)
            },
        });
        // Step 3: Attach repost status to feed posts
        const data = feedPosts.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((repost) => repost.parentId === post.id), parent: post.parent
                ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((repost) => repost.parentId === (post === null || post === void 0 ? void 0 : post.parentId)) }) : post.parent })));
        const _posts = data.map((p) => (0, utils_1.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getUserMediaPosts = getUserMediaPosts;
