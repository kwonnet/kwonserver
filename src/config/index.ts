import axios from 'axios';
import OpenAi from 'openai'

export const tonAPIEndpoint = String(process.env.TON_API_ENDPOINT)

export const tonWalletMnemonic = String(process.env.TONKEEPER_MNEMONIC)

export const telegramBotToken = String(process.env.TELEGRAM_BOT_API_KEY)

export const telegramBotAppUrl = String(process.env.TELEGRAM_BOT_APP_URL)

export const telegramBotUrl = String(process.env.TELEGRAM_BOT)

// flutterwave keys

export const flutterwaveApiUrl = String(process.env.FLUTTERWAVE_API_URL)

export const flutterwavePublicKey = String(process.env.FLUTTERWAVE_PUBK);

export const flutterwaveSecretKey = String(process.env.FLUTTERWAVE_SECK);

export const flutterwaveEncryptKey = String(process.env.FLUTTERWAVE_ENCK);

// smart glocal api key

export const smartGlocalApiKey = String(process.env.SMART_GLOCAL_API_KEY)

export const unlimintApiKey = String(process.env.UNLIMINT_API_KEY)
// jwt keys

export const jwtKey = String(process.env.JWT_SECRET)

export const encrytionKey = String(process.env.ENCRYPTION_KEY)

export const axiosXAI = axios.create({
    baseURL: process.env.XAI_BASE_URL,
    headers: {
        Authorization: 'Bearer ' + process.env.XAI_API_KEY
    }
})

export const openai = new OpenAi({
        apiKey: process.env.OPENAI_API_KEY,
        project: process.env.OPENAI_PROJECT_ID,
        organization: process.env.OPENAI_ORG_ID
})