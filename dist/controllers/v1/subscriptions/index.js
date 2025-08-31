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
exports.getSubTmaInvoiceController = exports.cancelSubscriptionController = exports.subscriptionPremiumController = exports.getSubscriptionPlansController = void 0;
const config_1 = require("@/config");
const schema_1 = require("@/schema");
const subscriptions_1 = require("@/services/v1/subscriptions");
const _types_1 = require("@/@types");
const utils_1 = require("@/utils");
const client_1 = require("@prisma/client");
const getSubscriptionPlansController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, subscriptions_1.getPlans)();
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send("Error: Unable to process request, please try again later");
    }
});
exports.getSubscriptionPlansController = getSubscriptionPlansController;
const subscriptionPremiumController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.purchasePremiumZodSchema);
        if (!zodResult.data) {
            return res.status(400).send("Invalid txn payload received, please contact support");
        }
        const payload = zodResult.data;
        const user = req.user;
        if (payload.currency === client_1.TxnCurrencyEnum.TZX) {
            const result = yield (0, subscriptions_1.purchaseAppSubscriptionWithWallet)(payload, user.id);
            return res.status(result.status).send(result.data);
        }
        const result = yield (0, subscriptions_1.purchaseAppSubscription)(payload, user.id);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send("Error: Unable to process request, please try again later");
    }
});
exports.subscriptionPremiumController = subscriptionPremiumController;
const cancelSubscriptionController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.IDZodSchema);
        if (!zodResult.data) {
            return res.status(400).send("Invalid txn payload received, please contact support");
        }
        const payload = zodResult.data;
        const user = req.user;
        const result = yield (0, subscriptions_1.cancelAppSubscription)({ status: client_1.SubStatusEnum.CANCELLED, subId: payload.id });
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send('Error: Unable to process request, please try again later');
    }
});
exports.cancelSubscriptionController = cancelSubscriptionController;
const getSubTmaInvoiceController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.TmaSubscriptionInvoiceZodSchema);
    const zodData = zodResult.data;
    if (!zodData)
        return res.status(400).send(zodResult.message);
    console.log("Tma Invoice: ", zodData);
    // generate invoice
    const providerToken = zodData.gateway === _types_1.TmaPaymentGateway.SMART_GLOCAL ? config_1.smartGlocalApiKey : zodData.gateway === _types_1.TmaPaymentGateway.UNLIMINT ? config_1.unlimintApiKey : "";
    const result = yield (0, subscriptions_1.genTmaSubscriptionInvoice)(Object.assign(Object.assign({}, zodData), { providerToken }), user);
    return res.status(result.status).send(result.data);
});
exports.getSubTmaInvoiceController = getSubTmaInvoiceController;
