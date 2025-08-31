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
exports.handleReferral = exports.loginUser = exports.createUser = void 0;
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = require("crypto");
const utils_2 = require("../utils");
const logger_1 = __importDefault(require("@/logger"));
const createUser = (body, location) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const dbUser = yield db_1.default.user.findFirst({
            where: { email: { mode: "insensitive", equals: body.email } },
        });
        if (dbUser)
            return { status: 422, data: "User with email already exists" };
        // create new user
        const hash = yield bcrypt_1.default.hash(body.password, 10);
        let userCountry = null;
        if (location && (location === null || location === void 0 ? void 0 : location.country)) {
            userCountry = yield db_1.default.country.findFirst({
                where: {
                    OR: [
                        { iso2: { mode: "insensitive", equals: location === null || location === void 0 ? void 0 : location.country } },
                        { iso3: { mode: "insensitive", equals: location === null || location === void 0 ? void 0 : location.country } },
                        { name: { mode: "insensitive", equals: location === null || location === void 0 ? void 0 : location.country } },
                    ],
                },
            });
        }
        // check if user name is already taken
        let username = body.email.split("@")[0];
        const checkUsername = yield db_1.default.user.findFirst({
            where: { username: { mode: "insensitive", equals: username } },
        });
        if (checkUsername) {
            username = `${username}${(0, crypto_1.randomUUID)().slice(-5)}`;
        }
        const amount = (0, utils_1.getRandomNumber)(10, 15, true);
        const newUser = yield db_1.default.user.create({
            data: Object.assign({ email: body.email, name: body.name, username, password: hash, wallet: { create: { bonus: amount } }, location: {
                    create: {
                        latitude: (_a = location === null || location === void 0 ? void 0 : location.latitude) !== null && _a !== void 0 ? _a : 0,
                        longitude: (_b = location === null || location === void 0 ? void 0 : location.longitude) !== null && _b !== void 0 ? _b : 0,
                        meta: location,
                    },
                } }, (userCountry && { country: { connect: { id: userCountry === null || userCountry === void 0 ? void 0 : userCountry.id } } })),
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
        if (body.refId && !newUser.id.endsWith(body.refId)) {
            // the new user is the referee
            (0, exports.handleReferral)({ referrerId: body.refId, refereeId: newUser.id });
        }
        const user = (0, utils_2.composePublicUser)(newUser, true);
        return {
            data: user,
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.createUser = createUser;
const loginUser = (body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dbUser = yield db_1.default.user.findFirst({
            where: {
                OR: [
                    { email: { equals: body.email, mode: "insensitive" } },
                    { username: { equals: body.email, mode: "insensitive" } },
                ],
            },
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
        // console.log("dbUser ", dbUser)
        // check user
        if (!dbUser || !dbUser.password) {
            return { data: "Wrong auth credentials provided", status: 401 };
        }
        // check password
        const isMatch = yield bcrypt_1.default.compare(body.password, dbUser.password);
        // console.log("isMatch ", isMatch)
        if (!isMatch) {
            return { data: "Wrong auth credentials provided", status: 401 };
        }
        // check account status
        const statuses = [client_1.UserStatus.BANNED, client_1.UserStatus.SUSPENDED];
        if (statuses.includes(dbUser.status)) {
            return { data: (0, utils_2.getUserStatusMessage)(dbUser, true), status: 401 };
        }
        // compose user
        const user = (0, utils_2.composePublicUser)(dbUser, true);
        return {
            data: user,
            status: 200,
        };
    }
    catch (error) {
        console.log(error);
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.loginUser = loginUser;
const handleReferral = (params) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("handle referral params", params);
        // Check if the user has a record in the Referral model
        const [referee, referrer] = yield db_1.default.$transaction([
            db_1.default.referral.findFirst({
                where: { referee: { id: params.refereeId } },
            }),
            db_1.default.user.findFirst({
                where: { id: { endsWith: params.referrerId } },
                include: {
                    _count: {
                        select: {
                            likedPosts: true,
                            posts: true,
                        },
                    },
                },
            }),
        ]);
        // check if the person has been referred already
        if (referee || !referrer) {
            return referee ? "User is already referred" : "Referrer not found";
        }
        // check if account is active
        const statuses = [client_1.UserStatus.BANNED, client_1.UserStatus.SUSPENDED];
        if (statuses.includes(referrer.status)) {
            return (0, utils_2.getUserStatusMessage)(referrer);
        }
        // check if the referrer account is old enough for instant reward(at least 10 days old)
        const time = new Date(referrer.createdAt).getTime();
        const seconds = Math.round(time / 1000);
        const isOldEnough = seconds >= 10 * 24 * 60 * 60; // at least 10 days old
        logger_1.default.info(Object.assign({ isOldEnough }, referrer._count), "Check account reward status");
        // check for instant reward
        const isInstantReward = isOldEnough ||
            referrer._count.likedPosts >= 5 ||
            referrer._count.posts >= 5;
        // calc reward amount
        const amount = (0, utils_1.getRandomNumber)(10, 15, true);
        logger_1.default.info({ isInstantReward, amount }, "Check account instant reward");
        // reward user if account is qualified for instant reward
        if (isInstantReward) {
            const [result] = yield db_1.default.$transaction([
                db_1.default.referral.create({
                    data: {
                        referrerId: referrer === null || referrer === void 0 ? void 0 : referrer.id,
                        refereeId: params === null || params === void 0 ? void 0 : params.refereeId,
                        amount,
                        isRewarded: true,
                    },
                }),
                db_1.default.wallet.update({
                    where: { userId: referrer.id },
                    data: { bonus: { increment: amount } },
                }),
            ]);
            logger_1.default.info(result, `${referrer.name} is rewarded ${amount}`);
            return result;
        }
        else {
            const result = yield db_1.default.referral.create({
                data: {
                    referrerId: referrer === null || referrer === void 0 ? void 0 : referrer.id,
                    refereeId: params === null || params === void 0 ? void 0 : params.refereeId,
                    amount,
                },
            });
            logger_1.default.info(result, `Referrer reward is deffered`);
            return result;
        }
    }
    catch (error) {
        logger_1.default.error(`Referrer reward error - ${error === null || error === void 0 ? void 0 : error.message}`);
        return "Sorry an error ocurred, try again";
    }
});
exports.handleReferral = handleReferral;
