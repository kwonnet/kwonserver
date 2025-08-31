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
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimDailyTaskController = exports.claimDailyBonusController = exports.getTxnHistoryController = exports.fundCoinsController = exports.withdrawCoinsController = exports.transferCoinsController = exports.getUserCoinsWalletController = exports.saveUserWalletAddressController = exports.getProofTokenController = void 0;
const utils_1 = require("@/utils");
const config_1 = require("@/config");
const schema_1 = require("@/schema");
const wallets_1 = require("@/services/v1/wallets");
const getProofTokenController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const token = (0, utils_1.encryptString)(JSON.stringify({}), 
    // JSON.stringify(`${user.id}_${user.telId}`),
    config_1.encrytionKey);
    const jwtToken = (0, utils_1.jwtSign)({ proof: token }, { expiresIn: "10m" });
    return res.status(200).send(jwtToken);
});
exports.getProofTokenController = getProofTokenController;
const saveUserWalletAddressController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.UserWalletAddressZodSchema);
        if (!zodResult.data)
            return res.status(400).send(zodResult.message);
        const _a = zodResult.data, { token } = _a, rest = __rest(_a, ["token"]);
        const jwtData = (0, utils_1.jwtVerify)(token);
        const clientProof = (0, utils_1.decryptString)(jwtData.proof, config_1.encrytionKey);
        const serverProof = `${user.id}`; //`${user.id}_${user.telId}`;
        if (clientProof !== serverProof)
            return res
                .status(400)
                .send("Invalid proof token, please disconnect your wallet and reconnect again");
        // save user wallet address
        const result = yield (0, wallets_1.saveUserWalletAddress)(rest, user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        console.log(error === null || error === void 0 ? void 0 : error.message);
        return res
            .status(500)
            .send("Error: Please disconnect your wallet, close the app and try again");
    }
});
exports.saveUserWalletAddressController = saveUserWalletAddressController;
const getUserCoinsWalletController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const result = yield (0, wallets_1.getUserCoinsWallet)(String((_a = req.user) === null || _a === void 0 ? void 0 : _a.id));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res.status(500).send("Error: Failed to get wallet details: ");
    }
});
exports.getUserCoinsWalletController = getUserCoinsWalletController;
const transferCoinsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.TransferCoinsZodSchema);
    if (!zodResult.data)
        return res.status(400).send(zodResult.message);
    try {
        const result = yield (0, wallets_1.transferCoins)(zodResult.data);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.transferCoinsController = transferCoinsController;
const withdrawCoinsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const zodResult = (0, utils_1.validateZodInput)(Object.assign(Object.assign({}, req.body), { userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id }), schema_1.WithdrawCoinsZodSchema);
    const zodData = zodResult.data;
    if (!zodData)
        return res.status(400).send(zodResult.message);
    try {
        const result = yield (0, wallets_1.withdrawCoins)(zodData);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.withdrawCoinsController = withdrawCoinsController;
const fundCoinsController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.FundCoinsZodSchema);
    const zodData = zodResult.data;
    if (!zodData)
        return res.status(400).send(zodResult.message);
    if (zodData.amount < 1 && zodData.bonus < 1)
        return res.status(400).send("Amount or bonus must be greater than zero");
    try {
        const result = yield (0, wallets_1.fundCoins)(zodData, user);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.fundCoinsController = fundCoinsController;
const getTxnHistoryController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;
    const zodResult = (0, utils_1.validateZodInput)({ userId: user.id, page, limit }, schema_1.PaginateZodSchema);
    const zodData = zodResult.data;
    if (!zodData)
        return res.status(400).send(zodResult.message);
    try {
        const result = yield (0, wallets_1.getTxnHistory)(zodData);
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.getTxnHistoryController = getTxnHistoryController;
const claimDailyBonusController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    console.log(req.body);
    const zodResult = (0, utils_1.validateZodInput)(Object.assign({ userId: user.id }, req.body), schema_1.DailyBonusZodSchema);
    const zodData = zodResult.data;
    console.log(zodData);
    if (!zodData)
        return res.status(400).send(zodResult.message);
    if (zodData.amount >= 11)
        return res.status(400).send("Bonus amount is illegal");
    try {
        const result = yield (0, wallets_1.updateWalletBonus)(Object.assign(Object.assign({}, zodData), { isTask: false }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.claimDailyBonusController = claimDailyBonusController;
const claimDailyTaskController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const zodResult = (0, utils_1.validateZodInput)(req.body, schema_1.DailyTaskZodSchema);
    const zodData = zodResult.data;
    if (!zodData)
        return res.status(400).send(zodResult.message);
    try {
        const result = yield (0, wallets_1.rewardDailyTask)(Object.assign(Object.assign({}, zodData), { userId: user.id }));
        return res.status(result.status).send(result.data);
    }
    catch (error) {
        return res
            .status(500)
            .send("Error: Failed to process request, please try again later");
    }
});
exports.claimDailyTaskController = claimDailyTaskController;
