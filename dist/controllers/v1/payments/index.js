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
exports.syncFlwSubscriptionPlansController = exports.verifyFlwPaymentController = exports.getPaymentLinkController = void 0;
const schema_1 = require("@/schema");
const coins_1 = require("@/services/v1/coins");
const payments_1 = require("@/services/v1/payments");
const subscriptions_1 = require("@/services/v1/subscriptions");
const _types_1 = require("@/@types");
const utils_1 = require("@/utils");
const html_1 = require("@/utils/html");
const getPaymentLinkController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.FlutterwaveConfigZodSchema);
        const config = zodResult.data;
        if (!config) {
            return res.status(400).send(zodResult.message);
        }
        const result = yield (0, payments_1.generateFlutterwavePaymentLink)(config);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(400).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.getPaymentLinkController = getPaymentLinkController;
const verifyFlwPaymentController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const isPOST = req.method === "POST";
    try {
        const payload = isPOST ? req.body : req.query;
        const zodResult = (0, utils_1.validateZodInput)(payload, schema_1.VerifyFlwPaymentZodSchema);
        const query = zodResult.data;
        if (!query) {
            return res.status(400).send(isPOST ? zodResult.message : (0, html_1.getHtmlText)(false, zodResult.message));
        }
        const result = yield (0, payments_1.verifyFlutterwavePayment)(query);
        if (result.status !== 200 || !result.data) {
            return res.status(result.status).send(isPOST ? result.message : (0, html_1.getHtmlText)(false, result.message));
        }
        // check if the payment is for coin purchase
        const coinPayload = result.data;
        if (coinPayload.meta.type === _types_1.FlutterwaveTxnType.COIN_PACKAGE) {
            const result2 = yield (0, coins_1.purchaseCoinsWithFlutterwave)(coinPayload);
            const isSuccess = result2.status === 200;
            const msg = !isSuccess ? String(result2.data) : isPOST ? "Wallet credited" : "Transaction verified successfully and your wallet is credited respectively!";
            return res.status(result2.status).send(isPOST ? msg : (0, html_1.getHtmlText)(isSuccess, msg));
        }
        // handle subscription payment
        const subPayload = result.data;
        const result2 = yield (0, subscriptions_1.purchaseAppSubscription)(subPayload, subPayload.meta.userId);
        const isSuccess = result2.status === 200;
        const msg = !isSuccess ? String(result2.data) : isPOST ? "Subscription confirmed" : "Transaction verified successfully and your subscription is confirmed!";
        return res.status(result2.status).send(isPOST ? msg : (0, html_1.getHtmlText)(isSuccess, msg));
    }
    catch (error) {
        return res.status(400).send(isPOST ? error === null || error === void 0 ? void 0 : error.message : (0, html_1.getHtmlText)(false, error === null || error === void 0 ? void 0 : error.message));
    }
});
exports.verifyFlwPaymentController = verifyFlwPaymentController;
const syncFlwSubscriptionPlansController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, payments_1.syncFlwSubscriptionPlans)();
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.syncFlwSubscriptionPlansController = syncFlwSubscriptionPlansController;
