// import { Bot } from "grammy";
import TelegramBot from "node-telegram-bot-api";
import { telegramBotToken, telegramBotWebhookUrl } from "@/config";

interface LabeledPrice {
  label: string;
  amount: number; // Amount in the smallest units of the currency
}

interface LabeledPrice {
  label: string;
  amount: number; // Amount in the smallest units of the currency
}

/**
 * Creates a link for an invoice.
 * @param {string} title - Product name, 1-32 characters.
 * @param {string} description - Product description, 1-255 characters.
 * @param {string} payload - Bot-defined invoice payload, 1-128 bytes.
 * @param {string} provider_token - Payment provider token, obtained via @BotFather.
 * @param {string} currency - Three-letter ISO 4217 currency code.
 * @param {LabeledPrice[]} prices - Price breakdown, a JSON-serialized list of components.
 * @param {number} [max_tip_amount] - The maximum accepted amount for tips.
 * @param {number[]} [suggested_tip_amounts] - Suggested amounts of tips.
 * @param {string} [provider_data] - JSON-serialized data about the invoice.
 * @param {string} [photo_url] - URL of the product photo for the invoice.
 * @param {number} [photo_size] - Photo size in bytes.
 * @param {number} [photo_width] - Photo width.
 * @param {number} [photo_height] - Photo height.
 * @param {boolean} [need_name] - Require the user's full name to complete the order.
 * @param {boolean} [need_phone_number] - Require the user's phone number to complete the order.
 * @param {boolean} [need_email] - Require the user's email address to complete the order.
 * @param {boolean} [need_shipping_address] - Require the user's shipping address.
 * @param {boolean} [send_phone_number_to_provider] - Send user's phone number to the provider.
 * @param {boolean} [send_email_to_provider] - Send user's email address to the provider.
 * @param {boolean} [is_flexible] - Final price depends on the shipping method.
 * @returns {string} The created invoice link.
 */
interface CreateInvoiceParams {
  title: string;
  description: string;
  payload: string;
  provider_token: string;
  currency: string;
  prices: LabeledPrice[];
  max_tip_amount?: number;
  suggested_tip_amounts?: number[];
  provider_data?: object;
  photo_url?: string;
  photo_size?: number;
  photo_width?: number;
  photo_height?: number;
  need_name?: boolean;
  need_phone_number?: boolean;
  need_email?: boolean;
  need_shipping_address?: boolean;
  send_phone_number_to_provider?: boolean;
  send_email_to_provider?: boolean;
  is_flexible?: boolean;
  subscription_period?: number;
}

class MyTelegramBot extends TelegramBot {
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
  async createInvoiceLink(params: CreateInvoiceParams): Promise<string> {
    try {
      const entries = Object.entries(params).map(([key, value]) =>
        key === "prices" ? [key, JSON.stringify(value)] : [key, value]
      );

      const filteredParams = Object.fromEntries(
        entries.filter(([_key, value]) => value !== null && value !== undefined)
      );

      const searchParams = new URLSearchParams(filteredParams).toString();

      const response = await fetch(
        `https://api.telegram.org/bot${telegramBotToken}/createInvoiceLink?${searchParams}`
      );
      const res = await response.json();
      if (!response.ok || !res.ok ) {
        throw new Error(res?.description ?? response.statusText);
      }
      return res.result as string;
    } catch (error) {
      throw error;
    }
  }
}

export const telegramBot = new MyTelegramBot(telegramBotToken, {
  polling: false,
});

// telegramBot.setWebHook(telegramBotWebhookUrl+`/bot${telegramBotToken}`)



// export const telBot = new Bot(telegramBotToken);
