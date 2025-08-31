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
exports.telegramBot = void 0;
// import { Bot } from "grammy";
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const config_1 = require("@/config");
class MyTelegramBot extends node_telegram_bot_api_1.default {
    /**
     * Creates an invoice link for a Telegram payment.
     *
     * @param params - The parameters for creating the invoice link.
     * @returns The created invoice link.
     *
     * @remarks
     * This function uses the Telegram Bot API to create an invoice link.
     * If the `params` object contains optional parameters, they will be included in the invoice link.
     * If the `params` object contains any null or undefined values, they will be filtered out.
     *
     * @example
     * ```typescript
     * const params: CreateInvoiceParams = {
     *   title: 'Product',
     *   description: 'Description of the product',
     *   payload: 'unique_payload',
     *   provider_token: 'your_provider_token',
     *   currency: 'USD',
     *   prices: [{ label: 'Product', amount: 100 }],
     *   need_name: true,
     * };
     *
     * const invoiceLink = telegramBot.createInvoiceLink(params);
     * console.log(invoiceLink);
     * ```
     */
    createInvoiceLink(params) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const entries = Object.entries(params).map(([key, value]) => key === "prices" ? [key, JSON.stringify(value)] : [key, value]);
                const filteredParams = Object.fromEntries(entries.filter(([_key, value]) => value !== null && value !== undefined));
                const searchParams = new URLSearchParams(filteredParams).toString();
                const response = yield fetch(`https://api.telegram.org/bot${config_1.telegramBotToken}/createInvoiceLink?${searchParams}`);
                const res = yield response.json();
                if (!response.ok || !res.ok) {
                    throw new Error((_a = res === null || res === void 0 ? void 0 : res.description) !== null && _a !== void 0 ? _a : response.statusText);
                }
                return res.result;
            }
            catch (error) {
                throw error;
            }
        });
    }
}
exports.telegramBot = new MyTelegramBot(config_1.telegramBotToken, {
    polling: false,
});
// telegramBot.setWebHook(telegramBotWebhookUrl+`/bot${telegramBotToken}`)
// export const telBot = new Bot(telegramBotToken);
