import { URL } from "url";
import {  telegramBot } from "@/telegram-bot";
import prisma from "@/db";
import { telegramBotAppUrl } from "@/config";
import { renewTmaAppSubscription } from "../subscriptions";
import { extractId } from "@/utils";



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
    url: telegramBotAppUrl
  },
]

const getAppLink = (refId?: number | string) => {
  return refId
    ? `${telegramBotAppUrl}?startapp=${refId}`
    : telegramBotAppUrl;
};
const getShareLink = (refId?: number | string) => {
  const baseUrl = "https://t.me/share/url";
  const params = {
    text: "Join me to play Torazone game and win amazing cash prizes 🎁",
    url: getAppLink(refId),
  };
  const url = new URL(baseUrl);
  // Add parameters to the URL
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
};

export const telegramBotListener = () => {

  // Example: Sending a message with buttons
  telegramBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    // Create the welcome message
    const welcomeMessage = `
    \nHello ${msg.from?.username},
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
    telegramBot.sendMessage(chatId, welcomeMessage, options);
  });

  // Handle button callbacks
  telegramBot.on("callback_query", async (query) => {

    const chatId = Number(query.from.id);

    try {

      if (query.data === "get_invite") {
        const user = await prisma.user.findFirst({where: { telId: String(chatId) }})
        if(!user) {
          return telegramBot.sendMessage(chatId, "Please launch the app before you can get an invite link to win rewards!");
        }
        console.log("Invite link user ", user)

        const refId = user?.id?.slice(-12)

        const inviteLink = getAppLink(refId);

        telegramBot.sendMessage(
          chatId,
          `
          \n Hello ${query.from?.username},
          \n**Share the link below with your friends and get bonus coins** to play more games\. The more friends you invite, the more you earn bonuses\.\ ✨ More friends = more coins = more chances to win big prizes\! 🎁\
          \`
          \n Join me to play Torazone game and win amazing cash prizes 🎁 
          \n ${inviteLink}\` `,

          {
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
          }
        );
      }
      else if (query.data === "join_community") {
        telegramBot.sendMessage(
          chatId,
          `
          \n Hello ${query.from?.username},
          \n To stay updated about our activities, please checkout all our communities to learn more.
          `,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: communityLinks.map(item => [item]),
            },
          }
        );
      }
      else if (query.data === "how_to_play") {
        telegramBot.sendMessage(
          chatId,
          `
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

          `,
          {
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
          }
        );
      } else {
        telegramBot.sendMessage(
          chatId,
          "❓ Oops! Something went wrong. Please try again."
        );
      }
      // Acknowledge the callback
      telegramBot.answerCallbackQuery(query.id);
    } catch (error: any) {
      console.log("Error: Invite request failed ", error?.message);
      telegramBot.sendMessage(
        chatId,
        "❓ Oops! Something went wrong. Please try again."
      );
    }
  });

  // Generate invite link
  telegramBot.onText(/\/invite/, async (msg) => {
    try {
      const chatId = Number(msg.from?.id)

      const user = await prisma.user.findFirst({where: { telId: String(chatId) }})
      
      if(!user) {
        return telegramBot.sendMessage(chatId, "Please launch the app before you can get an invite link to win rewards!");
      }

      const refId = user?.id?.slice(-12)

      const inviteLink = getAppLink(refId);

      telegramBot.sendMessage(
        msg.chat.id,
        `
          \n Hello ${msg.from?.username},
          \n**Share the link below with your friends and get bonus coins** to play more games\. The more friends you invite, the more you earn bonuses\.\ ✨ More friends = more coins = more chances to win big prizes\! 🎁\
          \`
          \n Join me to play Torazone game and win amazing prizes 🎁 
          \n ${inviteLink}\` `,

        { parse_mode: "Markdown",
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

        }
      );
    } catch (error: any) {
      console.log("Error generating invite link: ", error?.message);
    }
  });

  // Generate invite link
  telegramBot.onText(/\/help/, async (msg) => {
    try {
      telegramBot.sendMessage(
        msg.chat.id,
        `
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

        `,
        {
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
        }
      );
    } catch (error: any) {
      console.log("Error generating invite link: ", error?.message);
    }
  });

  telegramBot.onText(/\/buy/, (msg) => {
    try {
      console.log("Buy Command received")
      const chatId = msg.chat.id;
      const telId = msg.from?.id
      // ctx.api.sendInvoice(chatId, "Buy Torazone Coins", "Easily buy Torazone Coins here", "", "XTR", )
      telegramBot.sendInvoice(
          chatId,
          `Buy Torazone Coins`, // Product title
          `Easily Buy Torazone Coins Here`, // Product description
          "{}", // Product payload, not required for now
          "",
          "XTR", // Stars Currency 
          [{ amount: 100, label: "Buy coins"  } ],
          {start_parameter: String(telId) }
        );
    } catch (error: any) {
      console.log(error?.message);
    }
  });
