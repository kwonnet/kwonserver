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
exports.purchaseCoinsWithFlutterwave = exports.purchaseCoinsWithToken = exports.purchaseCoinsWithWallet = exports.saveTxnLog = exports.getTmaPaymentCoinsInvoice = exports.getStarsCoinsInvoice = exports.getCoinPackages = void 0;
const db_1 = __importDefault(require("@/db"));
const telegram_bot_1 = require("@/telegram-bot");
const client_1 = require("@prisma/client");
const helper_1 = require("../../helper");
const utils_1 = require("@/utils");
const payment_1 = require("@/utils/payment");
const getCoinPackages = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const packages = yield db_1.default.coinPackage.findMany();
        const cryptoAddresses = yield db_1.default.cryptoAddress.findMany();
        return {
            data: {
                packages,
                addresses: cryptoAddresses.map((item) => ({
                    id: item.id,
                    address: item.address,
                    rate: item.rate,
                    name: item.name,
                })),
            },
            status: 200,
        };
    }
    catch (error) {
        return { data: "Error: Failed to fetch packages", status: 500 };
    }
});
exports.getCoinPackages = getCoinPackages;
const getStarsCoinsInvoice = (arg, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const item = yield db_1.default.coinPackage.findFirst({ where: { id: arg.id } });
        if (!item)
            return { status: 400, data: "Invalid coin package sent" };
        const desc = item.bonus > 0
            ? `Buy ${item.amount} +${item.bonus} bonus coins for ${item.price} stars`
            : `Buy ${item.amount} coins for ${item.price} stars`;
        const invoiceLink = yield telegram_bot_1.telegramBot.createInvoiceLink({
            title: item.name,
            description: desc,
            currency: client_1.TxnCurrencyEnum.XTR,
            payload: `coin_${user.id}_tx_${arg.botTxnRef}`,
            prices: [{ amount: item.price, label: item.name }],
            provider_token: "",
        });
        return { data: invoiceLink, status: 200 };
    }
    catch (error) {
        return { data: `Error occurred: ${error === null || error === void 0 ? void 0 : error.message}`, status: 500 };
    }
});
exports.getStarsCoinsInvoice = getStarsCoinsInvoice;
const getTmaPaymentCoinsInvoice = (arg, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const item = yield db_1.default.coinPackage.findFirst({ where: { id: arg.id } });
        if (!item)
            return { status: 400, data: "Invalid coin package sent" };
        const dollarAmount = (0, payment_1.get_tzx_usd_rate)(item.price);
        const desc = item.bonus > 0
            ? `Buy ${item.amount} coins +${item.bonus} bonus for ${dollarAmount} USD`
            : `Buy ${item.amount} coins for ${dollarAmount} USD`;
        const invoiceLink = yield telegram_bot_1.telegramBot.createInvoiceLink({
            title: item.name,
            description: desc,
            currency: client_1.TxnCurrencyEnum.USD,
            payload: `coin_${user.id}_tx_${arg.botTxnRef}`,
            prices: [{ amount: dollarAmount * 100, label: item.name }],
            provider_token: arg.providerToken,
            // need_phone_number: true,
            // send_phone_number_to_provider: true,
            need_email: true,
            send_email_to_provider: true,
            // is_flexible: true,
        });
        return { data: invoiceLink, status: 200 };
    }
    catch (error) {
        return { data: `Error occurred: ${error === null || error === void 0 ? void 0 : error.message}`, status: 500 };
    }
});
exports.getTmaPaymentCoinsInvoice = getTmaPaymentCoinsInvoice;
const saveTxnLog = (item, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.transactionLogs.create({ data: { userId: user.id, coinPackageId: item.id, meta: Object.assign({ currency: item.currency, coinId: item.id }, item.meta) } });
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: `Error occurred: ${error === null || error === void 0 ? void 0 : error.message}`, status: 500 };
    }
});
exports.saveTxnLog = saveTxnLog;
const purchaseCoinsWithWallet = (item, user) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get coin package
        const coin = yield db_1.default.coinPackage.findUnique({
            where: { id: item.id },
        });
        if (!coin)
            return { data: "Error: Invalid coin package", status: 400 };
        // sync user redis wallet to prisma
        yield (0, helper_1.syncRedisUserWalletToPrisma)(user.id);
        // get user wallet
        const wallet = yield db_1.default.wallet.findFirst({
            where: { userId: user.id },
        });
        if (!wallet)
            return { data: "Cannot retrieve user wallet", status: 400 };
        if (wallet.isLocked)
            return { data: "User wallet not available at the moment", status: 400 };
        if (wallet.credit < coin.price)
            return {
                data: "Insufficient balance to pay for this package, please try another one!",
                status: 400,
            };
        // temporarily lock user wallet until this txn is processed
        yield db_1.default.wallet.update({
            where: { userId: user.id },
            data: { isLocked: true },
        });
        // debit user wallet credit and credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [updatedWallet] = yield db_1.default.$transaction([
            // debit wallet credit & credit wallet amount
            db_1.default.wallet.update({
                where: { userId: user.id },
                data: {
                    isLocked: false,
                    credit: { decrement: coin.price },
                    coins: { increment: coin.amount },
                    bonus: { increment: coin.bonus },
                },
            }),
            // save debit transaction record
            db_1.default.transaction.create({
                data: {
                    amount: coin.price,
                    currency: item.currency,
                    coinPackageId: coin.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Charged ${coin.price} ${item.currency} from your wallet credit for the purchase of ${coin.name} coin package ~ ${coin.amount} coins ${coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""}.`,
                    gateway: client_1.TxnGatewayEnum.WALLET,
                    source: client_1.TxnSourceEnum.CREDIT,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: user.id,
                    senderId: user.id,
                    walletId: wallet.id,
                    metadata: { item: coin, meta: item.meta },
                },
            }),
            // save credit transaction
            db_1.default.transaction.create({
                data: {
                    amount: coin.amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    coinPackageId: coin.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Purchased ${coin.name} coin package ~ ${coin.amount} coins ${coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""} for ${coin.price} ${item.currency} using your wallet credit.`,
                    gateway: client_1.TxnGatewayEnum.VIRTUAL,
                    source: client_1.TxnSourceEnum.CREDIT,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    userId: user.id,
                    recipientId: user.id,
                    walletId: wallet.id,
                    metadata: { item: coin, meta: { currency: item.currency } },
                },
            }),
        ]);
        // update redis user wallet
        // sync redis user wallet
        (0, helper_1.syncPrismaUserWalletToRedis)(user.id, updatedWallet);
        return { data: updatedWallet, status: 200 };
    }
    catch (error) {
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.purchaseCoinsWithWallet = purchaseCoinsWithWallet;
const purchaseCoinsWithToken = (item, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // get coin package
        const coin = yield db_1.default.coinPackage.findUnique({
            where: { id: item.id },
        });
        // return error if not found
        if (!coin)
            return { data: "Error: Invalid coin package", status: 400 };
        // get user wallet
        const wallet = yield db_1.default.wallet.findFirst({
            where: { userId: user.id },
        });
        if (!wallet)
            return { data: "Cannot retrieve user wallet", status: 400 };
        // sync user redis wallet to prisma
        yield (0, helper_1.syncRedisUserWalletToPrisma)(user.id);
        // temporarily lock user wallet until this txn is processed
        yield db_1.default.wallet.update({
            where: { userId: user.id },
            data: { isLocked: true },
        });
        // credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [updatedWallet] = yield db_1.default.$transaction([
            // debit wallet credit & credit wallet amount
            db_1.default.wallet.update({
                where: { userId: user.id },
                data: {
                    isLocked: false,
                    coins: { increment: coin.amount },
                    bonus: { increment: coin.bonus },
                },
            }),
            // save debit transaction record
            db_1.default.transaction.create({
                data: {
                    amount: item.meta.amount,
                    currency: item.currency,
                    coinPackageId: coin.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Charged ${item.meta.amount} ${item.currency} for the purchase of ${coin.name} coin package ~ ${coin.amount} coins ${coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""}.`,
                    gateway: item.gateway,
                    source: item.source,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    exTxnRef: (_a = item === null || item === void 0 ? void 0 : item.meta) === null || _a === void 0 ? void 0 : _a.botTxnRef,
                    userId: user.id,
                    senderId: user.id,
                    walletId: wallet.id,
                    metadata: { item: coin, meta: item.meta },
                },
            }),
            // save credit transaction
            db_1.default.transaction.create({
                data: {
                    amount: coin.amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    coinPackageId: coin.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Purchased ${coin.name} coin package ~ ${coin.amount} coins ${coin.bonus > 0 ? `+ ${coin.bonus} bonus` : ""} for ${item.meta.amount} ${item.currency}.`,
                    gateway: item.gateway,
                    source: item.source,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    exTxnRef: (_b = item === null || item === void 0 ? void 0 : item.meta) === null || _b === void 0 ? void 0 : _b.botTxnRef,
                    userId: user.id,
                    recipientId: user.id,
                    walletId: wallet.id,
                    metadata: { item: coin, meta: item.meta },
                },
            }),
        ]);
        // sync redis user wallet
        (0, helper_1.syncPrismaUserWalletToRedis)(user.id, updatedWallet);
        return { data: updatedWallet, status: 200 };
    }
    catch (error) {
        // unlock wallet
        yield db_1.default.wallet.update({
            where: { userId: user.id },
            data: { isLocked: true },
        });
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.purchaseCoinsWithToken = purchaseCoinsWithToken;
const purchaseCoinsWithFlutterwave = (item) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("PurchaseCoinsWithFlutterwave ", item);
        const userId = item.userId;
        // check if user exists
        const userExists = yield db_1.default.user.findFirst({ where: { id: userId } });
        if (!userExists)
            return { data: "User not found", status: 404 };
        // check coin package exists
        const coinExists = yield db_1.default.coinPackage.findUnique({
            where: { id: item.id },
        });
        // return error if not found
        if (!coinExists)
            return { data: "Error: Invalid coin package", status: 400 };
        // get user wallet
        const wallet = yield db_1.default.wallet.findFirst({
            where: { userId },
        });
        if (!wallet)
            return { data: "Cannot retrieve user wallet", status: 400 };
        // sync user redis wallet to prisma
        yield (0, helper_1.syncRedisUserWalletToPrisma)(userId);
        // temporarily lock user wallet until this txn is processed
        yield db_1.default.wallet.update({
            where: { userId },
            data: { isLocked: true },
        });
        // credit user wallet amount and save transaction records
        const txnRef = (0, utils_1.generateUniqueRef)();
        const [updatedWallet] = yield db_1.default.$transaction([
            // debit wallet credit & credit wallet amount
            db_1.default.wallet.update({
                where: { userId },
                data: {
                    isLocked: false,
                    coins: { increment: item.coin.amount },
                    bonus: { increment: item.coin.bonus },
                },
            }),
            // save DEBIT transaction
            db_1.default.transaction.create({
                data: {
                    amount: item.meta.txn.amount,
                    currency: item.meta.currency,
                    coinPackageId: item.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Charged ${item.meta.txn.amount} ${item.meta.currency} for the purchase of ${item.coin.name} coin package ~ ${item.coin.amount} coins ${item.coin.bonus > 0 ? `+ ${item.coin.bonus} bonus` : ""}.`,
                    gateway: item.gateway,
                    source: item.source,
                    type: client_1.TxnTypeEnum.DEBIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    exTxnRef: item.txnRef,
                    userId,
                    recipientId: userId,
                    walletId: wallet.id,
                    metadata: { item: item.coin, meta: item.meta },
                },
            }),
            // save credit transaction
            db_1.default.transaction.create({
                data: {
                    amount: item.coin.amount,
                    currency: client_1.TxnCurrencyEnum.COINS,
                    coinPackageId: item.coin.id,
                    category: client_1.TxnCategoryEnum.COIN_PURCHASE,
                    description: `Purchased ${item.coin.name} coin package ~ ${item.coin.amount} coins ${item.coin.bonus > 0 ? `+ ${item.coin.bonus} bonus` : ""} for ${item.meta.txn.amount} ${item.currency}.`,
                    gateway: item.gateway,
                    source: item.source,
                    type: client_1.TxnTypeEnum.CREDIT,
                    status: client_1.TxnStatusEnum.COMPLETED,
                    txnRef,
                    exTxnRef: item === null || item === void 0 ? void 0 : item.txnRef,
                    userId: item.userId,
                    recipientId: item.userId,
                    walletId: wallet.id,
                    metadata: { item: item.coin, meta: item.meta },
                },
            }),
        ]);
        // sync redis user wallet
        (0, helper_1.syncPrismaUserWalletToRedis)(userId, updatedWallet);
        return { data: updatedWallet, status: 200 };
    }
    catch (error) {
        // unlock user wallet
        yield db_1.default.wallet.update({
            where: { userId: item.userId },
            data: { isLocked: false },
        });
        return {
            data: "Error: Failed to process transaction, please contact support",
            status: 500,
        };
    }
});
exports.purchaseCoinsWithFlutterwave = purchaseCoinsWithFlutterwave;
