import axios from "axios";
import OpenAi from "openai";

export const appName = String(process.env.APP_NAME)

export const tonAPIEndpoint = String(process.env.TON_API_ENDPOINT);

export const tonWalletMnemonic = String(process.env.TONKEEPER_MNEMONIC);

export const telegramBotToken = String(process.env.TELEGRAM_BOT_API_KEY);

export const telegramBotAppUrl = String(process.env.TELEGRAM_BOT_APP_URL);

export const telegramBotUrl = String(process.env.TELEGRAM_BOT);

export const telegramBotWebhookUrl = String(
  process.env.TELEGRAM_BOT_WEBHOOK_URL
);

// flutterwave keys

export const flutterwaveApiUrl = String(process.env.FLUTTERWAVE_API_URL);

export const flutterwavePublicKey = String(process.env.FLUTTERWAVE_PUBK);

export const flutterwaveSecretKey = String(process.env.FLUTTERWAVE_SECK);

export const flutterwaveEncryptKey = String(process.env.FLUTTERWAVE_ENCK);

// smart glocal api key

export const smartGlocalApiKey = String(process.env.SMART_GLOCAL_API_KEY);

export const unlimintApiKey = String(process.env.UNLIMINT_API_KEY);
// jwt keys

export const jwtKey = String(process.env.JWT_SECRET);

export const encrytionKey = String(process.env.ENCRYPTION_KEY);

export const webpushConfig = {
  email: process.env.VAPID_EMAIL!,
  publicKey: process.env.VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
};

// image kit

export const imagekitAppName = String(
  process.env.NODE_ENV !== "production"
    ? process.env.IMAGEKIT_APP_NAME_DEV
    : process.env.IMAGEKIT_APP_NAME
);

export const axiosXAI = axios.create({
  baseURL: process.env.XAI_BASE_URL,
  headers: {
    Authorization: "Bearer " + process.env.XAI_API_KEY,
  },
});

export const openai = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
  organization: process.env.OPENAI_ORG_ID,
});

export const deepSeekAi = new OpenAi({
  baseURL: process.env.DEEP_SEEK_BASE_URL,
  apiKey: process.env.DEEP_SEEK_API_KEY,
});


export const mongodbUri =  String(process.env.MONGO_URL )

export const allowedOrigins = process.env.NODE_ENV === "production" ? [String(process.env.REMOTE_APP_URL)] : [String(process.env.LOCAL_APP_URL), String(process.env.LOCAL_TUNNEL_URL)]

export const kwonrecAPI = String(process.env.KWONREC_API)