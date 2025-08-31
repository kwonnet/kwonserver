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
exports.retriveRecommendationModelData = exports.voteQuizPost = exports.votePollPost = exports.hidePostReply = exports.restorePost = exports.deletePost = exports.updateReposts = exports.updatePostShares = exports.updatePostBookmarks = exports.updatePostReactions = exports.fetchFeedPostReplies = exports.getPostFeedDetails = exports.getPostReposters = exports.getPostQuotes = exports.getPostReplies = exports.getEmbedPost = exports.getNewsfeed = exports.notInterestedPost = exports.createPostHighlight = exports.createPostPin = exports.reportPost = exports.createPostReply = exports.createPostQuote = exports.createPost = void 0;
exports.createPostImpression = createPostImpression;
exports.createPostView = createPostView;
exports.createPostClick = createPostClick;
exports.createPostMediaLog = createPostMediaLog;
exports.createPostTip = createPostTip;
exports.insertImpressionQueue = insertImpressionQueue;
exports.fetchPostAncestry = fetchPostAncestry;
exports.getPostParentChain = getPostParentChain;
const db_1 = __importDefault(require("@/db"));
const logger_1 = __importDefault(require("@/logger"));
const utils_1 = require("@/utils");
const webpush_1 = __importDefault(require("@/utils/webpush"));
const client_1 = require("@prisma/client");
const utils_2 = require("../utils");
const redis_1 = __importDefault(require("@/redis"));
const helpers_1 = require("@/utils/helpers");
const createPost = (body, userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // check rewarded quiz and check if user has enough coins
        const rewardedQuiz = body.thread.filter((item) => { var _a; return item.type === client_1.PostTypeEnum.QUIZ || ((_a = item.quiz) === null || _a === void 0 ? void 0 : _a.isPaid); });
        const totalRewardAmount = rewardedQuiz.reduce((prev, curr) => { var _a, _b; return prev + ((_b = (_a = curr.quiz) === null || _a === void 0 ? void 0 : _a.rewardAmount) !== null && _b !== void 0 ? _b : 0); }, 0);
        //  check user wallet balance
        if (rewardedQuiz.length > 0) {
            const userWallet = yield db_1.default.wallet.findUniqueOrThrow({
                where: { userId },
            });
            if (userWallet.coins < totalRewardAmount) {
                return {
                    data: "Insufficient balance to create reward quiz",
                    status: 400,
                };
            }
        }
        const isScheduled = !!body.scheduleAt;
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // locked user wallet temporary
            if (rewardedQuiz.length > 0) {
                yield tx.wallet.update({
                    where: { userId },
                    data: {
                        isLocked: true,
                    },
                });
            }
            // check if scheduled
            const schedule = body.scheduleAt
                ? {
                    status: body.isDraft ? client_1.PostStatus.DRAFT : client_1.PostStatus.SCHEDULED,
                    scheduleAt: new Date(body.scheduleAt),
                }
                : {};
            // Step 1: Create the root post (first item in the array)
            const _a = body.thread[0], { poll, quiz, tags, mentions, tagUsers } = _a, rest = __rest(_a, ["poll", "quiz", "tags", "mentions", "tagUsers"]);
            let rootPost = undefined;
            // get mentioned users if any
            const users = yield db_1.default.user.findMany({
                where: { username: { in: mentions } },
            });
            const mentionedUsers = users.map((user) => user.id);
            if (rest.type === client_1.PostTypeEnum.POLL) {
                const _pollItem = poll;
                const expireAt = getExpiryDate(_pollItem.duration);
                const pollItem = (0, helpers_1.removeProperty)(_pollItem, "duration");
                rootPost = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, media: { createMany: { data: rest.media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, poll: {
                            create: Object.assign(Object.assign({}, pollItem), { expireAt, options: {
                                    createMany: {
                                        data: pollItem.options.map((opt) => ({ text: opt.text })),
                                    },
                                }, countries: {
                                    createMany: {
                                        data: pollItem.countries.map((id) => ({ countryId: id })),
                                    },
                                }, continents: {
                                    createMany: {
                                        data: pollItem.continents.map((id) => ({
                                            continentId: id,
                                        })),
                                    },
                                } }),
                        }, userId, kind: client_1.PostKindEnum.ROOT }),
                    include: {
                        quiz: true,
                    },
                });
            }
            else if (rest.type === client_1.PostTypeEnum.QUIZ) {
                const _quizItem = quiz;
                const expireAt = getExpiryDate(_quizItem.duration);
                const quizItem = (0, helpers_1.removeProperty)(_quizItem, "duration");
                rootPost = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, userId, kind: client_1.PostKindEnum.ROOT, media: { createMany: { data: rest.media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, quiz: {
                            create: Object.assign(Object.assign({}, quizItem), { expireAt, options: {
                                    createMany: {
                                        data: quizItem.options.map((opt) => ({
                                            text: opt.text,
                                            isCorrect: opt.isCorrect,
                                        })),
                                    },
                                }, countries: {
                                    createMany: {
                                        data: quizItem.countries.map((id) => ({ countryId: id })),
                                    },
                                }, continents: {
                                    createMany: {
                                        data: quizItem.continents.map((id) => ({
                                            continentId: id,
                                        })),
                                    },
                                } }),
                        } }),
                    include: {
                        quiz: true,
                    },
                });
            }
            else {
                rootPost = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, media: { createMany: { data: rest.media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, userId, kind: client_1.PostKindEnum.ROOT }),
                    include: {
                        quiz: true,
                    },
                });
            }
            const thread = [];
            if (body.thread.length > 1) {
                // Step 2: Insert thread posts (all linked to root post)
                const threadPosts = body.thread.slice(1);
                for (let i = 0; i < threadPosts.length; i++) {
                    const _b = threadPosts[i], { mentions, tags, poll, quiz, tagUsers } = _b, item = __rest(_b, ["mentions", "tags", "poll", "quiz", "tagUsers"]);
                    // get mentioned users if any
                    const users = mentions.length > 0
                        ? yield db_1.default.user.findMany({
                            where: { username: { in: mentions } },
                        })
                        : [];
                    const mentionedUsers = users.map((user) => user.id);
                    // check post type
                    if (item.type === client_1.PostTypeEnum.POLL) {
                        const _pollItem = poll;
                        const expireAt = getExpiryDate(_pollItem.duration);
                        const pollItem = (0, helpers_1.removeProperty)(_pollItem, "duration");
                        const res = yield tx.post.create({
                            data: Object.assign(Object.assign(Object.assign(Object.assign({}, item), { parentId: rootPost.id }), schedule), { location: body.location, media: { createMany: { data: item.media } }, hashTags: {
                                    create: tags.map((name) => ({
                                        tag: {
                                            connectOrCreate: {
                                                where: { name },
                                                create: { name },
                                            },
                                        },
                                    })),
                                }, mentions: {
                                    createMany: {
                                        data: mentionedUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                }, tagUsers: {
                                    createMany: {
                                        data: tagUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                }, poll: {
                                    create: Object.assign(Object.assign({}, pollItem), { expireAt, options: {
                                            createMany: {
                                                data: pollItem.options.map((opt) => ({
                                                    text: opt.text,
                                                })),
                                            },
                                        }, countries: {
                                            createMany: {
                                                data: pollItem.countries.map((id) => ({
                                                    countryId: id,
                                                })),
                                            },
                                        }, continents: {
                                            createMany: {
                                                data: pollItem.continents.map((id) => ({
                                                    continentId: id,
                                                })),
                                            },
                                        } }),
                                }, userId, kind: client_1.PostKindEnum.THREAD }),
                            include: {
                                quiz: true,
                            },
                        });
                        thread.push(res);
                    }
                    else if (item.type === client_1.PostTypeEnum.QUIZ) {
                        const _quizItem = quiz;
                        const expireAt = getExpiryDate(_quizItem.duration);
                        const quizItem = (0, helpers_1.removeProperty)(_quizItem, "duration");
                        const res = yield tx.post.create({
                            data: Object.assign(Object.assign(Object.assign({}, item), schedule), { parentId: rootPost.id, location: body.location, userId, kind: client_1.PostKindEnum.THREAD, media: { createMany: { data: item.media } }, hashTags: {
                                    create: tags.map((name) => ({
                                        tag: {
                                            connectOrCreate: {
                                                where: { name },
                                                create: { name },
                                            },
                                        },
                                    })),
                                }, mentions: {
                                    createMany: {
                                        data: mentionedUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                }, tagUsers: {
                                    createMany: {
                                        data: tagUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                }, quiz: {
                                    create: Object.assign(Object.assign({}, quizItem), { expireAt, options: {
                                            createMany: {
                                                data: quizItem.options.map((opt) => ({
                                                    text: opt.text,
                                                    isCorrect: opt.isCorrect,
                                                })),
                                            },
                                        }, countries: {
                                            createMany: {
                                                data: quizItem.countries.map((id) => ({
                                                    countryId: id,
                                                })),
                                            },
                                        }, continents: {
                                            createMany: {
                                                data: quizItem.continents.map((id) => ({
                                                    continentId: id,
                                                })),
                                            },
                                        } }),
                                } }),
                            include: {
                                quiz: true,
                            },
                        });
                        thread.push(res);
                    }
                    else {
                        const res = yield tx.post.create({
                            data: Object.assign(Object.assign(Object.assign({}, item), schedule), { parentId: rootPost.id, location: body.location, userId, kind: client_1.PostKindEnum.THREAD, media: { createMany: { data: item.media } }, hashTags: {
                                    create: tags.map((name) => ({
                                        tag: {
                                            connectOrCreate: {
                                                where: { name },
                                                create: { name },
                                            },
                                        },
                                    })),
                                }, mentions: {
                                    createMany: {
                                        data: mentionedUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                }, tagUsers: {
                                    createMany: {
                                        data: tagUsers.map((id) => ({ userId: id })),
                                        skipDuplicates: true,
                                    },
                                } }),
                            include: {
                                quiz: true,
                            },
                        });
                        thread.push(res);
                    }
                }
            }
            // deduct user wallet for the paid quiz
            const rewardPostQuizzes = [rootPost, ...thread]
                .filter((p) => p.type === client_1.PostTypeEnum.QUIZ)
                .filter((p) => { var _a; return (_a = p.quiz) === null || _a === void 0 ? void 0 : _a.isPaid; });
            if (rewardPostQuizzes.length > 0) {
                yield Promise.all(rewardPostQuizzes.map((post) => __awaiter(void 0, void 0, void 0, function* () {
                    const quiz = post.quiz;
                    const wallet = yield tx.wallet.update({
                        where: { userId },
                        data: {
                            isLocked: false,
                            coins: {
                                decrement: quiz.rewardAmount,
                            },
                        },
                    });
                    return tx.transaction.create({
                        data: {
                            userId,
                            amount: quiz.rewardAmount,
                            postId: post.id,
                            txnRef: (0, utils_1.generateUniqueRef)(),
                            description: `Quiz reward pool`,
                            senderId: post.userId,
                            walletId: wallet.id,
                            type: client_1.TxnTypeEnum.DEBIT,
                            currency: client_1.TxnCurrencyEnum.COINS,
                            source: client_1.TxnSourceEnum.COINS,
                            gateway: client_1.TxnGatewayEnum.WALLET,
                            status: client_1.TxnStatusEnum.COMPLETED,
                            category: client_1.TxnCategoryEnum.QUIZ_POST,
                        },
                    });
                })));
            }
            return Object.assign(Object.assign({}, rootPost), { thread });
        }));
        triggerPushNotification("cm8wuohmp0002c9jnx181fdno", (_b = (_a = result.content) === null || _a === void 0 ? void 0 : _a.slice(0, 100)) !== null && _b !== void 0 ? _b : "User just published a post");
        // 1. if this is a scheduled post, schedule the post
        // isScheduled, scheduleAt, postId: result.id
        // 2. Notify tagged & mentioned users
        return { data: {}, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred trying to create post, please try again",
            status: 500,
        };
    }
});
exports.createPost = createPost;
const createPostQuote = (postId, userId, body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isScheduled = !!body.scheduleAt;
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // check if post exists
            yield tx.post.findUniqueOrThrow({ where: { id: postId } });
            // check if scheduled
            const schedule = body.scheduleAt
                ? {
                    status: body.isDraft ? client_1.PostStatus.DRAFT : client_1.PostStatus.SCHEDULED,
                    scheduleAt: new Date(body.scheduleAt),
                }
                : {};
            // Step 1: Create the root post (first item in the array)
            const _a = body.thread[0], { poll, quiz, tags, mentions, tagUsers } = _a, rest = __rest(_a, ["poll", "quiz", "tags", "mentions", "tagUsers"]);
            let rootPost = undefined;
            // get mentioned users if any
            const users = yield db_1.default.user.findMany({
                where: { username: { in: mentions } },
            });
            const mentionedUsers = users.map((user) => user.id);
            if (rest.type === client_1.PostTypeEnum.POLL) {
                const _pollItem = poll;
                const expireAt = getExpiryDate(_pollItem.duration);
                const pollItem = (0, helpers_1.removeProperty)(_pollItem, "duration");
                rootPost = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, media: { createMany: { data: rest.media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, poll: {
                            create: Object.assign(Object.assign({}, pollItem), { expireAt, options: {
                                    createMany: {
                                        data: pollItem.options.map((opt) => ({ text: opt.text })),
                                    },
                                }, countries: {
                                    createMany: {
                                        data: pollItem.countries.map((id) => ({ countryId: id })),
                                    },
                                }, continents: {
                                    createMany: {
                                        data: pollItem.continents.map((id) => ({
                                            continentId: id,
                                        })),
                                    },
                                } }),
                        }, userId, kind: client_1.PostKindEnum.QUOTE, parentId: postId }),
                });
            }
            else {
                rootPost = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, media: { createMany: { data: rest.media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, userId, kind: client_1.PostKindEnum.QUOTE, parentId: postId }),
                });
            }
            // if (body.thread.length === 1){
            //   return { isQuoted: true, data: { postId, userId } };
            // }
            // Step 2: Insert thread posts (all linked to root post)
            const threadPosts = body.thread.slice(1);
            const thread = [];
            for (let i = 0; i < threadPosts.length; i++) {
                let res = undefined;
                const _b = threadPosts[i], { mentions, tags, quiz, poll, tagUsers } = _b, item = __rest(_b, ["mentions", "tags", "quiz", "poll", "tagUsers"]);
                // get mentioned users if any
                const users = mentions.length > 0
                    ? yield db_1.default.user.findMany({
                        where: { username: { in: mentions } },
                    })
                    : [];
                const mentionedUsers = users.map((user) => user.id);
                // check post type
                if (item.type === client_1.PostTypeEnum.POLL) {
                    const _pollItem = poll;
                    const expireAt = getExpiryDate(_pollItem.duration);
                    const pollItem = (0, helpers_1.removeProperty)(_pollItem, "duration");
                    res = yield tx.post.create({
                        data: Object.assign(Object.assign(Object.assign({}, item), schedule), { location: body.location, media: { createMany: { data: item.media } }, hashTags: {
                                create: tags.map((name) => ({
                                    tag: {
                                        connectOrCreate: {
                                            where: { name },
                                            create: { name },
                                        },
                                    },
                                })),
                            }, mentions: {
                                createMany: {
                                    data: mentionedUsers.map((id) => ({ userId: id })),
                                    skipDuplicates: true,
                                },
                            }, tagUsers: {
                                createMany: {
                                    data: tagUsers.map((id) => ({ userId: id })),
                                    skipDuplicates: true,
                                },
                            }, poll: {
                                create: Object.assign(Object.assign({}, pollItem), { expireAt, options: {
                                        createMany: {
                                            data: pollItem.options.map((opt) => ({ text: opt.text })),
                                        },
                                    }, countries: {
                                        createMany: {
                                            data: pollItem.countries.map((id) => ({
                                                countryId: id,
                                            })),
                                        },
                                    }, continents: {
                                        createMany: {
                                            data: pollItem.continents.map((id) => ({
                                                continentId: id,
                                            })),
                                        },
                                    } }),
                            }, userId, kind: client_1.PostKindEnum.THREAD, parentId: rootPost.id }),
                    });
                }
                else {
                    res = yield tx.post.create({
                        data: Object.assign(Object.assign(Object.assign({}, item), schedule), { location: body.location, userId, kind: client_1.PostKindEnum.THREAD, parentId: rootPost.id, media: { createMany: { data: item.media } }, hashTags: {
                                create: tags.map((name) => ({
                                    tag: {
                                        connectOrCreate: {
                                            where: { name },
                                            create: { name },
                                        },
                                    },
                                })),
                            }, mentions: {
                                createMany: {
                                    data: mentionedUsers.map((id) => ({ userId: id })),
                                    skipDuplicates: true,
                                },
                            }, tagUsers: {
                                createMany: {
                                    data: tagUsers.map((id) => ({ userId: id })),
                                    skipDuplicates: true,
                                },
                            } }),
                    });
                }
                thread.push(res);
            }
            // Increase totalQuotes count for the original post
            yield tx.post.update({
                where: { id: postId },
                data: { totalQuotes: { increment: 1 } },
            });
            return { isQuoted: true, data: { postId, userId } };
        }));
        return { data: result, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred while processing request, please try again",
            status: 500,
        };
    }
});
exports.createPostQuote = createPostQuote;
const createPostReply = (postId, body, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            let reply = undefined;
            const post = yield tx.post.findUniqueOrThrow({ where: { id: postId } });
            const rootId = post.rootId || post.id;
            // check if scheduled
            const { isDraft, thread } = body;
            const schedule = body.scheduleAt
                ? {
                    status: isDraft ? client_1.PostStatus.DRAFT : client_1.PostStatus.SCHEDULED,
                    scheduleAt: new Date(body.scheduleAt),
                }
                : {};
            // create new post reply
            const _a = thread[0], { mentions, tagUsers, tags, media, poll, quiz } = _a, rest = __rest(_a, ["mentions", "tagUsers", "tags", "media", "poll", "quiz"]);
            // get mentioned users if any
            const users = yield db_1.default.user.findMany({
                where: { username: { in: mentions } },
            });
            const mentionedUsers = users.map((user) => user.id);
            if (rest.type === client_1.PostTypeEnum.POLL) {
                const _pollItem = poll;
                const expireAt = getExpiryDate(_pollItem.duration);
                const pollItem = (0, helpers_1.removeProperty)(_pollItem, "duration");
                reply = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, rootId, media: { createMany: { data: media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, poll: {
                            create: Object.assign(Object.assign({}, pollItem), { expireAt, options: {
                                    createMany: {
                                        data: pollItem.options.map((opt) => ({ text: opt.text })),
                                    },
                                }, countries: {
                                    createMany: {
                                        data: pollItem.countries.map((id) => ({ countryId: id })),
                                    },
                                }, continents: {
                                    createMany: {
                                        data: pollItem.continents.map((id) => ({
                                            continentId: id,
                                        })),
                                    },
                                } }),
                        }, userId: user.id, kind: client_1.PostKindEnum.REPLY, parentId: postId }),
                });
            }
            else {
                reply = yield tx.post.create({
                    data: Object.assign(Object.assign(Object.assign({}, rest), schedule), { location: body.location, rootId, media: { createMany: { data: media } }, hashTags: {
                            create: tags.map((name) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { name },
                                        create: { name },
                                    },
                                },
                            })),
                        }, mentions: {
                            createMany: {
                                data: mentionedUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, tagUsers: {
                            createMany: {
                                data: tagUsers.map((id) => ({ userId: id })),
                                skipDuplicates: true,
                            },
                        }, userId: user.id, kind: client_1.PostKindEnum.REPLY, parentId: postId }),
                });
            }
            // Increase totalQuotes count for the parent post
            yield tx.post.update({
                where: { id: postId },
                data: { totalReplies: { increment: 1 } },
            });
            return { reply, replied: true, id: postId, userId: user.id };
        }));
        const { reply } = result, rest = __rest(result, ["reply"]);
        // check if it's neither schedule nor draft and return the reply to the ui
        if (reply && !body.isDraft && !body.scheduleAt) {
            const res = yield getSinglePost(reply.id, user.id);
            if (!res)
                return { data: rest, status: 200 };
            const transformed = (0, utils_2.transformPost)(res, true, user);
            return { data: Object.assign(Object.assign({}, rest), { reply: transformed }), status: 200 };
        }
        return { data: rest, status: 200 };
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.createPostReply = createPostReply;
const reportPost = (body, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const report = yield db_1.default.postReport.findFirst({
            where: { postId: body.id, userId: user.id },
            orderBy: [{ createdAt: "desc" }],
        });
        // check if the user has already reported the post with 24 hours
        if (report &&
            new Date(report.createdAt).getTime() >
                new Date(Date.now() - 1000 * 60 * 60 * 24).getTime()) {
            return {
                data: "You have already reported this post, wait till after 24hrs to report again",
                status: 400,
            };
        }
        // check if the post exists
        const post = yield db_1.default.post.findUniqueOrThrow({
            where: { id: body.id },
        });
        // report the post
        yield db_1.default.postReport.create({
            data: {
                postId: body.id,
                userId: user.id,
                reason: body.code,
                meta: body.meta,
                message: body.message,
            },
        });
        return { data: { id: post.id, userId: user.id }, status: 200 };
    }
    catch (error) {
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.reportPost = reportPost;
const createPostPin = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.postPin.findFirst({
            where: { postId: args.id, contextType: args.context, userId: user.id },
            orderBy: [{ createdAt: "desc" }],
        });
        // check if the user has already reported the post with 24 hours
        if (result) {
            yield db_1.default.postPin.delete({ where: { id: result.id } });
            return {
                data: { id: args.id, userId: user.id, isPinned: false },
                status: 200,
            };
        }
        // check if the post exists
        const post = yield db_1.default.post.findUniqueOrThrow({
            where: { id: args.id },
        });
        const checkCount = yield db_1.default.postPin.count({
            where: { contextType: args.context, userId: user.id },
        });
        logger_1.default.info(`Post pins ${checkCount}`);
        if (checkCount >= 5) {
            return {
                data: "You've reached max of 5 post pins, please unpin others to pin again",
                status: 400,
            };
        }
        // report the post
        yield db_1.default.postPin.create({
            data: {
                postId: args.id,
                userId: user.id,
                contextType: args.context,
            },
        });
        return {
            data: { id: post.id, userId: user.id, isPinned: true },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.createPostPin = createPostPin;
const createPostHighlight = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.postHighlight.findFirst({
            where: { postId: args.id, contextType: args.context, userId: user.id },
            orderBy: [{ createdAt: "desc" }],
        });
        // check if the user has already reported the post with 24 hours
        if (result) {
            yield db_1.default.postHighlight.delete({ where: { id: result.id } });
            return {
                data: { id: args.id, userId: user.id, isHighlighted: false },
                status: 200,
            };
        }
        // check if the post exists
        const post = yield db_1.default.post.findUniqueOrThrow({
            where: { id: args.id },
        });
        const checkCount = yield db_1.default.postHighlight.count({
            where: { contextType: args.context, userId: user.id },
        });
        logger_1.default.info(`Post hightlights ${checkCount}`);
        if (checkCount >= 20) {
            return {
                data: "You've reached max of 20 hightlight posts, please remove some highlight to add more",
                status: 400,
            };
        }
        // report the post
        yield db_1.default.postHighlight.create({
            data: {
                postId: args.id,
                userId: user.id,
                contextType: args.context,
            },
        });
        return {
            data: { id: post.id, userId: user.id, isHighlighted: true },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.createPostHighlight = createPostHighlight;
const notInterestedPost = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.postDisinterest.findFirst({
            where: { postId, userId },
        });
        if (!result) {
            yield db_1.default.postDisinterest.create({
                data: {
                    postId,
                    userId,
                },
            });
            return { data: { id: postId, userId, interested: false }, status: 200 };
        }
        else {
            yield db_1.default.postDisinterest.delete({
                where: { id: result.id },
            });
            return { data: { id: postId, userId, interested: true }, status: 200 };
        }
    }
    catch (error) {
        logger_1.default.error(" Not interested error " + error.message);
        return { data: "Error ocurred, please try again", status: 500 };
    }
});
exports.notInterestedPost = notInterestedPost;
function createPostImpression(args) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.postImpression.create({
                    data: args,
                });
                // increment the post impression counter
                yield tx.post.update({
                    where: { id: args.postId },
                    data: { totalImpressions: { increment: 1 } },
                });
                return { data: { id: args.postId, userId: args.userId }, status: 200 };
            }));
            return result;
        }
        catch (error) {
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
function createPostView(args) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.postView.create({
                    data: args,
                });
                // increment the post impression counter
                yield tx.post.update({
                    where: { id: args.postId },
                    data: { totalViews: { increment: 1 } },
                });
                return { data: { id: args.postId, userId: args.userId }, status: 200 };
            }));
            return result;
        }
        catch (error) {
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
function createPostClick(args) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.postClick.create({
                    data: args,
                });
                // increment the post impression counter
                // await tx.post.update({where: { id: args.postId }, data: { totalViews: { increment: 1}}})
                return { data: { id: args.postId, userId: args.userId }, status: 200 };
            }));
            return result;
        }
        catch (error) {
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
function createPostMediaLog(args) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.postMediaLog.create({
                    data: args,
                });
                // increment the post media action counter
                if (args.action === client_1.PostMediaAction.DOWNLOAD) {
                    yield tx.postMedia.update({
                        where: { id: args.mediaId },
                        data: { totalDownloads: { increment: 1 } },
                    });
                }
                if (args.action === client_1.PostMediaAction.VIEW) {
                    yield tx.postMedia.update({
                        where: { id: args.mediaId },
                        data: { totalViews: { increment: 1 } },
                    });
                }
                return {
                    data: {
                        id: args.postId,
                        mediaId: args.mediaId,
                        userId: args.userId,
                        isDownload: args.action === client_1.PostMediaAction.DOWNLOAD,
                        isView: args.action === client_1.PostMediaAction.VIEW,
                    },
                    status: 200,
                };
            }));
            return result;
        }
        catch (error) {
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
function createPostTip(args, user) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // check recipient
                const recipient = yield tx.user.findUniqueOrThrow({
                    where: { id: args.recipientId },
                    select: { id: true, name: true, wallet: { select: { id: true } } },
                });
                if (!recipient.wallet) {
                    throw new helpers_1.AppError("Recipient's wallet not found.");
                }
                // check tip package
                const tip = yield tx.tipPackage.findUniqueOrThrow({
                    where: { id: args.tipId },
                });
                // checker sender wallet balance
                const wallet = yield tx.wallet.findUniqueOrThrow({
                    where: { userId: args.senderId },
                });
                let info = { isCredit: false, amount: tip.price };
                if (wallet.coins < tip.price) {
                    if (wallet.credit * 2.2 < tip.price) {
                        throw new helpers_1.AppError("Insufficient balance, please purchase coins");
                    }
                    info = { amount: Number((tip.price / 2.2).toFixed(2)), isCredit: true };
                }
                // deduct sender wallet - package price(coins) from wallet amount(coins)
                yield tx.wallet.update({
                    where: { id: wallet.id },
                    data: Object.assign({}, (info.isCredit
                        ? { credit: { decrement: info.amount } }
                        : { coins: { decrement: info.amount } })),
                });
                // log sender transaction
                yield tx.transaction.create({
                    data: {
                        amount: info.amount,
                        currency: info.isCredit ? client_1.TxnCurrencyEnum.TZX : client_1.TxnCurrencyEnum.COINS,
                        type: client_1.TxnTypeEnum.DEBIT,
                        walletId: wallet.id,
                        tipPackageId: tip.id,
                        category: client_1.TxnCategoryEnum.POST_TIP,
                        postId: args.postId,
                        senderId: args.senderId,
                        recipientId: args.senderId,
                        status: client_1.TxnStatusEnum.COMPLETED,
                        source: info.isCredit ? client_1.TxnSourceEnum.CREDIT : client_1.TxnSourceEnum.COINS,
                        gateway: client_1.TxnGatewayEnum.WALLET,
                        txnRef: (0, utils_1.generateUniqueRef)(),
                        description: `Post tip sent to ${recipient.name}`,
                    },
                });
                // credit recipient wallet - package price(coins) from wallet amount(coins)
                // we sell 2.2 coins for 1TZX but buy back at 3 coins --- tip.price is in coins
                // The system takes 45% of all tips and the recipient takes 55%
                const creditAmount = Number(((tip.price * 0.55) / 3).toFixed(2));
                // log recipient transaction
                const txn = yield tx.transaction.create({
                    data: {
                        amount: creditAmount,
                        currency: client_1.TxnCurrencyEnum.TZX,
                        type: client_1.TxnTypeEnum.CREDIT,
                        walletId: recipient.wallet.id,
                        tipPackageId: tip.id,
                        category: client_1.TxnCategoryEnum.POST_TIP,
                        postId: args.postId,
                        senderId: args.senderId,
                        recipientId: args.recipientId,
                        status: client_1.TxnStatusEnum.PENDING,
                        source: client_1.TxnSourceEnum.CREDIT,
                        gateway: client_1.TxnGatewayEnum.WALLET,
                        txnRef: (0, utils_1.generateUniqueRef)(),
                        description: `Tip reward from ${args.isAnon ? "anonymous" : user.name} on your post`,
                    },
                });
                // log post tip until available at
                yield tx.postTip.create({
                    data: {
                        postId: args.postId,
                        senderId: args.senderId,
                        recipientId: args.recipientId,
                        tipId: tip.id,
                        message: args.message,
                        isAnon: args.isAnon,
                        device: args.device,
                        meta: args.meta,
                        referer: args.referer,
                        rewardTip: {
                            create: {
                                userId: recipient.id,
                                walletId: recipient.wallet.id,
                                amount: creditAmount,
                                source: client_1.TipSource.POST,
                                status: client_1.TipStatus.PENDING,
                                txnId: txn.id,
                                availableAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
                            },
                        },
                    },
                });
                // increment post tips
                yield tx.post.update({
                    where: { id: args.postId },
                    data: { totalTips: { increment: 1 } },
                });
                return {
                    data: {
                        id: args.postId,
                        userId: args.senderId,
                        isTip: true,
                    },
                    status: 200,
                };
            }));
            return result;
        }
        catch (error) {
            if (error instanceof helpers_1.AppError) {
                return { data: error.message, status: error.statusCode };
            }
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
function insertImpressionQueue(args) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const key = `impressions:${args.postId}:${((_a = args === null || args === void 0 ? void 0 : args.userId) === null || _a === void 0 ? void 0 : _a.slice(-10)) || (args === null || args === void 0 ? void 0 : args.sessionId)}`;
            const now = Date.now();
            const lastSeen = yield redis_1.default.get(key);
            if (!lastSeen || now - Number(lastSeen) > 2 * 60 * 1000) {
                yield redis_1.default.set(key, now, { EX: 10 * 60 }); // keep for 1h
                yield redis_1.default.rPush("impression:queue", JSON.stringify(args));
                return { data: { id: args.postId, userId: args.userId }, status: 200 };
            }
            return { data: "Too frequent & depublicated event", status: 400 };
        }
        catch (error) {
            return { data: "Sorry an error occurred to process request ", status: 500 };
        }
    });
}
const getNewsfeed = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 21, page = 1 } = args;
        const feedPosts = yield db_1.default.post.findMany({
            where: {
                OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
                status: client_1.PostStatus.PUBLISHED,
                deletedAt: null,
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
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                status: true,
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
                tagUsers: {
                    include: {
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
                                        status: true,
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
                                        status: true,
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
                    },
                },
                mentions: {
                    include: {
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
                                        status: true,
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
                                        status: true,
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
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                                        status: true,
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
                        tagUsers: {
                            include: {
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
                                                status: true,
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
                                                status: true,
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
                            },
                        },
                        mentions: {
                            include: {
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
                                                status: true,
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
                                                status: true,
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
                                                status: true,
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
                                                status: true,
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
                                tagUsers: {
                                    include: {
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
                                                        status: true,
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
                                                        status: true,
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
                                    },
                                },
                                mentions: {
                                    include: {
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
                                                        status: true,
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
                                                        status: true,
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
        const _posts = data.map((p) => (0, utils_2.transformPost)(p, true, user));
        return {
            data: _posts.length > 0 ? _posts : "Not found",
            status: _posts.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        console.log(error);
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getNewsfeed = getNewsfeed;
const getEmbedPost = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get some post replies of the current post
        const post = yield db_1.default.post.findFirst({
            where: {
                id: postId,
                status: client_1.PostStatus.PUBLISHED,
            },
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
                        accountVerified: true,
                        followers: {
                            where: {
                                followerId: userId,
                            },
                            select: { id: true, followerId: true, followingId: true },
                        },
                        following: {
                            where: {
                                followingId: userId,
                            },
                            select: { id: true, followerId: true, followingId: true },
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
                tagUsers: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                                name: true,
                                isVerified: true,
                                accountVerified: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
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
                    },
                },
                mentions: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                                name: true,
                                isVerified: true,
                                accountVerified: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
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
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId,
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
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
        });
        const data = (0, utils_2.transformPost)(post, true);
        return { data, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get post, please try again",
            status: 500,
        };
    }
});
exports.getEmbedPost = getEmbedPost;
const getPostReplies = (args, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const post = yield db_1.default.post.findUniqueOrThrow({
            where: { id: args.postId },
            include: { root: true },
        });
        let userCanReply = false;
        if (post.scope === client_1.PostScopeEnum.FOLLOWED &&
            ((_a = post === null || post === void 0 ? void 0 : post.root) === null || _a === void 0 ? void 0 : _a.userId) !== args.userId) {
            // check if the post author is following the current user
            const result2 = yield db_1.default.follow.findFirst({
                where: {
                    followerId: (_b = post === null || post === void 0 ? void 0 : post.root) === null || _b === void 0 ? void 0 : _b.userId,
                    followingId: args.userId,
                    status: client_1.FollowStatus.ACCEPTED,
                },
            });
            userCanReply = !!result2;
        }
        const result = yield (0, exports.fetchFeedPostReplies)(args);
        const transformed = result.map((p) => (0, utils_2.transformPost)(Object.assign(Object.assign({}, p), { replies: result }), userCanReply, user));
        return {
            data: transformed,
            status: 200,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get post replies, please try again",
            status: 500,
        };
    }
});
exports.getPostReplies = getPostReplies;
const getPostQuotes = (_a, user_1) => __awaiter(void 0, [_a, user_1], void 0, function* ({ postId, limit = 20, page = 1, }, user) {
    const userId = user.id;
    const skip = (page - 1) * limit;
    try {
        // get some post replies of the current post
        const result = yield db_1.default.post.findMany({
            where: {
                parentId: postId,
                kind: client_1.PostKindEnum.QUOTE,
                status: client_1.PostStatus.PUBLISHED,
            },
            skip,
            take: limit,
            orderBy: [{ createdAt: "desc" }],
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
                        accountVerified: true,
                        status: true,
                        metadata: true,
                        createdAt: true,
                        followers: {
                            where: {
                                followerId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                            },
                        },
                        following: {
                            where: {
                                followingId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                tagUsers: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                                name: true,
                                isVerified: true,
                                accountVerified: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                status: true,
                                metadata: true,
                                createdAt: true,
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
                    },
                },
                mentions: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatar: true,
                                name: true,
                                isVerified: true,
                                accountVerified: true,
                                bio: true,
                                role: true,
                                userType: true,
                                meta: true,
                                status: true,
                                metadata: true,
                                createdAt: true,
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
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId,
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
                                status: true,
                                metadata: true,
                                createdAt: true,
                                followers: {
                                    where: {
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                        tagUsers: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        avatar: true,
                                        name: true,
                                        isVerified: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        status: true,
                                        metadata: true,
                                        createdAt: true,
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
                            },
                        },
                        mentions: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        avatar: true,
                                        name: true,
                                        isVerified: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        status: true,
                                        metadata: true,
                                        createdAt: true,
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
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId,
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
                                                userId,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                    },
                },
                likes: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
        });
        if (result.length > 0) {
            // Step 1:  loop through the replies to check the current user reposted any
            const postIds = result.map((post) => post.id); // Collect all post IDs
            const userReposts = yield db_1.default.post.findMany({
                where: {
                    userId, // Current user's posts
                    kind: client_1.PostKindEnum.REPOST, // Only reposts
                    OR: [
                        { parentId: { in: postIds } }, // User reposted the post itself
                        { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                    ],
                },
                select: {
                    id: true, // User's repost (child repost)
                    parentId: true, // Get only parent post IDs (original posts the user reposted)
                    userId: true,
                },
            });
            // Step 3: Attach repost status to replies posts
            const posts = result.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((r) => r.parentId === post.id), tagUsers: post.tagUsers.map((u) => u.user), mentions: post.mentions.map((m) => m.user) })));
            const data = posts.map((p) => (0, utils_2.transformPost)(p, false, user));
            return { data, status: 200 };
        }
        // const data = result.map(p => transformPost(p, false, user))
        return { data: "Not found", status: 404 };
    }
    catch (error) {
        return {
            data: "Error trying to process request, please try again",
            status: 500,
        };
    }
});
exports.getPostQuotes = getPostQuotes;
const getPostReposters = (_a, user_1) => __awaiter(void 0, [_a, user_1], void 0, function* ({ postId, limit, page, }, user) {
    try {
        const result = yield db_1.default.post.findMany({
            where: {
                kind: client_1.PostKindEnum.REPOST,
                status: client_1.PostStatus.PUBLISHED,
                parentId: postId,
            },
            take: limit,
            skip: (page - 1) * limit,
            include: {
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
                        status: true,
                        metadata: true,
                        createdAt: true,
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
                        followers: {
                            where: {
                                followerId: user.id,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                status: true,
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
            },
            orderBy: [{ createdAt: "desc" }],
        });
        const reposters = result === null || result === void 0 ? void 0 : result.map((r) => (0, utils_2.composePostAuthor)(Object.assign(Object.assign({}, r.user), { followerCount: r.user._count.followers, followingCount: r.user._count.following })));
        return {
            data: reposters.length > 0 ? reposters : "Not found",
            status: reposters.length > 0 ? 200 : 404,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getPostReposters = getPostReposters;
const getPostFeedDetails = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = user === null || user === void 0 ? void 0 : user.id;
        // get post details and parentChain if any
        // const result2 = await getPostParentChain(postId, userId!);
        const result = yield fetchPostAncestry(postId, userId);
        if (!result)
            return { data: "not found", status: 404 };
        // // get current user details
        // const user = await getAuthUser(userId);
        // get feed post thread
        const thread = yield getFeedPostThread(postId, userId);
        // get feed post replies
        const replies = yield (0, exports.fetchFeedPostReplies)({ postId, userId });
        // check if the current user is following author
        let userCanReply = false;
        if (result.scope === client_1.PostScopeEnum.FOLLOWED &&
            ((_a = result === null || result === void 0 ? void 0 : result.root) === null || _a === void 0 ? void 0 : _a.userId) !== userId) {
            // check if the post author is following the current user
            const result2 = yield db_1.default.follow.findFirst({
                where: {
                    followerId: (_b = result === null || result === void 0 ? void 0 : result.root) === null || _b === void 0 ? void 0 : _b.userId,
                    followingId: userId,
                },
            });
            userCanReply = !!result2;
        }
        const data = (0, utils_2.transformPost)(Object.assign(Object.assign({}, result), { thread,
            replies }), userCanReply, user);
        return {
            data,
            status: 200,
        };
    }
    catch (error) {
        return {
            data: "Error occurred trying to get feed, please try again",
            status: 500,
        };
    }
});
exports.getPostFeedDetails = getPostFeedDetails;
const getFeedPostThread = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let thread = yield db_1.default.post.findMany({
            where: {
                parentId: postId,
                kind: client_1.PostKindEnum.THREAD,
                status: client_1.PostStatus.PUBLISHED,
            },
            orderBy: [{ createdAt: "asc" }],
            include: {
                media: true,
                _count: { select: { replies: { where: { isHidden: true } } } },
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
                        status: true,
                        metadata: true,
                        createdAt: true,
                        followers: {
                            where: {
                                followerId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                            },
                        },
                        following: {
                            where: {
                                followingId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                tagUsers: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                mentions: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                quiz: {
                    include: {
                        options: {
                            include: {
                                participants: {
                                    where: {
                                        userId,
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
                                        userId,
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
                                status: true,
                                metadata: true,
                                createdAt: true,
                                followers: {
                                    where: {
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                        tagUsers: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        avatar: true,
                                        name: true,
                                        isVerified: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
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
                            },
                        },
                        mentions: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        username: true,
                                        avatar: true,
                                        name: true,
                                        isVerified: true,
                                        bio: true,
                                        role: true,
                                        userType: true,
                                        meta: true,
                                        status: true,
                                        metadata: true,
                                        createdAt: true,
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
                            },
                        },
                        quiz: {
                            include: {
                                options: {
                                    include: {
                                        participants: {
                                            where: {
                                                userId,
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
                                                userId,
                                            },
                                        },
                                    },
                                },
                                continents: true,
                                countries: true,
                            },
                        },
                    },
                },
                likes: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
        });
        // if (!result) return { data: "Post not found", status: 404 };
        // loop through the thread and check if the current user has reposted any of them
        if (thread.length > 0) {
            // Step 1: Check for repost by the current user for each thread
            const postIds = thread.map((post) => post.id); // Collect all post IDs
            const userReposts = yield db_1.default.post.findMany({
                where: {
                    userId, // Current user's posts
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
            // Step 2: Mark both the original and the child reposts
            // const repostIds = new Set(
            //   userReposts.flatMap((repost) => [repost.id, repost.parentId]) // Include both original and child reposts
            // );
            // Step 3: Attach repost status to replies posts
            return thread.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((r) => r.parentId === post.id), tagUsers: post.tagUsers.map((u) => u.user), mentions: post.mentions.map((m) => m.user), parent: post.parent
                    ? Object.assign(Object.assign({}, post.parent), { reposts: userReposts.filter((r) => { var _a; return r.parentId === ((_a = post === null || post === void 0 ? void 0 : post.parent) === null || _a === void 0 ? void 0 : _a.id); }), tagUsers: post === null || post === void 0 ? void 0 : post.parent.tagUsers.map((u) => u.user), mentions: post === null || post === void 0 ? void 0 : post.parent.mentions.map((m) => m.user) }) : post.parent })));
        }
        return thread;
    }
    catch (error) {
        throw error;
    }
});
const fetchFeedPostReplies = (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, postId, limit = 20, page = 1, hidden = false, }) {
    const skip = (page - 1) * limit;
    try {
        // get some post replies of the current post
        let replies = yield db_1.default.post.findMany({
            where: {
                parentId: postId,
                kind: client_1.PostKindEnum.REPLY,
                status: client_1.PostStatus.PUBLISHED,
                isHidden: hidden,
            },
            skip,
            take: limit,
            orderBy: [{ createdAt: "desc" }],
            include: {
                media: true,
                _count: { select: { replies: { where: { isHidden: true } } } },
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
                        accountVerified: true,
                        status: true,
                        metadata: true,
                        createdAt: true,
                        followers: {
                            where: {
                                followerId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                            },
                        },
                        following: {
                            where: {
                                followingId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                tagUsers: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                mentions: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId,
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
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
        });
        if (replies.length > 0) {
            // Step 1:  loop through the replies to check the current user reposted any
            const postIds = replies.map((post) => post.id); // Collect all post IDs
            const userReposts = yield db_1.default.post.findMany({
                where: {
                    userId, // Current user's posts
                    kind: client_1.PostKindEnum.REPOST, // Only reposts
                    OR: [
                        { parentId: { in: postIds } }, // User reposted the post itself
                        { id: { in: postIds } }, // The post itself is the user's repost (child repost)
                    ],
                },
                select: {
                    id: true, // User's repost (child repost)
                    parentId: true, // Get only parent post IDs (original posts the user reposted)
                    userId: true,
                },
            });
            // Step 3: Attach repost status to replies posts
            return replies.map((post) => (Object.assign(Object.assign({}, post), { reposts: userReposts.filter((r) => r.parentId === post.id), tagUsers: post.tagUsers.map((u) => u.user), mentions: post.mentions.map((m) => m.user) })));
        }
        return replies;
    }
    catch (error) {
        console.log(error);
        throw error;
    }
});
exports.fetchFeedPostReplies = fetchFeedPostReplies;
const updatePostReactions = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // check if post exists
            let result2 = yield tx.likedPost.findUnique({
                where: {
                    userId_postId: { userId: user.id, postId }, // Composite unique constraint
                },
                include: { post: { select: { id: true, userId: true, kind: true } } },
            });
            let liked = false;
            if (result2) {
                // Unlike (delete the like)
                result2 = yield tx.likedPost.delete({
                    where: { id: result2.id },
                    include: { post: { select: { id: true, userId: true, kind: true } } },
                });
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalLikes: { decrement: 1 } },
                });
            }
            else {
                // Like (create new like)
                result2 = yield tx.likedPost.create({
                    data: { userId: user.id, postId },
                    include: { post: { select: { id: true, userId: true, kind: true } } },
                });
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalLikes: { increment: 1 } },
                });
                liked = true;
            }
            const { post } = result2, rest = __rest(result2, ["post"]);
            if (liked && result2.post.userId !== user.id) {
                // check if there is similar notif
                const kind = result2.post.kind === client_1.PostKindEnum.REPLY ? "comment" : "post";
                // check if there is similar notif
                const check = yield tx.notification.findFirst({
                    where: {
                        senderId: user.id,
                        recipientId: post.userId,
                        postId: post.id,
                        type: client_1.NotifTypeEnum.POST,
                        action: client_1.NotifAction.LIKE,
                    },
                });
                if (!check) {
                    // insert notification
                    yield tx.notification.create({
                        data: {
                            senderId: user.id,
                            recipientId: post.userId,
                            postId: post.id,
                            type: client_1.NotifTypeEnum.POST,
                            action: client_1.NotifAction.LIKE,
                            message: `${user.name} reacted to your ${kind}`,
                            title: "New post reaction",
                        },
                    });
                }
            }
            return { data: rest, liked };
        }));
        return { data: result, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred reacting to post, please try again",
            status: 500,
        };
    }
});
exports.updatePostReactions = updatePostReactions;
const updatePostBookmarks = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield tx.bookmark.findUnique({
                where: {
                    userId_postId: { userId, postId }, // Composite unique constraint
                },
            });
            if (result) {
                // Unlike (delete the like)
                const data = yield tx.bookmark.delete({
                    where: { id: result.id },
                });
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalBookmarks: { decrement: 1 } },
                });
                return { isBookmarked: false, data };
            }
            else {
                // Like (create new like)
                const data = yield tx.bookmark.create({
                    data: { userId, postId },
                });
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalBookmarks: { increment: 1 } },
                });
                return { isBookmarked: true, data };
            }
        }));
        return { data, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred updating post bookmarks, please try again",
            status: 500,
        };
    }
});
exports.updatePostBookmarks = updatePostBookmarks;
const updatePostShares = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.post.update({
            where: { id: postId },
            data: { totalShares: { increment: 1 } },
        });
        return { data: { id: result.id, userId: result.userId }, status: 200 };
    }
    catch (error) {
        return {
            data: "Error occurred updating post shares, please try again",
            status: 500,
        };
    }
});
exports.updatePostShares = updatePostShares;
const updateReposts = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            let isReposted = false;
            let post = yield tx.post.findFirst({
                where: {
                    parentId: postId,
                    kind: client_1.PostKindEnum.REPOST,
                    userId: user.id,
                },
                include: {
                    parent: {
                        select: { id: true, kind: true, userId: true, parentId: true },
                    },
                },
            });
            if (post) {
                // delete the repost
                post = yield tx.post.delete({
                    where: { id: post.id },
                    include: {
                        parent: {
                            select: { id: true, kind: true, userId: true, parentId: true },
                        },
                    },
                });
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalReposts: { decrement: 1 } },
                });
            }
            else {
                const _post = yield tx.post.findUniqueOrThrow({
                    where: { id: postId },
                });
                // repost (create new repost)
                post = yield tx.post.create({
                    data: {
                        kind: client_1.PostKindEnum.REPOST,
                        type: _post.type,
                        userId: user.id,
                        parentId: postId, // Links to the original post
                        rootId: _post.rootId || _post.id,
                    },
                    include: {
                        parent: {
                            select: { id: true, kind: true, userId: true, parentId: true },
                        },
                    },
                });
                // Increase repost count for the original post
                yield tx.post.update({
                    where: { id: postId },
                    data: { totalReposts: { increment: 1 } },
                });
                isReposted = true;
            }
            if (isReposted && ((_a = post === null || post === void 0 ? void 0 : post.parent) === null || _a === void 0 ? void 0 : _a.userId) !== user.id) {
                // check if there is similar notif
                const check = yield tx.notification.findFirst({
                    where: {
                        senderId: user.id,
                        recipientId: (_b = post === null || post === void 0 ? void 0 : post.parent) === null || _b === void 0 ? void 0 : _b.userId,
                        postId: post === null || post === void 0 ? void 0 : post.parentId,
                        type: client_1.NotifTypeEnum.POST,
                        action: client_1.NotifAction.REPOST,
                    },
                });
                if (!check) {
                    // insert notification
                    const kind = ((_c = post === null || post === void 0 ? void 0 : post.parent) === null || _c === void 0 ? void 0 : _c.kind) === client_1.PostKindEnum.REPLY ? "comment" : "post";
                    yield tx.notification.create({
                        data: {
                            senderId: user.id,
                            recipientId: (_d = post === null || post === void 0 ? void 0 : post.parent) === null || _d === void 0 ? void 0 : _d.userId,
                            postId: post.parentId,
                            type: client_1.NotifTypeEnum.POST,
                            action: client_1.NotifAction.REPOST,
                            message: `${user.name} reposted your ${kind}`,
                            title: "New post repost",
                        },
                    });
                }
            }
            return { isReposted, data: (0, utils_2.convertBigInts)(post) };
        }));
        return { data, status: 200 };
    }
    catch (error) {
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.updateReposts = updateReposts;
const deletePost = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            // check post ownership
            const check = yield tx.post.findUniqueOrThrow({
                where: { id: postId },
                include: { user: { select: { id: true, role: true } } },
            });
            if (((_a = check === null || check === void 0 ? void 0 : check.user) === null || _a === void 0 ? void 0 : _a.role) === client_1.UserRoleEnum.USER &&
                check.user.id !== user.id) {
                throw new Error("Invalid permission");
            }
            const post = yield tx.post.update({
                where: { id: postId },
                data: { deletedAt: new Date() },
            });
            // decrease counters for the original post
            yield updateParentCounter(tx, post, "decrement");
            // save history record
            yield tx.postHistory.create({
                data: { postId, userId: user.id, action: client_1.PostAction.DELETE },
            });
            return post;
        }));
        return {
            data: { id: result.id, userId: user.id, deletedAt: result.deletedAt },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.deletePost = deletePost;
const restorePost = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            // check post ownership
            const check = yield tx.post.findUniqueOrThrow({
                where: { id: postId },
                include: { user: { select: { id: true, role: true } } },
            });
            if (((_a = check === null || check === void 0 ? void 0 : check.user) === null || _a === void 0 ? void 0 : _a.role) === client_1.UserRoleEnum.USER &&
                check.user.id !== user.id) {
                throw new Error("Invalid permission");
            }
            const post = yield tx.post.update({
                where: { id: postId },
                data: { deletedAt: null },
            });
            // increase counters for the original post
            yield updateParentCounter(tx, post, "increment");
            // save history record
            yield tx.postHistory.create({
                data: { postId, userId: user.id, action: client_1.PostAction.RESTORE },
            });
            return post;
        }));
        return {
            data: { id: result.id, userId: user.id, deletedAt: result.deletedAt },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.restorePost = restorePost;
const hidePostReply = (postId, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            // check post ownership
            const check = yield tx.post.findUniqueOrThrow({
                where: { id: postId },
                include: {
                    user: { select: { id: true, role: true } },
                    root: { select: { id: true, userId: true } },
                },
            });
            const isPostAuthor = (check === null || check === void 0 ? void 0 : check.root)
                ? ((_a = check === null || check === void 0 ? void 0 : check.root) === null || _a === void 0 ? void 0 : _a.userId) === user.id
                : (check === null || check === void 0 ? void 0 : check.userId) === (user === null || user === void 0 ? void 0 : user.id);
            const isHidden = !check.isHidden;
            if (((_b = check === null || check === void 0 ? void 0 : check.user) === null || _b === void 0 ? void 0 : _b.role) === client_1.UserRoleEnum.USER && !isPostAuthor) {
                throw new Error("Invalid permission");
            }
            const post = yield tx.post.update({
                where: { id: postId },
                data: { isHidden },
            });
            // save history record
            yield tx.postHistory.create({
                data: {
                    postId,
                    userId: user.id,
                    action: isHidden ? client_1.PostAction.HIDDEN : client_1.PostAction.UNHIDDEN,
                },
            });
            return { id: post.id, isHidden };
        }));
        return {
            data: { id: result.id, userId: user.id, hidden: result.isHidden },
            status: 200,
        };
    }
    catch (error) {
        logger_1.default.error(error.message);
        return {
            data: "Error occurred processing request, please try again",
            status: 500,
        };
    }
});
exports.hidePostReply = hidePostReply;
function updateParentCounter(tx, post, direction) {
    return __awaiter(this, void 0, void 0, function* () {
        const counters = {
            [client_1.PostKindEnum.QUOTE]: "totalQuotes",
            [client_1.PostKindEnum.REPOST]: "totalReposts",
            [client_1.PostKindEnum.REPLY]: "totalReplies",
        };
        const counterField = counters[post.kind];
        if (!counterField || !post.parentId)
            return;
        yield tx.post.update({
            where: { id: post.parentId },
            data: {
                [counterField]: { [direction]: 1 },
            },
        });
    });
}
const votePollPost = (postId, optionId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.post.update({
            where: {
                id: postId,
            },
            data: {
                poll: {
                    update: {
                        options: {
                            update: {
                                where: { id: optionId },
                                data: {
                                    votes: { increment: 1 },
                                    voters: { create: { userId } },
                                },
                            },
                        },
                    },
                },
            },
        });
        return {
            data: JSON.parse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? Number(value) : value)),
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.votePollPost = votePollPost;
const voteQuizPost = (postId, optionId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const post = yield db_1.default.post.findUniqueOrThrow({
            where: { id: postId },
            include: { quiz: { include: { options: true } } },
        });
        const quiz = post.quiz;
        if (!quiz)
            return { data: "Quiz not found", status: 404 };
        const option = quiz.options.find((o) => o.id === optionId);
        if (!option)
            return { data: "Option not found", status: 404 };
        const data = yield db_1.default.post.update({
            where: {
                id: postId,
            },
            data: {
                quiz: {
                    update: {
                        options: {
                            update: {
                                where: { id: optionId },
                                data: {
                                    votes: { increment: 1 },
                                    participants: {
                                        create: {
                                            userId,
                                            quizId: option.quizId,
                                            isCorrect: option.isCorrect,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        logger_1.default.info("Post quiz option voted ");
        return {
            data: JSON.parse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? Number(value) : value)),
            status: 200,
        };
    }
    catch (error) {
        logger_1.default.error("Voting option error ", error === null || error === void 0 ? void 0 : error.message);
        return { data: "Error occurred reposting, please try again", status: 500 };
    }
});
exports.voteQuizPost = voteQuizPost;
const triggerPushNotification = (userId, message) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subs = yield db_1.default.pushNotification.findMany({ where: { userId } });
        if (subs.length === 0) {
            logger_1.default.info("User is not subscribed to push notifications");
            return;
        }
        const payload = JSON.stringify({
            title: "🔔 New Message",
            body: message || "Hello from torazon!",
        });
        const result = yield Promise.all(subs.map((sub) => webpush_1.default.sendNotification(sub.config, payload)));
        logger_1.default.warn(result);
        logger_1.default.info("Web push notifications sent");
    }
    catch (error) {
        logger_1.default.warn(`error sending web push notification ${error.message}`);
        logger_1.default.error(error);
    }
});
const getExpiryDate = (duration) => {
    const now = new Date(); // Get current date & time
    now.setDate(now.getDate() + duration.days); // Add days
    now.setHours(now.getHours() + duration.hours); // Add hours
    now.setMinutes(now.getMinutes() + duration.minutes); // Add minutes
    return now;
};
const getSinglePost = (postId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get some post replies of the current post
        const post = yield db_1.default.post.findUnique({
            where: {
                id: postId,
                status: client_1.PostStatus.PUBLISHED,
            },
            include: {
                media: true,
                _count: { select: { replies: { where: { isHidden: true } } } },
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
                        status: true,
                        metadata: true,
                        createdAt: true,
                        followers: {
                            where: {
                                followerId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                            },
                        },
                        following: {
                            where: {
                                followingId: userId,
                            },
                            select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                tagUsers: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                mentions: {
                    include: {
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
                                        followerId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
                                    },
                                },
                                following: {
                                    where: {
                                        followingId: userId,
                                    },
                                    select: {
                                        id: true,
                                        followerId: true,
                                        followingId: true,
                                        status: true,
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
                    },
                },
                poll: {
                    include: {
                        options: {
                            include: {
                                voters: {
                                    where: {
                                        userId,
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
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
                bookmarks: {
                    where: {
                        userId, // Check if the current user has liked the post
                    },
                    select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                    },
                },
            },
        });
        if (post) {
            // check if the current user reposted this post
            const repost = yield db_1.default.post.findFirst({
                where: {
                    userId, // Current user's posts
                    kind: client_1.PostKindEnum.REPOST, // Only reposts
                    parentId: post.id,
                },
                select: {
                    id: true, // User's repost (child repost)
                    parentId: true, // Get only parent post IDs (original posts the user reposted)
                },
            });
            return Object.assign(Object.assign({}, post), { reposts: repost ? [repost] : [], tagUsers: post.tagUsers.map((u) => u.user), mentions: post.mentions.map((m) => m.user) });
        }
        return post;
    }
    catch (error) {
        throw error;
    }
});
function fetchPostAncestry(postId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const post = yield getSinglePost(postId, userId);
        if (!post)
            return null;
        const parentChain = [];
        // QUOTE → fetch only the immediate parent
        if (post.kind === client_1.PostKindEnum.QUOTE && post.parentId) {
            const parent = yield getSinglePost(post.parentId, userId);
            return Object.assign(Object.assign({}, post), { parent, parentChain: [] });
        }
        // For other kinds, fetch full ancestry
        let currentParentId = post.parentId;
        while (currentParentId) {
            const parent = yield getSinglePost(currentParentId, userId);
            if (!parent)
                break;
            if (parent.kind === client_1.PostKindEnum.QUOTE) {
                const innerParent = parent.parentId
                    ? yield getSinglePost(parent.parentId, userId)
                    : null;
                parentChain.unshift(Object.assign(Object.assign({}, parent), { parent: innerParent }));
                break; // Stop at first QUOTE
            }
            parentChain.unshift(parent);
            currentParentId = parent.parentId;
        }
        return Object.assign(Object.assign({}, post), { parentChain });
    });
}
// partial raw sql query of getting post ancestry
function getPostParentChain(postId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const kindResult = yield db_1.default.post.findUnique({
            where: { id: postId },
            select: { kind: true },
        });
        const isQuote = (kindResult === null || kindResult === void 0 ? void 0 : kindResult.kind) === "QUOTE";
        const posts = isQuote
            ? yield db_1.default.$queryRaw `
      WITH root_post AS (
        SELECT * FROM "Post" WHERE id = ${postId}
      ),
      parent_post AS (
        SELECT * FROM "Post" WHERE id = (SELECT "parentId" FROM root_post)
      ),
      combined AS (
        SELECT * FROM root_post
        UNION ALL
        SELECT * FROM parent_post
      )
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'name', u.name,
          'username', u.username,
          'email', u.email,
          'avatar', u.avatar,
          'meta', u.meta,
          'bio', u.bio,
          'role', u.role,
          'userType', u."userType",
          'accountVerified', u."accountVerified",
          'country', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          ) END,
          'subscriptions', COALESCE((
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb),
          'following', COALESCE((
            SELECT jsonb_agg(to_jsonb(f))
            FROM "Follow" f
            WHERE f."followerId" = ${userId} AND f."followingId" = u.id
          ), '[]'::jsonb),
          'followers', COALESCE((
            SELECT jsonb_agg(to_jsonb(f))
            FROM "Follow" f
            WHERE f."followingId" = ${userId} AND f."followerId" = u.id
          ), '[]'::jsonb)
        ) AS user,
        EXISTS (
          SELECT 1 FROM "LikedPost" l
          WHERE l."userId" = ${userId} AND l."postId" = p.id
        ) AS "hasLiked",
        EXISTS (
          SELECT 1 FROM "Bookmark" b
          WHERE b."userId" = ${userId} AND b."postId" = p.id
        ) AS "hasSaved",
        EXISTS (
          SELECT 1 FROM "Post" r
          WHERE r."kind" = 'REPOST' AND r."userId" = ${userId} AND r."parentId" = p.id
        ) AS "hasReposted",
        COALESCE((
          SELECT jsonb_agg(to_jsonb(m)) FROM "PostMedia" m WHERE m."postId" = p.id
        ), '[]'::jsonb) AS media,
        (
          SELECT jsonb_build_object(
            'id', poll.id,
            'scope', poll."scope",
            'expireAt', poll."expireAt",
            'isMultiVote', poll."isMultiVote",
            'createdAt', poll."createdAt",
            'updatedAt', poll."updatedAt",
            'options', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', po.id,
                  'text', po.text,
                  'voters', COALESCE((
                    SELECT jsonb_agg(to_jsonb(v))
                    FROM "PollVoter" v
                    WHERE v."optionId" = po.id AND v."userId" = ${userId}
                  ), '[]'::jsonb)
                )
              ) FROM "PollOption" po WHERE po."pollId" = poll.id
            ), '[]'::jsonb),
            'countries', COALESCE((
              SELECT jsonb_agg(to_jsonb(pc)) FROM "PollCountry" pc WHERE pc."pollId" = poll.id
            ), '[]'::jsonb),
            'continents', COALESCE((
              SELECT jsonb_agg(to_jsonb(pc)) FROM "PollContinent" pc WHERE pc."pollId" = poll.id
            ), '[]'::jsonb)
          ) FROM "Poll" poll WHERE poll."postId" = p.id
        ) AS poll,
        (
          SELECT jsonb_build_object(
            'id', quiz.id,
            'scope', quiz."scope",
            'expireAt', quiz."expireAt",
            'rewardAmount', quiz."rewardAmount",
            'maxWinners', quiz."maxWinners",
            'createdAt', quiz."createdAt",
            'updatedAt', quiz."updatedAt",
            'options', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', qo.id,
                  'text', qo.text,
                  'votes', qo.votes,
                  'quizId', qo."quizId",
                  'isCorrect', qo."isCorrect",
                  'participants', COALESCE((
                    SELECT jsonb_agg(to_jsonb(qp))
                    FROM "QuizParticipant" qp
                    WHERE qo.id = qp."optionId" AND qp."userId" = ${userId}
                  ), '[]'::jsonb)
                )
              ) FROM "QuizOption" qo WHERE qo."quizId" = quiz.id
            ), '[]'::jsonb),
            'countries', COALESCE((
              SELECT jsonb_agg(to_jsonb(qc))
              FROM "QuizCountry" qc
              WHERE qc."quizId" = quiz.id
            ), '[]'::jsonb),
            'continents', COALESCE((
              SELECT jsonb_agg(to_jsonb(qt))
              FROM "QuizContinent" qt
              WHERE qt."quizId" = quiz.id
            ), '[]'::jsonb)
          ) FROM "Quiz" quiz WHERE quiz."postId" = p.id
        ) AS quiz,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
              'id', mu.id,
              'name', mu.name,
              'username', mu.username,
              'avatar', mu.avatar,
              'meta', mu.meta,
              'bio', mu.bio,
              'role', mu.role,
              'userType', mu."userType",
              'accountVerified', mu."accountVerified",
              'subscriptions', COALESCE((
                SELECT jsonb_agg(to_jsonb(s))
                FROM "Subscription" s
                WHERE s."userId" = mu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
              ), '[]'::jsonb)
            ))
          FROM "PostMention" pm
          JOIN "User" mu ON mu.id = pm."userId"
          WHERE pm."postId" = p.id
        ), '[]'::jsonb) AS mentions,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
              'id', tu.id,
              'name', tu.name,
              'username', tu.username,
              'avatar', tu.avatar,
              'meta', tu.meta,
              'bio', tu.bio,
              'role', tu.role,
              'userType', tu."userType",
              'accountVerified', tu."accountVerified",
              'subscriptions', COALESCE((
                SELECT jsonb_agg(to_jsonb(s))
                FROM "Subscription" s
                WHERE s."userId" = tu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
              ), '[]'::jsonb)
          ))
          FROM "PostUserTag" pt
          JOIN "User" tu ON tu.id = pt."userId"
          WHERE pt."postId" = p.id
        ), '[]'::jsonb) AS tagUsers
      FROM combined p
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN "Country" c ON u."countryId" = c.id
      ORDER BY p."createdAt";
    `
            : yield db_1.default.$queryRaw `WITH RECURSIVE parent_chain AS (
  SELECT * FROM "Post" WHERE id = (SELECT "parentId" FROM "Post" WHERE id = ${postId})
  UNION ALL
  SELECT p.* FROM "Post" p
  INNER JOIN parent_chain pc ON pc."parentId" = p.id
),
root_post AS (
  SELECT * FROM "Post" WHERE id = ${postId}
),
combined AS (
  SELECT * FROM root_post
  UNION ALL
  SELECT * FROM parent_chain
)
SELECT 
  p.*,
  jsonb_build_object(
    'id', u.id,
    'name', u.name,
    'username', u.username,
    'email', u.email,
    'avatar', u.avatar,
    'accountVerified', u."accountVerified",
    'meta', u.meta,
    'bio', u.bio,
    'role', u.role,
    'userType', u."userType",
    'country', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'iso2', c.iso2,
      'iso3', c.iso3,
      'emoji', c.emoji,
      'continentId', c."continentId"
    ) END,
    'subscriptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s))
      FROM "Subscription" s
      WHERE s."userId" = u.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
    ), '[]'::jsonb),
    'following', COALESCE((
      SELECT jsonb_agg(to_jsonb(f))
      FROM "Follow" f
      WHERE f."followerId" = ${userId} AND f."followingId" = u.id
    ), '[]'::jsonb),
    'followers', COALESCE((
      SELECT jsonb_agg(to_jsonb(f))
      FROM "Follow" f
      WHERE f."followingId" = ${userId} AND f."followerId" = u.id
    ), '[]'::jsonb)
  ) AS user,
  EXISTS (
    SELECT 1 FROM "LikedPost" l
    WHERE l."userId" = ${userId} AND l."postId" = p.id
  ) AS "hasLiked",
  EXISTS (
    SELECT 1 FROM "Bookmark" b
    WHERE b."userId" = ${userId} AND b."postId" = p.id
  ) AS "hasSaved",
  EXISTS (
    SELECT 1 FROM "Post" r
    WHERE r."kind" = 'REPOST' AND r."userId" = ${userId} AND r."parentId" = p.id
  ) AS "hasReposted",
  COALESCE((
    SELECT jsonb_agg(to_jsonb(m)) FROM "PostMedia" m WHERE m."postId" = p.id
  ), '[]'::jsonb) AS media,
  (
    SELECT jsonb_build_object(
      'id', poll.id,
      'scope', poll."scope",
      'expireAt', poll."expireAt",
      'isMultiVote', poll."isMultiVote",
      'createdAt', poll."createdAt",
      'updatedAt', poll."updatedAt",
      'options', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'text', po.text,
            'voters', COALESCE((
              SELECT jsonb_agg(to_jsonb(v))
              FROM "PollVoter" v
              WHERE v."optionId" = po.id AND v."userId" = ${userId}
            ), '[]'::jsonb)
          )
        ) FROM "PollOption" po WHERE po."pollId" = poll.id
      ), '[]'::jsonb),
      'countries', COALESCE((
        SELECT jsonb_agg(to_jsonb(pc)) FROM "PollCountry" pc WHERE pc."pollId" = poll.id
      ), '[]'::jsonb),
      'continents', COALESCE((
        SELECT jsonb_agg(to_jsonb(pc)) FROM "PollContinent" pc WHERE pc."pollId" = poll.id
      ), '[]'::jsonb)
    ) FROM "Poll" poll WHERE poll."postId" = p.id
  ) AS poll,
  (
    SELECT jsonb_build_object(
      'id', quiz.id,
      'scope', quiz."scope",
      'expireAt', quiz."expireAt",
      'rewardAmount', quiz."rewardAmount",
      'maxWinners', quiz."maxWinners",
      'createdAt', quiz."createdAt",
      'updatedAt', quiz."updatedAt",
      'options', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'text', qo.text,
            'votes', qo.votes,
            'quizId', qo."quizId",
            'isCorrect', qo."isCorrect",
            'participants', COALESCE((
              SELECT jsonb_agg(to_jsonb(qp))
              FROM "QuizParticipant" qp
              WHERE qo.id = qp."optionId" AND qp."userId" = ${userId}
            ), '[]'::jsonb)
          )
        ) FROM "QuizOption" qo WHERE qo."quizId" = quiz.id
      ), '[]'::jsonb),
      'countries', COALESCE((
        SELECT jsonb_agg(to_jsonb(qc))
        FROM "QuizCountry" qc
        WHERE qc."quizId" = quiz.id
      ), '[]'::jsonb),
      'continents', COALESCE((
        SELECT jsonb_agg(to_jsonb(qt))
        FROM "QuizContinent" qt
        WHERE qt."quizId" = quiz.id
      ), '[]'::jsonb)
    ) FROM "Quiz" quiz WHERE quiz."postId" = p.id
  ) AS quiz,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', mu.id,
        'name', mu.name,
        'username', mu.username,
        'avatar', mu.avatar,
        'meta', mu.meta,
        'bio', mu.bio,
        'role', mu.role,
        'userType', mu."userType",
        'accountVerified', mu."accountVerified",
        'subscriptions', COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = mu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb)
    ))
    FROM "PostMention" pm
    JOIN "User" mu ON mu.id = pm."userId"
    WHERE pm."postId" = p.id
  ), '[]'::jsonb) AS mentions,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', tu.id,
        'name', tu.name,
        'username', tu.username,
        'avatar', tu.avatar,
        'meta', tu.meta,
        'bio', tu.bio,
        'role', tu.role,
        'userType', tu."userType",
        'accountVerified', tu."accountVerified",
        'subscriptions', COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = tu.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb)
    ))
    FROM "PostUserTag" pt
    JOIN "User" tu ON tu.id = pt."userId"
    WHERE pt."postId" = p.id
  ), '[]'::jsonb) AS tagUsers
FROM combined p
JOIN "User" u ON u.id = p."userId"
LEFT JOIN "Country" c ON u."countryId" = c.id
ORDER BY p."createdAt"`;
        function nestPosts(posts) {
            const map = new Map();
            const parentChain = [];
            const rootRaw = posts.find((p) => p.id === postId);
            const rootPost = (0, utils_2.convertBigInts)(rootRaw);
            for (const post of posts) {
                const converted = (0, utils_2.convertBigInts)(post);
                map.set(converted.id, converted);
            }
            let current = rootPost;
            while ((current === null || current === void 0 ? void 0 : current.parentId) && map.has(current.parentId)) {
                current = map.get(current.parentId);
                parentChain.unshift(current);
            }
            return {
                parentChain,
                post: rootPost,
            };
        }
        return nestPosts(posts);
    });
}
const retriveRecommendationModelData = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get current date and date 30 days ago
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = yield db_1.default.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                likedPosts: {
                    where: {
                        createdAt: { gte: thirtyDaysAgo },
                    },
                    select: {
                        postId: true,
                        userId: true,
                        createdAt: true,
                        post: {
                            select: {
                                content: true,
                                createdAt: true,
                                hashTags: { select: { tag: { select: { name: true } } } },
                            },
                        },
                    },
                },
                bookmarks: {
                    where: {
                        createdAt: { gte: thirtyDaysAgo },
                    },
                    select: {
                        postId: true,
                        userId: true,
                        createdAt: true,
                        post: {
                            select: {
                                content: true,
                                createdAt: true,
                                hashTags: { select: { tag: { select: { name: true } } } },
                            },
                        },
                    },
                },
                postVotes: {
                    where: {
                        createdAt: { gte: thirtyDaysAgo },
                    },
                    select: {
                        userId: true,
                        createdAt: true,
                        option: {
                            include: {
                                poll: {
                                    select: {
                                        postId: true,
                                        post: {
                                            select: {
                                                content: true,
                                                createdAt: true,
                                                hashTags: {
                                                    select: { tag: { select: { name: true } } },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    distinct: ["optionId"],
                },
                pariticipants: {
                    where: {
                        createdAt: { gte: thirtyDaysAgo },
                    },
                    select: {
                        userId: true,
                        createdAt: true,
                        option: {
                            include: {
                                quiz: {
                                    select: {
                                        postId: true,
                                        post: {
                                            select: {
                                                content: true,
                                                createdAt: true,
                                                hashTags: {
                                                    select: { tag: { select: { name: true } } },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    distinct: ["quizId"],
                },
                posts: {
                    where: {
                        createdAt: { gte: thirtyDaysAgo },
                        status: client_1.PostStatus.PUBLISHED,
                        OR: [
                            { kind: client_1.PostKindEnum.REPLY },
                            { kind: client_1.PostKindEnum.QUOTE },
                            { kind: client_1.PostKindEnum.REPOST },
                        ],
                    },
                    select: {
                        id: true,
                        userId: true,
                        parentId: true,
                        rootId: true,
                        createdAt: true,
                        content: true,
                        kind: true,
                        hashTags: { select: { tag: { select: { name: true } } } },
                        parent: {
                            select: {
                                id: true,
                                userId: true,
                                parentId: true,
                                rootId: true,
                                createdAt: true,
                                content: true,
                                kind: true,
                                hashTags: { select: { tag: { select: { name: true } } } },
                            },
                        },
                    },
                },
                viewPosts: {
                    where: {
                        timestamp: { gte: thirtyDaysAgo },
                    },
                    orderBy: [{ duration: "desc" }],
                    select: {
                        postId: true,
                        userId: true,
                        timestamp: true,
                        duration: true,
                        post: {
                            select: {
                                content: true,
                                createdAt: true,
                                hashTags: { select: { tag: { select: { name: true } } } },
                            },
                        },
                    },
                    distinct: ["postId"],
                },
                clickPosts: {
                    where: {
                        timestamp: { gte: thirtyDaysAgo },
                    },
                    orderBy: [{ timestamp: "desc" }],
                    select: {
                        postId: true,
                        userId: true,
                        timestamp: true,
                        post: {
                            select: {
                                content: true,
                                createdAt: true,
                                hashTags: { select: { tag: { select: { name: true } } } },
                            },
                        },
                    },
                    distinct: ["postId"],
                },
                // postMentions: {
                //   where: {
                //     createdAt: { gte: thirtyDaysAgo },
                //   },
                //   select: {
                //     postId: true,
                //     userId: true,
                //     createdAt: true,
                //     post: {
                //       select: {
                //         content: true,
                //         createdAt: true,
                //         hashTags: { select: { tag: { select: { name: true } } } },
                //       },
                //     },
                //   },
                //   distinct: ["postId"],
                // },
                // postUserTags: {
                //   where: {
                //     createdAt: { gte: thirtyDaysAgo },
                //   },
                //   select: {
                //     postId: true,
                //     userId: true,
                //     createdAt: true,
                //     post: {
                //       select: {
                //         content: true,
                //         createdAt: true,
                //         hashTags: { select: { tag: { select: { name: true } } } },
                //       },
                //     },
                //   },
                //   distinct: ["postId"],
                // },
            },
        });
        const { likedPosts, bookmarks, postVotes, pariticipants, posts, viewPosts, clickPosts,
        // postMentions,
        // postUserTags,
         } = result;
        // Process each interaction type & Structure the Data:
        const WEIGHTS = {
            // Highest-intent interactions
            reply: 1.0,
            quote: 1.0,
            // Strong signals of preference or endorsement
            bookmark: 0.95,
            repost: 0.95,
            // Expressive but lower-effort actions
            like: 0.85,
            // Participation-based actions
            poll: 0.8,
            quiz: 0.8,
            // View = user read (high quality but passive)
            view: 0.8,
            // Click = intent to explore (not always full consumption)
            click: 0.75,
        };
        const interactions = [];
        // 1. Likes
        likedPosts.forEach((item) => {
            interactions.push({
                user_id: item.userId,
                type: "like",
                timestamp: item.createdAt,
                weight: WEIGHTS.like,
                post: {
                    id: item.postId,
                    content: item.post.content,
                    tags: item.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.post.createdAt,
                },
            });
        });
        // 2. Bookmarks
        bookmarks.forEach((item) => {
            interactions.push({
                user_id: item.userId,
                type: "bookmark",
                timestamp: item.createdAt,
                weight: WEIGHTS.bookmark,
                post: {
                    id: item.postId,
                    content: item.post.content,
                    tags: item.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.post.createdAt,
                },
            });
        });
        // 3. Poll Votes
        postVotes.forEach((item) => {
            interactions.push({
                user_id: item.userId,
                type: "poll_vote",
                timestamp: item.createdAt,
                weight: WEIGHTS.poll,
                post: {
                    id: item.option.poll.postId,
                    content: item.option.poll.post.content,
                    tags: item.option.poll.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.option.poll.post.createdAt,
                },
            });
        });
        // 4. Quiz Votes
        pariticipants.forEach((item) => {
            interactions.push({
                user_id: item.userId,
                type: "quiz_vote",
                timestamp: item.createdAt,
                weight: WEIGHTS.quiz,
                post: {
                    id: item.option.quiz.postId,
                    content: item.option.quiz.post.content,
                    tags: item.option.quiz.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.option.quiz.post.createdAt,
                },
            });
        });
        // 5. Replies
        posts.forEach((item) => {
            var _a, _b, _c, _d;
            const parentPostId = item.parentId || item.rootId;
            if (parentPostId && item.parent) {
                interactions.push({
                    user_id: item.userId,
                    type: item.kind === client_1.PostKindEnum.QUOTE
                        ? "quote"
                        : item.kind === client_1.PostKindEnum.REPOST
                            ? "repost"
                            : "reply",
                    timestamp: item.createdAt,
                    weight: item.kind === client_1.PostKindEnum.QUOTE
                        ? WEIGHTS.quote
                        : item.kind === client_1.PostKindEnum.REPOST
                            ? WEIGHTS.repost
                            : WEIGHTS.reply,
                    post: {
                        id: parentPostId,
                        content: (_a = item === null || item === void 0 ? void 0 : item.parent) === null || _a === void 0 ? void 0 : _a.content,
                        tags: (_c = (_b = item === null || item === void 0 ? void 0 : item.parent) === null || _b === void 0 ? void 0 : _b.hashTags.map((tag) => tag.tag.name)) !== null && _c !== void 0 ? _c : [],
                        createdAt: (_d = item === null || item === void 0 ? void 0 : item.parent) === null || _d === void 0 ? void 0 : _d.createdAt,
                    },
                });
            }
        });
        // 6. Views
        viewPosts.forEach((item) => {
            const MAX_VIEW_DURATION = 120; // 2 minutes (in seconds)
            const duration = item.duration || 0;
            // Calculate duration multiplier (0-1 scale)
            const durationMultiplier = Math.min(duration / MAX_VIEW_DURATION, 1);
            // Apply scaling to base view weight
            const weight = Number((WEIGHTS.view * durationMultiplier).toFixed(2));
            interactions.push({
                user_id: item.userId,
                type: "view",
                timestamp: item.timestamp,
                weight,
                post: {
                    id: item.postId,
                    content: item.post.content,
                    tags: item.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.post.createdAt,
                },
            });
        });
        // 7. Clicks
        clickPosts.forEach((item) => {
            interactions.push({
                user_id: item.userId,
                type: "click",
                timestamp: item.timestamp,
                weight: WEIGHTS.click,
                post: {
                    id: item.postId,
                    content: item.post.content,
                    tags: item.post.hashTags.map((tag) => tag.tag.name),
                    createdAt: item.post.createdAt,
                },
            });
        });
        // // 8. Mentions & Tags
        // postMentions.forEach((item) => {
        //   interactions.push({
        //     user_id: item.userId,
        //     type: "mention",
        //     timestamp: item.createdAt,
        //     weight: WEIGHTS.mention,
        //     post: {
        //       id: item.postId,
        //       content: item.post.content,
        //       tags: item.post.hashTags.map((tag) => tag.tag.name),
        //       createdAt: item.post.createdAt,
        //     },
        //   });
        // });
        // postUserTags.forEach((item) => {
        //   interactions.push({
        //     user_id: item.userId,
        //     type: "tag",
        //     timestamp: item.createdAt,
        //     weight: WEIGHTS.tag,
        //     post: {
        //       id: item.postId,
        //       content: item.post.content,
        //       tags: item.post.hashTags.map((tag) => tag.tag.name),
        //       createdAt: item.post.createdAt,
        //     },
        //   });
        // });
        console.log(interactions);
        return { data: { user_id: userId, interactions }, status: 200 };
    }
    catch (error) {
        logger_1.default.error(error);
        return { data: "Sorry an error occurred", status: 500 };
    }
});
exports.retriveRecommendationModelData = retriveRecommendationModelData;
// retriveRecommendationModelData("cm9jlc6so0000vd3i7rhv4czf");
