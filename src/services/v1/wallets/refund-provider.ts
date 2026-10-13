import { Prisma, PurchaseRefund } from "@prisma/client";
import { WalletError } from "@/services/walletLedger";
import { bachsRefundProvider } from "./refund-bachs";
import { flutterwaveRefundProvider } from "./refund-flutterwave";
export { RefundProviderError } from "./refund-http";

// Select from the original purchase gateway, never a client-provided choice.
export function getRefundProvider(gateway: string) {
  switch (gateway) {
    case "BACHS":
      return bachsRefundProvider;
    case "FLUTTERWAVE":
      return flutterwaveRefundProvider;
    default:
      throw new WalletError("Unsupported refund provider", 409);
  }
}
export function refundEnvironment(gateway: string) {
  return getRefundProvider(gateway).environment();
}
export async function verifyRefundPayment(
  gateway: string,
  paymentId: string,
  currency: string,
  paid: Prisma.Decimal,
  context: Record<string, unknown> = {},
) {
  await getRefundProvider(gateway).verifyPayment(paymentId, currency, paid, context);
}
export async function createProviderRefund(
  row: PurchaseRefund,
  saveProviderId?: (id: string) => Promise<void>,
) {
  return await getRefundProvider(row.gateway).createRefund(row, saveProviderId);
}
export async function readProviderRefund(row: PurchaseRefund) {
  return await getRefundProvider(row.gateway).readRefund(row);
}
export function providerRefundResult(row: PurchaseRefund, data: any) {
  return getRefundProvider(row.gateway).refundResult(row, data);
}
