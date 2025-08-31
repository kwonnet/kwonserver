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
exports.telegramBotListener = void 0;
const url_1 = require("url");
const telegram_bot_1 = require("@/telegram-bot");
const db_1 = __importDefault(require("@/db"));
const config_1 = require("@/config");
const subscriptions_1 = require("../v1/subscriptions");
const communityLinks = [
    {
        text: "Youtube",
        url: "https://www.youtube.com/channel/UCioyt3gyh09-ZeDLIlYhhQw"
    },
    {
        text: "X - Twitter",
        url: "https://x.com/@torazone213"
    },
    {
        text: "Tiktok",
        url: "https://tiktok.com/@torazone213"
    },
    {
        text: "Instagram",
        url: "https://instagram.com"
    },
    {
        text: "Torazone",
        url: "https://torazone.com"
    },
    {
        text: "Our Community",
        url: "https://t.me"
    },
    {
        text: "Play Game",
        url: config_1.telegramBotAppUrl
    },
];
const getAppLink = (refId) => {
    return refId
        ? `${config_1.telegramBotAppUrl}?startapp=${refId}`
        : config_1.telegramBotAppUrl;
};
const getShareLink = (refId) => {
    const baseUrl = "https://t.me/share/url";
    const params = {
        text: "Join me to play Torazone game and win amazing cash prizes 🎁",
        url: getAppLink(refId),
    };
    const url = new url_1.URL(baseUrl);
    // Add parameters to the URL
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });
    return url.toString();
};
const telegramBotListener = () => {
    // Example: Sending a message with buttons
    telegram_bot_1.telegramBot.onText(/\/start/, (msg) => {
        var _a;
        const chatId = msg.chat.id;
        // Create the welcome message
        const welcomeMessage = `
    \nHello ${(_a = msg.from) === null || _a === void 0 ? void 0 : _a.username},
    \n🎉 Welcome to the Torazone Quiz Game Challenge 🎉
  \n💰 Compete against others and win exciting cash prizes. Test your skills, climb the leaderboard, and become the champion
  \n Do you have friends, relatives, or co-workers?
  \n Bring them all into the game.
  \n More buddies, more coins.
  \n👇 Choose an option to get started:`;
        // Define the buttons
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🎮 Play Game",
                            url: getAppLink(),
                        },
                    ],
                    [
                        {
                            text: "🔗 Get Invite Link",
                            callback_data: "get_invite",
                        },
                    ],
                    [
                        {
                            text: "🔗 Join Community",
                            callback_data: "join_community",
                        },
                    ],
                    [
                        {
                            text: "ℹ️ How to Play",
                            callback_data: "how_to_play",
                        },
                    ],
                ],
            },
        };
        // Send the message with buttons
        telegram_bot_1.telegramBot.sendMessage(chatId, welcomeMessage, options);
    });
    // Handle button callbacks
    telegram_bot_1.telegramBot.on("callback_query", (query) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        const chatId = Number(query.from.id);
        try {
            if (query.data === "get_invite") {
                const user = yield db_1.default.user.findFirst({ where: { telId: String(chatId) } });
                if (!user) {
                    return telegram_bot_1.telegramBot.sendMessage(chatId, "Please launch the app before you can get an invite link to win rewards!");
                }
                console.log("Invite link user ", user);
                const refId = (_a = user === null || user === void 0 ? void 0 : user.id) === null || _a === void 0 ? void 0 : _a.slice(-12);
                const inviteLink = getAppLink(refId);
                telegram_bot_1.telegramBot.sendMessage(chatId, `
          \n Hello ${(_b = query.from) === null || _b === void 0 ? void 0 : _b.username},
          \n**Share the link below with your friends and get bonus coins** to play more games\. The more friends you invite, the more you earn bonuses\.\ ✨ More friends = more coins = more chances to win big prizes\! 🎁\
          \`
          \n Join me to play Torazone game and win amazing cash prizes 🎁 
          \n ${inviteLink}\` `, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "📤 Share Link",
                                    url: getShareLink(refId),
                                },
                            ],
                        ],
                    },
                });
            }
            else if (query.data === "join_community") {
                telegram_bot_1.telegramBot.sendMessage(chatId, `
          \n Hello ${(_c = query.from) === null || _c === void 0 ? void 0 : _c.username},
          \n To stay updated about our activities, please checkout all our communities to learn more.
          `, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: communityLinks.map(item => [item]),
                    },
                });
            }
            else if (query.data === "how_to_play") {
                telegram_bot_1.telegramBot.sendMessage(chatId, `
          ***Launch The App:***  
          \n Open the app, click on games, select a category, and join a game room to play\.  
          \n ***How to Play:***  
          \n Answer random questions each round as fast as possible to earn points\. Faster answers mean higher points\. Compete with players worldwide, but beware of the countdown timer—answers won't count after it ends\.  
          \n ***Game Wallet:***  
          \n Your wallet has three balances: *bonus*, *amount*, and *credit*\.  
          \n - *Bonus*: Coins earned from invites and registration\.  
          \n - *Amount*: Coins you purchase\.  
          \n - *Credit*: Cash rewards you earn from the game\.  
          \n ***Game Power:***  
          \n Earn free game power each round to keep you energized\. Recharge by holding the power gauge or turbo button\.  
          \n ***How to Buy Coins:***  
          \n Easily purchase coins in the wallet tab using Telegram stars\.  
          \n ***Leaderboard & Rewards:***  
          \n Climb the leaderboard based on daily, monthly, and yearly rankings\. Top players win bonuses and cash rewards, credited to your wallet\.  
          \n ***Invite Friends:***  
          \n Invite others to earn bonus coins\. ✨ More friends = more coins = more chances to win big prizes\! 🎁  
          \n ***Purpose:***  
          \n Torazone is a thrilling multiplayer game where you compete globally to earn points\. Play as many rounds as you can, and don't give up—show the world what you've got\!  

          \n Good luck!

          `, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "🎮 Play Now",
                                    url: getAppLink(),
                                },
                            ],
                        ],
                    }
                });
            }
            else {
                telegram_bot_1.telegramBot.sendMessage(chatId, "❓ Oops! Something went wrong. Please try again.");
            }
            // Acknowledge the callback
            telegram_bot_1.telegramBot.answerCallbackQuery(query.id);
        }
        catch (error) {
            console.log("Error: Invite request failed ", error === null || error === void 0 ? void 0 : error.message);
            telegram_bot_1.telegramBot.sendMessage(chatId, "❓ Oops! Something went wrong. Please try again.");
        }
    }));
    // Generate invite link
    telegram_bot_1.telegramBot.onText(/\/invite/, (msg) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const chatId = Number((_a = msg.from) === null || _a === void 0 ? void 0 : _a.id);
            const user = yield db_1.default.user.findFirst({ where: { telId: String(chatId) } });
            if (!user) {
                return telegram_bot_1.telegramBot.sendMessage(chatId, "Please launch the app before you can get an invite link to win rewards!");
            }
            const refId = (_b = user === null || user === void 0 ? void 0 : user.id) === null || _b === void 0 ? void 0 : _b.slice(-12);
            const inviteLink = getAppLink(refId);
            telegram_bot_1.telegramBot.sendMessage(msg.chat.id, `
          \n Hello ${(_c = msg.from) === null || _c === void 0 ? void 0 : _c.username},
          \n**Share the link below with your friends and get bonus coins** to play more games\. The more friends you invite, the more you earn bonuses\.\ ✨ More friends = more coins = more chances to win big prizes\! 🎁\
          \`
          \n Join me to play Torazone game and win amazing prizes 🎁 
          \n ${inviteLink}\` `, { parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "📤 Share Link",
                                url: getShareLink(refId),
                            },
                        ],
                    ],
                },
            });
        }
        catch (error) {
            console.log("Error generating invite link: ", error === null || error === void 0 ? void 0 : error.message);
        }
    }));
    // Generate invite link
    telegram_bot_1.telegramBot.onText(/\/help/, (msg) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            telegram_bot_1.telegramBot.sendMessage(msg.chat.id, `
        ***Launch The App:***  
        \n Open the app, click on games, select a category, and join a game room to play\.  
        \n ***How to Play:***  
        \n Answer random questions each round as fast as possible to earn points\. Faster answers mean higher points\. Compete with players worldwide, but beware of the countdown timer—answers won't count after it ends\.  
        \n ***Game Wallet:***  
        \n Your wallet has three balances: *bonus*, *amount*, and *credit*\.  
        \n - *Bonus*: Coins earned from invites and registration\.  
        \n - *Amount*: Coins you purchase\.  
        \n - *Credit*: Cash rewards you earn from the game\.  
        \n ***Game Power:***  
        \n Earn free game power each round to keep you energized\. Recharge by holding the power gauge or turbo button\.  
        \n ***How to Buy Coins:***  
        \n Easily purchase coins in the wallet tab using Telegram stars\.  
        \n ***Leaderboard & Rewards:***  
        \n Climb the leaderboard based on daily, monthly, and yearly rankings\. Top players win bonuses and cash rewards, credited to your wallet\.  
        \n ***Invite Friends:***  
        \n Invite others to earn bonus coins\. ✨ More friends = more coins = more chances to win big prizes\! 🎁  
        \n ***Purpose:***  
        \n Torazone is a thrilling multiplayer game where you compete globally to earn points\. Play as many rounds as you can, and don't give up—show the world what you've got\!  

        \n Good luck!

        `, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "🎮 Play Now",
                                url: getAppLink(),
                            },
                        ],
                    ],
                }
            });
        }
        catch (error) {
            console.log("Error generating invite link: ", error === null || error === void 0 ? void 0 : error.message);
        }
    }));
    telegram_bot_1.telegramBot.onText(/\/buy/, (msg) => {
        var _a;
        try {
            console.log("Buy Command received");
            const chatId = msg.chat.id;
            const telId = (_a = msg.from) === null || _a === void 0 ? void 0 : _a.id;
            // ctx.api.sendInvoice(chatId, "Buy Torazone Coins", "Easily buy Torazone Coins here", "", "XTR", )
            telegram_bot_1.telegramBot.sendInvoice(chatId, `Buy Torazone Coins`, // Product title
            `Easily Buy Torazone Coins Here`, // Product description
            "{}", // Product payload, not required for now
            "", "XTR", // Stars Currency 
            [{ amount: 100, label: "Buy coins" }], { start_parameter: String(telId) });
        }
        catch (error) {
            console.log(error === null || error === void 0 ? void 0 : error.message);
        }
    });
    // handle telegram TMA payment
    telegram_bot_1.telegramBot.on("pre_checkout_query", (msg) => {
        console.log("pre_checkout_query Command received");
        console.log(msg);
        try {
            // ctx.api.sendInvoice(chatId, "Buy Torazone Coins", "Easily buy Torazone Coins here", "", "XTR", )
            telegram_bot_1.telegramBot.answerPreCheckoutQuery(msg.id, true);
        }
        catch (error) {
            console.log(error === null || error === void 0 ? void 0 : error.message);
            telegram_bot_1.telegramBot.answerPreCheckoutQuery(msg.id, false, { error_message: 'Sorry an error occurred, try again later ', });
        }
    });
    telegram_bot_1.telegramBot.on("successful_payment", (msg) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log("successful_payment Command received");
        console.log(msg);
        try {
            const telTxn = msg.successful_payment;
            const botTxnRef = (_a = telTxn === null || telTxn === void 0 ? void 0 : telTxn.invoice_payload) === null || _a === void 0 ? void 0 : _a.split("tx_")[1];
            const txnDate = new Date(msg.date).toISOString();
            const msgId = msg.message_id;
            const isAppSubscription = (_b = telTxn === null || telTxn === void 0 ? void 0 : telTxn.invoice_payload) === null || _b === void 0 ? void 0 : _b.startsWith("appsub");
            // update the transaction
            if (telTxn && botTxnRef) {
                setTimeout(() => {
                    db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                        const totalBotTxn = yield tx.transaction.count({ where: { exTxnRef: botTxnRef } });
                        // get the latest transaction
                        console.log("totalBotTxn ", totalBotTxn);
                        const txn = yield tx.transaction.findFirst({ where: { exTxnRef: botTxnRef }, orderBy: [{ createdAt: "desc" }] });
                        // get payload
                        const invoicePayload = telTxn.invoice_payload.toLowerCase();
                        // extract userId
                        const userId = invoicePayload.split("_")[1];
                        if (totalBotTxn === 0 || !txn) {
                            // log transaction for analysis
                            console.log("Loging transaction for analysis ");
                            yield tx.transactionLogs.create({ data: { userId, meta: msg } });
                        }
                        else if (totalBotTxn === 1) {
                            // update transaction as this is the first time
                            yield tx.transaction.update({ where: { id: txn.id }, data: { metadata: Object.assign(Object.assign({}, txn.metadata), { telTxn, txnDate, msgId }) } });
                        }
                        else {
                            // renew subscription
                            if (isAppSubscription && userId && txn.subscriptionId) {
                                yield (0, subscriptions_1.renewTmaAppSubscription)({ subId: txn.subscriptionId, botTxnRef, txnId: txn.id, meta: { txnDate, telTxn } }, userId);
                            }
                        }
                    }));
                }, 5000);
            }
            telegram_bot_1.telegramBot.sendMessage((_c = msg.chat) === null || _c === void 0 ? void 0 : _c.id, isAppSubscription ? `Your app subscription is successful. Open the app to enjoy exclusive features.` : `Your coin purchase was successful. Open Torazone app to check your coin balance and continue to play. Amazing rewards await you!`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "🎮 Play Now",
                                url: getAppLink(),
                            },
                        ],
                    ],
                }
            });
        }
        catch (error) {
            console.log(error === null || error === void 0 ? void 0 : error.message);
        }
    }));
    telegram_bot_1.telegramBot.onText(/\/hello (.+)/, (msg, match) => {
        // 'msg' is the received Message from Telegram
        // 'match' is the result of executing the regexp above on the text content
        // of the message
        var _a;
        const chatId = msg.chat.id;
        telegram_bot_1.telegramBot.sendMessage(chatId, `Hi ${(_a = msg.from) === null || _a === void 0 ? void 0 : _a.username}, How can I help you?`);
    });
};
exports.telegramBotListener = telegramBotListener;
// start - Play, learn & earn
// invite - Invite friends & family members to earn bonus coins
// buy - Buy Torazone coins
// join - Connect with us in our community
// help - Learn more about Torazone games
