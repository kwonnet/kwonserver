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
exports.renewTmaAppSubscription = exports.cancelAppSubscription = exports.purchaseAppSubscription = exports.renewAppSubscriptionWithWallet = exports.purchaseAppSubscriptionWithWallet = exports.genTmaSubscriptionInvoice = exports.getPlans = void 0;
const db_1 = __importDefault(require("@/db"));
const utils_1 = require("@/utils");
const client_1 = require("@prisma/client");
const helper_1 = require("../../helper");
const _types_1 = require("@/@types");
const games_1 = require("../games");
const telegram_bot_1 = require("@/telegram-bot");
const utils_2 = require("@/cron/utils");
const getPlans = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = yield db_1.default.subscriptionPlan.findMany({
            include: { features: true },
        });
        const isFound = data.length > 0;
        return { data: isFound ? data : "Not found", status: isFound ? 200 : 404 };
    }
    catch (error) {
        return { data: "Error occurred, please try again", status: 500 };
    }
});
exports.getPlans = getPlans;
const genTmaSubscriptionInvoice = (arg, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // check if subscription exists
        const item = yield db_1.default.subscriptionPlan.findFirst({
            where: { id: arg.planId },
        });
        if (!item)
            return { status: 400, data: "Invalid subscription plan provided" };
        // get tier
        const tier = item.tier.find((t) => t.id === arg.tierId);
        if (arg.tierId && !tier)
            return { status: 400, data: "Invalid subscription plan provided" };
        // compose payload
        // const planName = arg.tierId ? `${item.name} - ${tier?.name}` : item.name
        const planType = arg.planType.toLowerCase();
        const desc = `Pay ${arg.amount} ${arg.currency === client_1.TxnCurrencyEnum.XTR ? "stars" : arg.currency} for ${planType} ${arg.planName} plan subscription `;
        const amount = arg.currency === client_1.TxnCurrencyEnum.XTR ? arg.amount : arg.amount * 100;
        // configure recurring payment or subscription
        // month
        const date = new Date();
        const endMonthDate = new Date(date.setMonth(date.getUTCMonth() + 1));
        // year
        const date1 = new Date();
        const endYearDate = new Date(date1.setUTCFullYear(date.getUTCFullYear() + 1));
        // Calculate the difference in seconds
        // const subscription_period = arg.planType === PlanTypeEnum.MONTHLY ? Math.floor((endMonthDate.getTime() - Date.now()) / 1000) : Math.floor((endYearDate.getTime() - Date.now()) / 1000)
        const subscription_period = arg.planType === _types_1.PlanTypeEnum.MONTHLY ? 2592000 : 31104000;
        console.log("subscription_period ", amount, subscription_period);
        console.log(arg.providerToken);
        // create subscription invoice
        const invoiceLink = yield telegram_bot_1.telegramBot.createInvoiceLink(Object.assign(Object.assign(Object.assign({ title: `${arg.planName} plan`, description: desc, currency: arg.currency, payload: `appSub_${user.id}_tx_${arg.botTxnRef}`, prices: [{ amount, label: arg.planName }], provider_token: arg.providerToken }, (arg.isRecurring &&
            arg.gateway === client_1.TxnGatewayEnum.STARS && { subscription_period })), (arg.gateway === client_1.TxnGatewayEnum.UNLIMINT && {
            need_email: true,
            send_email_to_provider: true,
        })), (arg.isRecurring && arg.gateway === client_1.TxnGatewayEnum.SMART_GLOCAL && {
            provider_data: { save_card: true, recurrent: true }
        })));
        return { data: invoiceLink, status: 200 };
    }
    catch (error) {
        return { data: `Error occurred: ${error === null || error === void 0 ? void 0 : error.message}`, status: 500 };
    }
});
exports.genTmaSubscriptionInvoice = genTmaSubscriptionInvoice;
const purchaseAppSubscriptionWithWallet = (item, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get user
        const user = yield db_1.default.user.findFirst({ where: { id: userId } });
        if (!user)
            return { data: "User not found", status: 400 };
        // get plan package
        const plan = yield db_1.default.subscriptionPlan.findUnique({
            where: { id: item.planId },
        });
        if (!plan)
            return { data: "Error: Invalid subscription plan", status: 400 };
        // sync user redis and prisma wallet
        yield (0, games_1.syncUserRedisWalletToPrisma)(user.id);
        // get user wallet
        const wallet = yield db_1.default.wallet.findFirst({
            where: { userId: user.id },
        });
        if (!wallet)
            return { data: "Cannot retrieve user wallet", status: 400 };
        if (wallet.isLocked)
            return {
                data: "User wallet is temporary locked at the moment",
                status: 400,
            };
        if (wallet.credit < item.amount)
            return {
                data: "Insufficient balance to pay for this subscription plan, please try another one!",
                status: 400,
            };
        // debit user wallet credit and credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            // debit user wallet credit
            const userWallet = yield tx.wallet.update({
                where: { userId: user.id },
                data: {
                    isLocked: true,
                    credit: { decrement: item.amount },
                },
            });
            // disable current active subscription
            yield tx.subscription.updateMany({
                where: { userId: user.id, status: "ACTIVE" },
                data: { status: "PAUSED" },
            });
            // disable all primary
            yield tx.subscription.updateMany({
                where: { userId: user.id },
                data: { isPrimary: false },
            });
            // get subscription
            const currentSub = yield db_1.default.subscription.findFirst({
                where: { userId: user.id, planId: item.planId },
            });
            let subscription = undefined;
            // check if user has an active subscription and the plan is different
            if (!currentSub) {
                // create new subscription
                const startDate = new Date();
                const date = new Date();
                const endDate = item.planType === client_1.BillingCycleEnum.MONTHLY
                    ? new Date(date.setUTCMonth(date.getUTCMonth() + 1))
                    : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
                subscription = yield tx.subscription.create({
                    data: Object.assign({ userId: user.id, planId: item.planId, billingCycle: item.planType, isRecurring: item.isRecurring, startDate,
                        endDate, status: "ACTIVE", isPrimary: true }, (((_a = item === null || item === void 0 ? void 0 : item.meta) === null || _a === void 0 ? void 0 : _a.tierId) && { meta: { tierId: (_b = item.meta) === null || _b === void 0 ? void 0 : _b.tierId } })),
                });
            }
            else {
                // update existing subscription
                const startDate = new Date();
                const date = new Date();
                const endDate = item.planType === client_1.BillingCycleEnum.MONTHLY
                    ? new Date(date.setMonth(date.getUTCMonth() + 1))
                    : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
                // metadata
                const metadata = currentSub.metadata.concat([
                    {
                        id: currentSub.id,
                        billingCycle: currentSub.billingCycle,
                        planId: currentSub.planId,
                        startDate: currentSub.startDate,
                        endDate: currentSub.endDate,
                        status: currentSub.status,
                        isPrimary: currentSub.isPrimary,
                        tierId: (_c = item.meta) === null || _c === void 0 ? void 0 : _c.tierId,
                        meta: currentSub.meta,
                    },
                ]);
                // update existing subscription
                subscription = yield tx.subscription.update({
                    where: { id: currentSub.id },
                    data: Object.assign({ planId: item.planId, billingCycle: item.planType, isRecurring: item.isRecurring, startDate,
                        endDate, status: "ACTIVE", isPrimary: true, metadata }, (((_d = item === null || item === void 0 ? void 0 : item.meta) === null || _d === void 0 ? void 0 : _d.tierId) && { meta: { tierId: (_e = item.meta) === null || _e === void 0 ? void 0 : _e.tierId } })),
                });
            }
            // save debit transaction record
            yield tx.transaction.create({
                data: {
                    amount: item.amount,
                    currency: item.currency,
                    subPlanId: item.planId,
                    subscriptionId: subscription === null || subscription === void 0 ? void 0 : subscription.id,
                    category: client_1.TxnCategoryEnum.APP_SUBSCRIPTION,
                    description: `Charged ${item.amount} ${item.currency} from your wallet credit for ${item.planType} ${plan.name} subscription plan.`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.CREDIT,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: user.id,
                    senderId: user.id,
                    walletId: wallet.id,
                    metadata: Object.assign({}, item.meta),
                },
            });
            // update user meta objec
            yield tx.user.update({
                where: { id: user.id },
                data: {
                    meta: {
                        status: "ACTIVE",
                        type: "PRO",
                        color: user.userType === client_1.UserTypeEnum.GOVERNMENT
                            ? "grey"
                            : user.userType === client_1.UserTypeEnum.BUSINESS
                                ? "gold"
                                : "blue",
                    },
                },
            });
            // unlock user wallet credit
            yield tx.wallet.update({
                where: { userId: user.id },
                data: { isLocked: false },
            });
            // return
            return { wallet: userWallet, subscription };
        }));
        // add subscription to cron job
        if (result.subscription.isRecurring) {
            (0, utils_2.addSubscriptionCronJob)(result.subscription.id);
        }
        else {
            (0, utils_2.removeSubscriptionCronJob)({ userId: user.id, subId: result.subscription.id });
        }
        // sync prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(user.id, result.wallet);
        return { data: item, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.purchaseAppSubscriptionWithWallet = purchaseAppSubscriptionWithWallet;
const renewAppSubscriptionWithWallet = (subId) => __awaiter(void 0, void 0, void 0, function* () {
    // const isTest = true
    // if(isTest){
    //   return {
    //     isError: true,
    //     message: "App subscription renewal error, subscription record not found",
    //     status: 404,
    //   };
    // }
    try {
        const currentSub = yield db_1.default.subscription.findUnique({
            where: { id: subId },
            include: {
                user: true,
                plan: true,
                transactions: {
                    where: {
                        subscriptionId: subId,
                        category: client_1.TxnCategoryEnum.APP_SUBSCRIPTION,
                        currency: client_1.TxnCurrencyEnum.TZX,
                    },
                    orderBy: [{ createdAt: "desc" }],
                },
            },
        });
        if (!currentSub) {
            return {
                isError: true,
                message: "App subscription renewal error, subscription record not found",
                status: 404,
            };
        }
        // get the latest transaction detail
        const subTxn = currentSub.transactions[0];
        if (!subTxn) {
            return {
                isError: true,
                message: "App subscription renewal error, previous transaction record not found",
                status: 404,
            };
        }
        // get plan package
        const plan = currentSub.plan;
        // get user
        const user = currentSub.user;
        // sync user redis and prisma wallet
        yield (0, games_1.syncUserRedisWalletToPrisma)(user.id);
        // get user wallet
        const wallet = yield db_1.default.wallet.findFirst({
            where: { userId: user.id },
        });
        if (!wallet) {
            return {
                message: "App subscription renewal error, cannot retrieve user wallet",
                status: 404,
                isError: true,
            };
        }
        if (wallet.credit < subTxn.amount)
            return {
                message: "App subscription renewal error, insufficient balance!",
                status: 400,
                isError: true,
            };
        // debit user wallet credit and credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // debit user wallet credit
            const userWallet = yield tx.wallet.update({
                where: { userId: user.id },
                data: {
                    isLocked: true,
                    credit: { decrement: subTxn.amount },
                },
            });
            // disable current active subscription
            yield tx.subscription.updateMany({
                where: { userId: user.id, status: "ACTIVE" },
                data: { status: "PAUSED" },
            });
            // disable all primary
            yield tx.subscription.updateMany({
                where: { userId: user.id },
                data: { isPrimary: false },
            });
            // update existing subscription
            const startDate = new Date();
            const date = new Date();
            const endDate = currentSub.billingCycle === client_1.BillingCycleEnum.MONTHLY
                ? new Date(date.setMonth(date.getUTCMonth() + 1))
                : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
            // metadata
            const currentSubMeta = currentSub === null || currentSub === void 0 ? void 0 : currentSub.meta;
            const metadata = currentSub.metadata.concat([
                {
                    id: currentSub.id,
                    billingCycle: currentSub.billingCycle,
                    planId: currentSub.planId,
                    startDate: currentSub.startDate,
                    endDate: currentSub.endDate,
                    status: currentSub.status,
                    isPrimary: currentSub.isPrimary,
                    tierId: currentSubMeta === null || currentSubMeta === void 0 ? void 0 : currentSubMeta.tierId,
                    meta: currentSub.meta,
                },
            ]);
            // update existing subscription
            const updatedSub = yield tx.subscription.update({
                where: { id: currentSub.id },
                data: {
                    planId: currentSub.planId,
                    billingCycle: currentSub.billingCycle,
                    isRecurring: currentSub.isRecurring,
                    startDate,
                    endDate,
                    status: "ACTIVE",
                    isPrimary: true,
                    metadata,
                    meta: currentSub.meta,
                },
            });
            const tier = plan.tier.find((t) => t.id === (currentSubMeta === null || currentSubMeta === void 0 ? void 0 : currentSubMeta.tierId));
            const planName = tier ? `${plan.name} ~ ${tier.name}` : plan.name;
            // save debit transaction record
            yield tx.transaction.create({
                data: {
                    amount: subTxn.amount,
                    currency: subTxn.currency,
                    subPlanId: currentSub.planId,
                    subscriptionId: currentSub === null || currentSub === void 0 ? void 0 : currentSub.id,
                    category: client_1.TxnCategoryEnum.APP_SUBSCRIPTION,
                    description: `Renewed ${currentSub.billingCycle} ${planName} subscription plan for ${subTxn.amount} ${subTxn.currency}.`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.CREDIT,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: user.id,
                    recipientId: user.id,
                    walletId: wallet.id,
                    metadata: subTxn.metadata,
                },
            });
            // update user meta objec
            yield tx.user.update({
                where: { id: user.id },
                data: {
                    meta: {
                        status: "ACTIVE",
                        type: "PRO",
                        color: user.userType === client_1.UserTypeEnum.GOVERNMENT
                            ? "grey"
                            : user.userType === client_1.UserTypeEnum.BUSINESS
                                ? "gold"
                                : "blue",
                    },
                },
            });
            // unlock user wallet credit
            yield tx.wallet.update({
                where: { userId: user.id },
                data: { isLocked: false },
            });
            return { wallet: userWallet, sub: updatedSub };
        }));
        // sync prisma wallet to redis
        (0, helper_1.syncPrismaUserWalletToRedis)(user.id, result.wallet);
        return {
            message: "App subscription renewed successfully",
            status: 200,
            isError: false,
        };
    }
    catch (error) {
        return {
            message: "App subscription renewal failed, ensure you have sufficient wallet balance.",
            status: 500,
            isError: true,
        };
    }
});
exports.renewAppSubscriptionWithWallet = renewAppSubscriptionWithWallet;
const purchaseAppSubscription = (item, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get user
        const user = yield db_1.default.user.findFirst({ where: { id: userId } });
        if (!user)
            return { data: "User not found", status: 400 };
        // get plan package
        const plan = yield db_1.default.subscriptionPlan.findUnique({
            where: { id: item.planId },
        });
        if (!plan)
            return { data: "Error: Invalid subscription plan", status: 400 };
        // debit user wallet credit and credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const result = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            // disable current active subscription
            yield tx.subscription.updateMany({
                where: { userId: user.id, status: "ACTIVE" },
                data: { status: "PAUSED" },
            });
            // disable all primary
            yield tx.subscription.updateMany({
                where: { userId: user.id },
                data: { isPrimary: false },
            });
            // get subscription
            const currentSub = yield db_1.default.subscription.findFirst({
                where: { userId: user.id, planId: item.planId },
            });
            let subscription = undefined;
            // check if user has an active subscription and the plan is different
            if (!currentSub) {
                // create new subscription
                const startDate = new Date();
                const date = new Date();
                const endDate = item.planType === client_1.BillingCycleEnum.MONTHLY
                    ? new Date(date.setMonth(date.getUTCMonth() + 1))
                    : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
                // create new subscription
                subscription = yield tx.subscription.create({
                    data: Object.assign({ userId: user.id, planId: item.planId, billingCycle: item.planType, isRecurring: item.isRecurring, startDate,
                        endDate, status: "ACTIVE", isPrimary: true }, (((_a = item === null || item === void 0 ? void 0 : item.meta) === null || _a === void 0 ? void 0 : _a.tierId) && { meta: { tierId: (_b = item.meta) === null || _b === void 0 ? void 0 : _b.tierId } })),
                });
            }
            else {
                const startDate = new Date();
                const date = new Date();
                const endDate = item.planType === client_1.BillingCycleEnum.MONTHLY
                    ? new Date(date.setMonth(date.getUTCMonth() + 1))
                    : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
                // update meta
                const metadata = currentSub.metadata.concat([
                    {
                        id: currentSub.id,
                        billingCycle: currentSub.billingCycle,
                        planId: currentSub.planId,
                        startDate: currentSub.startDate,
                        endDate: currentSub.endDate,
                        status: currentSub.status,
                        isPrimary: currentSub.isPrimary,
                        tierId: (_c = item.meta) === null || _c === void 0 ? void 0 : _c.tierId,
                        meta: currentSub.meta,
                    },
                ]);
                // update existing subscription
                subscription = yield tx.subscription.update({
                    where: { id: currentSub.id },
                    data: Object.assign({ planId: item.planId, billingCycle: item.planType, isRecurring: item.isRecurring, startDate,
                        endDate, status: "ACTIVE", isPrimary: true, metadata }, (((_d = item === null || item === void 0 ? void 0 : item.meta) === null || _d === void 0 ? void 0 : _d.tierId) && { meta: { tierId: (_e = item.meta) === null || _e === void 0 ? void 0 : _e.tierId } })),
                });
            }
            // save debit transaction record
            yield tx.transaction.create({
                data: {
                    amount: item.amount,
                    currency: item.currency,
                    subPlanId: item.planId,
                    subscriptionId: subscription === null || subscription === void 0 ? void 0 : subscription.id,
                    category: client_1.TxnCategoryEnum.APP_SUBSCRIPTION,
                    description: `Purchased ${item.planType} ${item.planName} subscription plan for ${item.amount} ${item.currency}.`,
                    gateway: item.gateway,
                    source: item.source,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    exTxnRef: (_g = (_f = item === null || item === void 0 ? void 0 : item.meta) === null || _f === void 0 ? void 0 : _f.botTxnRef) !== null && _g !== void 0 ? _g : (_h = item === null || item === void 0 ? void 0 : item.meta) === null || _h === void 0 ? void 0 : _h.txnRef,
                    txnRef,
                    userId: user.id,
                    senderId: user.id,
                    metadata: Object.assign({}, item.meta),
                },
            });
            // update user meta objec
            yield tx.user.update({
                where: { id: user.id },
                data: {
                    meta: {
                        status: "ACTIVE",
                        type: "PRO",
                        color: user.userType === client_1.UserTypeEnum.GOVERNMENT
                            ? "grey"
                            : user.userType === client_1.UserTypeEnum.BUSINESS
                                ? "gold"
                                : "blue",
                    },
                },
            });
            return { subscription };
        }));
        // remove subscription cron job if payment method has changed
        (0, utils_2.removeSubscriptionCronJob)({ userId: user.id, subId: result.subscription.id });
        return { data: item, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.purchaseAppSubscription = purchaseAppSubscription;
const cancelAppSubscription = (arg) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sub = yield db_1.default.subscription.findFirst({
            where: { id: arg.subId },
            include: { user: true },
        });
        if (!sub)
            return { data: "Subscription not found", status: 404 };
        // get user
        if (!sub.user)
            return { data: "User not found", status: 404 };
        const user = sub.user;
        // get color
        const color = user.accountVerified && user.userType === client_1.UserTypeEnum.GOVERNMENT
            ? "grey"
            : user.accountVerified && user.userType === client_1.UserTypeEnum.BUSINESS
                ? "gold"
                : "blue";
        const result = yield db_1.default.$transaction([
            db_1.default.subscription.update({
                where: { id: arg.subId, userId: user.id },
                data: { status: arg.status },
            }),
            db_1.default.user.update({
                where: { id: user.id },
                data: {
                    meta: {
                        color,
                        status: user.accountVerified ? "ACTIVE" : "INACTIVE",
                        type: "LEGACY",
                    },
                },
            }),
        ]);
        // remove subscription cron job if subscription is cancelled
        (0, utils_2.removeSubscriptionCronJob)({ userId: user.id, subId: arg.subId });
        return { data: result, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to process request, please try again later",
            status: 500,
        };
    }
});
exports.cancelAppSubscription = cancelAppSubscription;
const renewTmaAppSubscription = (item, userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get user
        const user = yield db_1.default.user.findFirst({ where: { id: userId } });
        if (!user)
            return { data: "User not found", status: 400 };
        const txnRef = (0, utils_1.generateUniqueRef)();
        yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            // check if subscription exists
            const currentSub = yield db_1.default.subscription.findFirst({
                where: { userId: user.id, id: item.subId },
                include: { plan: true },
            });
            if (!currentSub)
                return;
            // sub plan
            const plan = currentSub.plan;
            // disable current active subscription
            yield tx.subscription.updateMany({
                where: { userId: user.id, status: "ACTIVE" },
                data: { status: "PAUSED" },
            });
            // disable all primary
            yield tx.subscription.updateMany({
                where: { userId: user.id },
                data: { isPrimary: false },
            });
            // check if user has an active subscription and the plan is different
            const startDate = new Date();
            const date = new Date();
            const endDate = currentSub.billingCycle === client_1.BillingCycleEnum.MONTHLY
                ? new Date(date.setMonth(date.getUTCMonth() + 1))
                : new Date(date.setUTCFullYear(date.getUTCFullYear() + 1));
            // update meta
            const currentSubMeta = currentSub.meta;
            const metadata = currentSub.metadata.concat([
                {
                    id: currentSub.id,
                    billingCycle: currentSub.billingCycle,
                    planId: currentSub.planId,
                    startDate: currentSub.startDate,
                    endDate: currentSub.endDate,
                    status: currentSub.status,
                    isPrimary: currentSub.isPrimary,
                    tierId: currentSubMeta === null || currentSubMeta === void 0 ? void 0 : currentSubMeta.tierId,
                    meta: currentSub.meta,
                },
            ]);
            // update existing subscription
            const subscription = yield tx.subscription.update({
                where: { id: currentSub.id },
                data: {
                    startDate,
                    endDate,
                    status: "ACTIVE",
                    isPrimary: true,
                    metadata,
                },
            });
            // get the renewed subscription transaction
            const renewedTxn = yield tx.transaction.findFirst({
                where: { id: item.txnId },
            });
            if (renewedTxn) {
                const tier = plan.tier.find((t) => t.id === (currentSubMeta === null || currentSubMeta === void 0 ? void 0 : currentSubMeta.tierId));
                const planName = tier ? `${plan.name} ~ ${tier.name}` : plan.name;
                // save debit transaction record
                yield tx.transaction.create({
                    data: {
                        amount: renewedTxn.amount,
                        currency: renewedTxn.currency,
                        subPlanId: renewedTxn.subPlanId,
                        subscriptionId: subscription === null || subscription === void 0 ? void 0 : subscription.id,
                        category: client_1.TxnCategoryEnum.APP_SUBSCRIPTION,
                        description: `Renewed ${currentSub.billingCycle} ${planName} subscription plan for ${renewedTxn.amount} ${renewedTxn.currency}.`,
                        gateway: renewedTxn.gateway,
                        source: renewedTxn.source,
                        type: client_1.TxnTypeEnum.DEBIT,
                        status: client_1.TxnStatusEnum.COMPLETED,
                        txnRef,
                        exTxnRef: item.botTxnRef,
                        userId: user.id,
                        senderId: user.id,
                        metadata: Object.assign({ item }, item.meta),
                    },
                });
            }
            // update user meta object if meta status is not active
            if (((_a = user.meta) === null || _a === void 0 ? void 0 : _a.status) === "INACTIVE") {
                yield tx.user.update({
                    where: { id: user.id },
                    data: {
                        meta: Object.assign(Object.assign({}, user.meta), { status: "ACTIVE" }),
                    },
                });
            }
        }));
        return { data: item, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.renewTmaAppSubscription = renewTmaAppSubscription;
