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
exports.purchaseCoinsController = exports.getCoinsController = exports.getTmaPaymentInvoiceController = void 0;
const _types_1 = require("@/@types");
const coins_1 = require("@/services/v1/coins");
const utils_1 = require("@/utils");
const schema_1 = require("@/schema");
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const getTmaPaymentInvoiceController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    console.log(req.body);
    const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.TmaInvoiceZodSchema);
    const zodData = zodResult.data;
    console.log(zodData);
    if (!zodData)
        return res.status(400).send(zodResult.message);
    // handle telegram stars
    if (zodData.gateway === _types_1.TmaPaymentGateway.STARS) {
        const result = yield (0, coins_1.getStarsCoinsInvoice)(zodData, user);
        return res.status(result.status).send(result.data);
    }
    // handle tma smart glocal & unlimint payment invoice generator
    const result = yield (0, coins_1.getTmaPaymentCoinsInvoice)(Object.assign(Object.assign({}, zodData), { providerToken: zodData.gateway === "SMART_GLOCAL" ? config_1.smartGlocalApiKey : config_1.unlimintApiKey }), user);
    return res.status(result.status).send(result.data);
});
exports.getTmaPaymentInvoiceController = getTmaPaymentInvoiceController;
const getCoinsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, coins_1.getCoinPackages)();
    return res.status(result.status).send(result.data);
});
exports.getCoinsController = getCoinsController;
const purchaseCoinsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log("payload ", req.body);
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.purchaseCoinsZodSchema);
        if (!zodResult.data) {
            return res
                .status(400)
                .send("Invalid txn payload received, please contact support");
        }
        const payload = zodResult.data;
        const user = req.user;
        if (payload.currency === client_1.TxnCurrencyEnum.TZX) {
            const result = yield (0, coins_1.purchaseCoinsWithWallet)({
                id: payload.packageId,
                currency: payload.currency,
                meta: payload.meta
            }, user);
            return res.status(result.status).send(result.data);
        }
        // purchase with stars or TON or Fiat or USD or NGN
        const result = yield (0, coins_1.purchaseCoinsWithToken)({
            id: payload.packageId,
            currency: payload.currency,
            gateway: (_a = payload === null || payload === void 0 ? void 0 : payload.meta) === null || _a === void 0 ? void 0 : _a.gateway,
            source: (_b = payload === null || payload === void 0 ? void 0 : payload.meta) === null || _b === void 0 ? void 0 : _b.source,
            meta: payload.meta,
        }, user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Sorry an error occurred trying to process transaction, please try again later!");
    }
});
exports.purchaseCoinsController = purchaseCoinsController;