// handle telegram TMA payment
  telegramBot.on("pre_checkout_query", (msg) => {
    console.log("pre_checkout_query Command received")
    console.log(msg);
    try {
      // ctx.api.sendInvoice(chatId, "Buy Torazone Coins", "Easily buy Torazone Coins here", "", "XTR", )
      telegramBot.answerPreCheckoutQuery(msg.id, true)
    } catch (error: any) {
      console.log(error?.message);
      telegramBot.answerPreCheckoutQuery(msg.id, false, {error_message: 'Sorry an error occurred, try again later ',})

    }
  });

  telegramBot.on("successful_payment", async(msg) => {
    console.log("successful_payment Command received")
    console.log(msg);
    try {

      const telTxn = msg.successful_payment

      const botTxnRef = telTxn?.invoice_payload?.split("tx_")[1]

      const txnDate = new Date(msg.date).toISOString()

      const msgId = msg.message_id

      const isAppSubscription = telTxn?.invoice_payload?.startsWith("appsub")

      // update the transaction
      if(telTxn && botTxnRef){
        setTimeout(() => {
          prisma.$transaction(async (tx) =>{
            const totalBotTxn = await tx.transaction.count({ where: { exTxnRef: botTxnRef }})
            // get the latest transaction
            console.log("totalBotTxn ", totalBotTxn)
            const txn = await tx.transaction.findFirst({ where: { exTxnRef: botTxnRef }, orderBy: [{createdAt: "desc"}]})
            // get payload
            const invoicePayload = telTxn.invoice_payload.toLowerCase()
            // extract userId
            const userId = invoicePayload.split("_")[1]
            if(totalBotTxn === 0 || !txn){
              // log transaction for analysis
              console.log("Loging transaction for analysis ")
              await  tx.transactionLogs.create({ data: { userId, meta: msg }})
            }
            else if(totalBotTxn === 1){
              // update transaction as this is the first time
              await tx.transaction.update({ where: { id: txn.id }, data: { metadata: { ...txn.metadata as object, telTxn, txnDate, msgId } }})
            }
            else{
              // renew subscription
              
              if(isAppSubscription && userId && txn.subscriptionId){
                await renewTmaAppSubscription({ subId: txn.subscriptionId, botTxnRef, txnId:txn.id, meta: { txnDate, telTxn  }}, userId)
              }
            }
            
          })
          
        },5000)

        
      }

      telegramBot.sendMessage(
        msg.chat?.id, 
        isAppSubscription ? `Your app subscription is successful. Open the app to enjoy exclusive features.` :`Your coin purchase was successful. Open Torazone app to check your coin balance and continue to play. Amazing rewards await you!`,
        {
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
        }
      )
    } catch (error: any) {
      console.log(error?.message);

    }
  })


  telegramBot.onText(/\/hello (.+)/, (msg, match) => {
    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message

    const chatId = msg.chat.id;

    telegramBot.sendMessage(
      chatId,
      `Hi ${msg.from?.username}, How can I help you?`
    );
  });





};

// start - Play, learn & earn
// invite - Invite friends & family members to earn bonus coins
// buy - Buy Torazone coins
// join - Connect with us in our community
// help - Learn more about Torazone games
