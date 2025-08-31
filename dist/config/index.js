"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepSeekAi = exports.openai = exports.axiosXAI = exports.imagekitAppName = exports.webpushConfig = exports.encrytionKey = exports.jwtKey = exports.unlimintApiKey = exports.smartGlocalApiKey = exports.flutterwaveEncryptKey = exports.flutterwaveSecretKey = exports.flutterwavePublicKey = exports.flutterwaveApiUrl = exports.telegramBotWebhookUrl = exports.telegramBotUrl = exports.telegramBotAppUrl = exports.telegramBotToken = exports.tonWalletMnemonic = exports.tonAPIEndpoint = exports.appName = void 0;
const axios_1 = __importDefault(require("axios"));
const openai_1 = __importDefault(require("openai"));
exports.appName = String(process.env.APP_NAME);
exports.tonAPIEndpoint = String(process.env.TON_API_ENDPOINT);
exports.tonWalletMnemonic = String(process.env.TONKEEPER_MNEMONIC);
exports.telegramBotToken = String(process.env.TELEGRAM_BOT_API_KEY);
exports.telegramBotAppUrl = String(process.env.TELEGRAM_BOT_APP_URL);
exports.telegramBotUrl = String(process.env.TELEGRAM_BOT);
exports.telegramBotWebhookUrl = String(process.env.TELEGRAM_BOT_WEBHOOK_URL);
// flutterwave keys
exports.flutterwaveApiUrl = String(process.env.FLUTTERWAVE_API_URL);
exports.flutterwavePublicKey = String(process.env.FLUTTERWAVE_PUBK);
exports.flutterwaveSecretKey = String(process.env.FLUTTERWAVE_SECK);
exports.flutterwaveEncryptKey = String(process.env.FLUTTERWAVE_ENCK);
// smart glocal api key
exports.smartGlocalApiKey = String(process.env.SMART_GLOCAL_API_KEY);
exports.unlimintApiKey = String(process.env.UNLIMINT_API_KEY);
// jwt keys
exports.jwtKey = String(process.env.JWT_SECRET);
exports.encrytionKey = String(process.env.ENCRYPTION_KEY);
exports.webpushConfig = {
    email: process.env.VAPID_EMAIL,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
};
// image kit
exports.imagekitAppName = String(process.env.NODE_ENV !== "production"
    ? process.env.IMAGEKIT_APP_NAME_DEV
    : process.env.IMAGEKIT_APP_NAME);
exports.axiosXAI = axios_1.default.create({
    baseURL: process.env.XAI_BASE_URL,
    headers: {
        Authorization: "Bearer " + process.env.XAI_API_KEY,
    },
});
exports.openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
    project: process.env.OPENAI_PROJECT_ID,
    organization: process.env.OPENAI_ORG_ID,
});
exports.deepSeekAi = new openai_1.default({
    baseURL: process.env.DEEP_SEEK_BASE_URL,
    apiKey: process.env.DEEP_SEEK_API_KEY,
});
