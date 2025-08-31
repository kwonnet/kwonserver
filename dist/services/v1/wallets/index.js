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
exports.rewardDailyTask = exports.updateWalletBonus = exports.getTxnHistory = exports.fundCoins = exports.withdrawCoins = exports.transferCoins = exports.getUserCoinsWallet = exports.saveUserWalletAddress = void 0;
const client_1 = require("@prisma/client");
const _types_1 = require("@/@types");
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const helper_1 = require("../../helper");
const ton_1 = require("../../ton");
const saveUserWalletAddress = (_a, user_1) => __awaiter(void 0, [_a, user_1], void 0, function* ({ address, name }, user) {
    try {
        console.log(`saveUserWalletAddress address`, address, name);
        const count = yield db_1.default.walletAddress.count({
            where: { userId: user.id },
        });
        const isPrimary = count === 0;
        console.log(`saveUserWalletAddress user`, user, "count ", count, "isPrimary ", isPrimary);
        const check = yield db_1.default.walletAddress.findFirst({
            where: { userId: user.id, name },
        });
        if (!check) {
            const result = yield db_1.default.walletAddress.create({
                data: { address, userId: user.id, name, isPrimary },
            });
            return { data: result, status: 200 };
        }
        const { metadata } = check, rest = __rest(check, ["metadata"]);
        const _metadata = [
            ...metadata,
            Object.assign(Object.assign({}, rest), { date: new Date().toISOString() }),
        ];
        const result = yield db_1.default.walletAddress.update({
            data: { address, metadata: _metadata },
            where: { userId: user.id },
        });
        return { data: result, status: 200 };
    }
    catch (error) {
        console.log(error);
        return {
            data: "Error: Failed to save wallet address, please try again",
            status: 500,
        };
    }
});
exports.saveUserWalletAddress = saveUserWalletAddress;
const getUserCoinsWallet = (id) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.wallet.findFirst({ where: { userId: id } });
        if (!result)
            return { data: "Wallet not founc", status: 404 };
        return { data: result, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to find wallet details, please try again",
            status: 500,
        };
    }
});
exports.getUserCoinsWallet = getUserCoinsWallet;
const transferCoins = (_a) => __awaiter(void 0, [_a], void 0, function* ({ senderId, recipientId, amount, }) {
    var _b, _c;
    try {
        const txnFee = 0.5 * amount;
        const txnAmount = amount + txnFee;
        // sync both the sender and the recipient wallet
        const syncResult = yield (0, helper_1.syncRedisSenderRecipientWalletToPrisma)(senderId, recipientId);
        if (syncResult.isError)
            return { status: 500, message: syncResult.message };
        // get from and to user
        const [sender, recipient] = yield db_1.default.$transaction([
            db_1.default.user.findFirst({
                where: { id: senderId },
                include: { wallet: true },
            }),
            db_1.default.user.findFirst({
                where: { id: recipientId },
                include: { wallet: true },
            }),
        ]);
        // check if from user and wallet exists
        if (!sender || !sender.wallet)
            return { status: 404, message: "Sender does not exist " };
        // check if to user and wallet exists
        if (!recipient || !recipient.wallet)
            return { status: 404, message: "Recipient does not exist" };
        // check min transfer
        if (amount < 100)
            return { status: 400, message: "Minimun transfer amount is 100 coins" };
        // check from wallet balance
        if (((_b = sender === null || sender === void 0 ? void 0 : sender.wallet) === null || _b === void 0 ? void 0 : _b.coins) < amount)
            return { status: 400, message: "Insufficient balance" };
        // check the wallet balance will cover the transaction fee
        if (((_c = sender === null || sender === void 0 ? void 0 : sender.wallet) === null || _c === void 0 ? void 0 : _c.coins) < txnAmount)
            return {
                status: 400,
                message: "Insufficient balance to cover transaction fees",
            };
        // temporarily lock the sender and recipient wallet until this txn is processed
        yield db_1.default.$transaction([
            db_1.default.wallet.update({
                where: { userId: senderId },
                data: { isLocked: true },
            }),
            db_1.default.wallet.update({
                where: { userId: recipientId },
                data: { isLocked: true },
            }),
        ]);
        // debit sender and credit recipient
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [senderWallet, recipientWallet] = yield db_1.default.$transaction([
            // debit sender
            db_1.default.wallet.update({
                where: { userId: senderId },
                data: { isLocked: false, coins: { decrement: txnAmount } },
            }),
            // credit recipient
            db_1.default.wallet.update({
                where: { userId: recipientId },
                data: { isLocked: false, coins: { increment: amount } },
            }),
            // save sender transaction
            db_1.default.transaction.create({
                data: {
                    amount: txnAmount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    category: client_1.TxnCategoryEnum.COIN_TRANSFER,
                    description: `Transfer of ${amount} ${client_1.TxnCurrencyEnum.COINS} to ${recipient.name} successful`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.COINS,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: senderId,
                    senderId: senderId,
                    recipientId: recipientId,
                    walletId: sender === null || sender === void 0 ? void 0 : sender.wallet.id,
                    metadata: {
                        item: { amount, txnAmount, txnFee },
                        currency: client_1.TxnCurrencyEnum.COINS,
                    },
                },
            }),
            // save recipient transaction
            db_1.default.transaction.create({
                data: {
                    amount: amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    category: client_1.TxnCategoryEnum.COIN_RECEIVED,
                    description: `You received ${amount} ${client_1.TxnCurrencyEnum.COINS} from ${sender.name} in your wallet`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.COINS,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: recipientId,
                    senderId: senderId,
                    recipientId: recipientId,
                    walletId: recipient === null || recipient === void 0 ? void 0 : recipient.wallet.id,
                    metadata: {
                        item: { amount, txnAmount, txnFee },
                        currency: client_1.TxnCurrencyEnum.COINS,
                    },
                },
            }),
        ]);
        // update redis user wallet
        if (syncResult.data) {
            (0, helper_1.syncPrismaSenderRecipientWalletToRedis)(Object.assign(Object.assign({}, syncResult.data), { senderWallet,
                recipientWallet }));
        }
        // send notification to recipient
        // use socket.io or server sent events
        // return result
        return { data: "Transfer successful", status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to execute transfer, please try again",
            status: 500,
        };
    }
});
exports.transferCoins = transferCoins;
const withdrawCoins = (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, amount, }) {
    var _b, _c;
    try {
        const txnFee = (0, utils_1.getWithrawalTxnFee)(amount);
        const txnAmount = amount + txnFee;
        // sync both the sender and the recipient wallet
        const syncResult = yield (0, helper_1.syncRedisUserWalletToPrisma)(userId);
        if (syncResult.isError)
            return { status: 500, data: syncResult.message };
        // get from and to user
        const user = yield db_1.default.user.findFirst({
            where: { id: userId },
            include: { wallet: true },
        });
        // check if from user and wallet exists
        if (!user || !user.wallet)
            return { status: 404, data: "User does not exist " };
        // check min transfer
        if (amount < 100)
            return { status: 400, data: "Minimun withdrawal amount is 100 TZX" };
        // check from wallet balance
        if (((_b = user === null || user === void 0 ? void 0 : user.wallet) === null || _b === void 0 ? void 0 : _b.credit) < amount)
            return { status: 400, data: "Insufficient balance" };
        // check the wallet balance will cover the transaction fee
        if (((_c = user === null || user === void 0 ? void 0 : user.wallet) === null || _c === void 0 ? void 0 : _c.credit) < txnAmount)
            return {
                status: 400,
                data: "Insufficient balance to cover transaction fees",
            };
        // get user crypto address
        const walletAddress = yield db_1.default.walletAddress.findFirst({
            where: { userId },
        });
        if (!walletAddress)
            return {
                status: 400,
                data: "Crypto wallet address not found, please link your TON wallet and try again",
            };
        const recipientAddress = walletAddress.address;
        // get TON equivalent
        const curr_ton_rate = yield (0, utils_1.getCurrent_ton_usd_rate)();
        if (!curr_ton_rate)
            return {
                data: "Error getting TON current rate, please try again",
                status: 402,
            };
        const tonTxnAmount = (0, utils_1.getTONRate)(curr_ton_rate, amount, true);
        // temporarily lock the sender and recipient wallet until this txn is processed
        yield db_1.default.wallet.update({ where: { userId }, data: { isLocked: true } });
        // debit sender and credit recipient
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [userWallet, txn] = yield db_1.default.$transaction([
            // debit user
            db_1.default.wallet.update({
                where: { userId },
                data: { credit: { decrement: txnAmount } },
            }),
            // save sender transaction
            db_1.default.transaction.create({
                data: {
                    amount: txnAmount,
                    currency: client_1.TxnCurrencyEnum.TZX,
                    category: client_1.TxnCategoryEnum.COIN_WITHDRAWAL,
                    description: `Withdrawal request of ${txnAmount} ${client_1.TxnCurrencyEnum.TZX} in ${tonTxnAmount} ${client_1.TxnCurrencyEnum.TON} initiated`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.CREDIT,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.PROCESSING,
                    txnRef,
                    userId,
                    senderId: userId,
                    walletId: user === null || user === void 0 ? void 0 : user.wallet.id,
                    metadata: {
                        item: {
                            amount,
                            txnAmount,
                            txnFee,
                            address: recipientAddress,
                            curr_ton_rate,
                            tonTxnAmount,
                            userId,
                        },
                        currency: client_1.TxnCurrencyEnum.TZX,
                    },
                },
            }),
        ]);
        // initiate TON transaction
        // const result = await withdrawTonCoins(recipientAddress, tonTxnAmount, txnRef)
        const result = yield (0, ton_1.withdrawTestTonCoins)(recipientAddress, tonTxnAmount, txnRef);
        // const result = await withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 0.01, txnRef )
        // check if failed and refund transaction
        if (result.isError) {
            yield db_1.default.$transaction([
                // refund wallet transaction
                db_1.default.wallet.update({
                    where: { userId },
                    data: { credit: { increment: txnAmount }, isLocked: false },
                }),
                // update transaction
                db_1.default.transaction.update({
                    where: { id: txn.id },
                    data: {
                        status: client_1.TxnStatusEnum.REFUNDED,
                        description: txn.description.replace("initiated", "failed & refunded"),
                    },
                }),
            ]);
            return { status: 500, data: result.message };
        }
        // update wallet if success
        yield db_1.default.$transaction([
            // refund wallet transaction
            db_1.default.wallet.update({ where: { userId }, data: { isLocked: false } }),
            // update transaction
            db_1.default.transaction.update({
                where: { id: txn.id },
                data: {
                    status: client_1.TxnStatusEnum.COMPLETED,
                    description: txn.description.replace("initiated", "successful"),
                },
            }),
        ]);
        // sync user prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(userId, userWallet);
        // return result
        return { data: "Withdrawal successful", status: 200 };
    }
    catch (error) {
        // await prisma.wallet.update({ where: { userId }, data: { isLocked: false}})
        return {
            data: "Error: Failed to execute transfer, please try again later",
            status: 500,
        };
    }
});
exports.withdrawCoins = withdrawCoins;
const fundCoins = (_a, currUser_1) => __awaiter(void 0, [_a, currUser_1], void 0, function* ({ userId, amount, bonus }, currUser) {
    try {
        // sync both the sender and the recipient wallet
        const syncResult = yield (0, helper_1.syncRedisUserWalletToPrisma)(userId);
        if (syncResult.isError)
            return { status: 500, message: syncResult.message };
        // get from and to user
        const user = yield db_1.default.user.findFirst({
            where: { id: userId },
            include: { wallet: true },
        });
        // check if from user and wallet exists
        if (!user || !user.wallet)
            return { status: 404, message: "User does not exist " };
        // execute transaction
        const desc = amount > 0 && bonus > 0
            ? `You received ${amount} ${client_1.TxnCurrencyEnum.COINS} &  bonus of ${bonus} ${client_1.TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`
            : amount > 0
                ? `You received ${amount} ${client_1.TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`
                : `You received bonus of ${bonus} ${client_1.TxnCurrencyEnum.COINS} in your wallet from ${currUser.name}`;
        // update wallet
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [userWallet] = yield db_1.default.$transaction([
            // debit user
            db_1.default.wallet.update({
                where: { userId },
                data: { coins: { increment: amount }, bonus: { increment: bonus } },
            }),
            // save sender transaction
            db_1.default.transaction.create({
                data: {
                    amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    category: client_1.TxnCategoryEnum.COIN_RECEIVED,
                    description: desc,
                    gateway: client_1.TxnGatewayEnum.VIRTUAL,
                    source: client_1.TxnSourceEnum.VIRTUAL,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId,
                    senderId: currUser.id,
                    recipientId: userId,
                    metadata: {
                        item: { amount, bonus, recipient: userId, senderId: currUser.id },
                        currency: client_1.TxnCurrencyEnum.COINS,
                    },
                },
            }),
        ]);
        // sync user prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(userId, userWallet);
        // return response
        return { status: 200, data: "Funding successful" };
    }
    catch (error) {
        return {
            data: "Error: Failed to execute transfer, please try again",
            status: 500,
        };
    }
});
exports.fundCoins = fundCoins;
const getTxnHistory = (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, page, limit, }) {
    try {
        //1496FD5
        const skip = (page - 1) * limit;
        const result = yield db_1.default.transaction.findMany({
            where: { userId },
            skip,
            take: limit,
            orderBy: [{ createdAt: "desc" }],
        });
        if (result.length === 0)
            return { status: 404, data: "No transaction history" };
        // return response
        return { status: 200, data: result };
    }
    catch (error) {
        return {
            data: "Error: Failed to execute transfer, please try again",
            status: 500,
        };
    }
});
exports.getTxnHistory = getTxnHistory;
const updateWalletBonus = (arg) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // sync both the sender and the recipient wallet
        const syncResult = yield (0, helper_1.syncRedisUserWalletToPrisma)(arg.userId);
        if (syncResult.isError)
            return { status: 500, message: syncResult.message };
        // get from and to user
        const user = yield db_1.default.user.findFirst({
            where: { id: arg.userId },
            include: { wallet: true },
        });
        // check if from user and wallet exists
        if (!user || !user.wallet)
            return { status: 404, message: "User does not exist " };
        // execute transaction
        const desc = arg.isTask
            ? `Rewarded ${arg.amount} bonus ${client_1.TxnCurrencyEnum.COINS} for performing app task`
            : `Rewarded ${arg.amount} bonus ${client_1.TxnCurrencyEnum.COINS} ${arg.type === _types_1.BonusTypeEnum.BONUS ? "as daily bonus" : "for watching ads"} `;
        // update wallet
        const txnRef = (0, utils_1.generateUniqueRef)();
        const date = (_a = new Date(arg.date)) !== null && _a !== void 0 ? _a : new Date();
        const [userWallet] = yield db_1.default.$transaction([
            // credit user
            db_1.default.wallet.update({
                where: { userId: arg.userId },
                data: { bonus: { increment: arg.amount } },
            }),
            // save sender transaction
            db_1.default.transaction.create({
                data: {
                    amount: arg.amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    category: arg.isTask
                        ? client_1.TxnCategoryEnum.APP_TASK
                        : client_1.TxnCategoryEnum.DAILY_BONUS,
                    description: desc,
                    gateway: client_1.TxnGatewayEnum.VIRTUAL,
                    source: client_1.TxnSourceEnum.VIRTUAL,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: arg.userId,
                    recipientId: arg.userId,
                    metadata: {
                        item: Object.assign({ amount: 0, bonus: arg.amount, recipient: arg.userId }, (arg.meta && { item: arg.meta })),
                        currency: client_1.TxnCurrencyEnum.COINS,
                    },
                },
            }),
            // update task timer
            db_1.default.userTaskSettings.upsert({
                where: { userId: arg.userId },
                update: Object.assign({}, (arg.type === _types_1.BonusTypeEnum.BONUS ? { dailyBonusDate: date } : { adsBonusDate: date })),
                create: Object.assign({ userId: arg.userId }, (arg.type === _types_1.BonusTypeEnum.BONUS ? { dailyBonusDate: date } : { adsBonusDate: date })),
            }),
        ]);
        // sync user prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(arg.userId, userWallet);
        // return response
        return { status: 200, data: "Success" };
    }
    catch (error) {
        return {
            data: "Error: Failed to execute transfer, please try again",
            status: 500,
        };
    }
});
exports.updateWalletBonus = updateWalletBonus;
const rewardDailyTask = (_a) => __awaiter(void 0, [_a], void 0, function* ({ id: taskId, code, userId, }) {
    try {
        const result = yield db_1.default.task.findFirst({
            where: { id: taskId },
            include: { performedBy: { where: { userId, taskId } } },
        });
        if (!result)
            return { data: "Not found", status: 404 };
        if (result.performedBy.length > 0) {
            return { data: "You have already performed this task", status: 422 };
        }
        if (result.code && result.code !== code) {
            return { data: "Invalid code provided", status: 422 };
        }
        // sync both the sender and the recipient wallet
        const syncResult = yield (0, helper_1.syncRedisUserWalletToPrisma)(userId);
        if (syncResult.isError)
            return { status: 500, data: syncResult.message };
        // get from and to user
        const user = yield db_1.default.user.findFirst({
            where: { id: userId },
            include: { wallet: true },
        });
        // check if from user and wallet exists
        if (!user || !user.wallet)
            return { status: 404, data: "User does not exist " };
        // execute transaction
        const desc = `Rewarded ${result.reward} ${result.rewardType} for performing app task`;
        // update wallet
        const updateObj = result.rewardType === client_1.RewardTypeEnum.CREDIT
            ? { credit: { increment: result.reward } }
            : result.rewardType === client_1.RewardTypeEnum.COINS
                ? { amount: { increment: result.reward } }
                : { bonus: { increment: result.reward } };
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [userWallet] = yield db_1.default.$transaction([
            // debit user
            db_1.default.wallet.update({ where: { userId }, data: updateObj }),
            // save sender transaction
            db_1.default.transaction.create({
                data: {
                    amount: result.reward,
                    currency: result.rewardType === client_1.RewardTypeEnum.CREDIT
                        ? client_1.TxnCurrencyEnum.TZX
                        : client_1.TxnCurrencyEnum.COINS,
                    category: client_1.TxnCategoryEnum.APP_TASK,
                    description: desc,
                    gateway: client_1.TxnGatewayEnum.VIRTUAL,
                    source: client_1.TxnSourceEnum.VIRTUAL,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId,
                    recipientId: userId,
                    taskId,
                    metadata: {
                        item: { amount: result.reward, rewardType: result.rewardType, recipient: userId, taskId, code },
                        currency: client_1.TxnCurrencyEnum.COINS,
                    },
                },
            }),
            // create user task
            db_1.default.userTask.create({ data: { taskId, userId, status: client_1.TaskStatus.COMPLETED } }),
        ]);
        // sync user prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(userId, userWallet);
        // return response
        return { status: 200, data: "Success" };
    }
    catch (error) {
        return {
            data: "Error: Failed to execute transfer, please try again",
            status: 500,
        };
    }
});
exports.rewardDailyTask = rewardDailyTask;
// test app wallet
// withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 1, generateUniqueRef() )
// withdrawTestTonCoins("UQBBihRy2mEPpzWjxQi44_dKFga_Hzn-oWtC4SdRIRMEof1L", 0.5, generateUniqueRef() )
// Live app wallet
// withdrawTestTonCoins("UQDB7WxFFuZQ2LPMwoC7eSLWwLJ1pMZZ_sURxct8GAXEIuHt", 0.02, generateUniqueRef() )
