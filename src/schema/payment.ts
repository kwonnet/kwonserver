import { z } from "zod";
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";

// Explicit allowlists for new payments. Database enums also retain historical values.
export const paymentCurrencySchema = z.enum([
  TxnCurrencyEnum.TZX, TxnCurrencyEnum.USDT, TxnCurrencyEnum.USD,
  TxnCurrencyEnum.NGN, TxnCurrencyEnum.FIAT, TxnCurrencyEnum.COINS,
]);
export const paymentGatewaySchema = z.enum([
  TxnGatewayEnum.WALLET, TxnGatewayEnum.FLUTTERWAVE, TxnGatewayEnum.PAYSTACK,
  TxnGatewayEnum.CRYPTO, TxnGatewayEnum.VIRTUAL,
]);
export const paymentSourceSchema = z.enum([
  TxnSourceEnum.COINS, TxnSourceEnum.BONUS, TxnSourceEnum.COINS_BONUS,
  TxnSourceEnum.CREDIT, TxnSourceEnum.FIAT, TxnSourceEnum.CRYPTO, TxnSourceEnum.VIRTUAL,
]);
export const paymentMethodSchema = z.object({
  currency: paymentCurrencySchema,
  gateway: paymentGatewaySchema,
  source: paymentSourceSchema,
});

// Keep other provider-specific fiat currencies available while rejecting retired ledger currencies.
export const externalPaymentCurrencySchema = z.string().trim().refine(value => {
  const known = Object.values(TxnCurrencyEnum).includes(value.toUpperCase() as TxnCurrencyEnum);
  return !known || paymentCurrencySchema.safeParse(value.toUpperCase()).success;
}, { message: "Unsupported payment currency" });
