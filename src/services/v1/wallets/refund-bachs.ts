import { Prisma, PurchaseRefund } from "@prisma/client";
import { bachsApiOrigin } from "@/utils/bachs";
import { cents, WalletError } from "@/services/walletLedger";
import { logServiceError, logServiceTrace } from "@/logger/events";
import { refundRequest, refundAmount, RefundProviderError } from "./refund-http";

async function request(path: string, body?: object, key?: string, context: Record<string, unknown> = {}) {
  const environment = bachsApiOrigin();
  return await refundRequest({
    gateway: "BACHS", baseUrl: `${environment}/v1`, secret: process.env.BACHS_API_KEY,
    environment, parseResponse: response => response,
  }, path, body, key, context);
}
function checkEnvironment(row: PurchaseRefund) {
  if (row.environment !== bachsApiOrigin()) throw new WalletError("Refund belongs to another payment environment",409);
}
export async function verifyBachsRefundPayment(paymentId: string, currency: string, paid: Prisma.Decimal, context: Record<string, unknown> = {}) {
  const data = await request(`/payments/${encodeURIComponent(paymentId)}`,undefined,undefined,{...context,providerPaymentId:paymentId});
  if (String(data.payment_id) !== paymentId || data.currency !== currency || refundAmount(data.amount) !== cents(paid) ||
      !["succeeded","overpaid","successful"].includes(String(data.status).toLowerCase()))
    throw new WalletError("Original payment could not be verified",409);
  if (data.is_refundable === false)
    throw new WalletError("Bachs does not allow a refund for this payment. Bank-transfer payments cannot be refunded automatically; please contact support.",409);
}
export async function createBachsRefund(row: PurchaseRefund, saveProviderId?: (id: string) => Promise<void>) {
  checkEnvironment(row);
  const response = await request("/refunds",{
    charge_id: row.paymentId, reference: row.id, amount: row.amount.toFixed(2),
    fee_bearer: "org", reason: "Coin purchase refund within 14 days", idempotency_key: row.id,
  },row.id,{refundId:row.id,purchaseId:row.transactionId,providerPaymentId:row.paymentId,amount:row.amount.toFixed(2),currency:row.currency});
  if ((typeof response?.refund_id !== "string" && typeof response?.refund_id !== "number") || String(response.refund_id).trim() === "")
    throw new WalletError("Payment provider did not return a refund ID",503);
  try {
    if (saveProviderId) await saveProviderId(String(response.refund_id));
    return response;
  } catch (error) {
    logServiceError("v1/wallets/refund-provider","refund.verification.failed",error,false,{refundId:row.id,providerRefundId:String(response.refund_id)});
    if (error instanceof RefundProviderError) throw new RefundProviderError(false,error);
    throw error;
  }
}
export async function readBachsRefund(row: PurchaseRefund) {
  checkEnvironment(row);
  const path = row.providerRefundId ? `/refunds/${encodeURIComponent(row.providerRefundId)}` : `/refunds/by-charge/${encodeURIComponent(row.paymentId)}`;
  return await request(path,undefined,undefined,{refundId:row.id,purchaseId:row.transactionId,providerPaymentId:row.paymentId,providerRefundId:row.providerRefundId});
}
export function bachsRefundResult(row: PurchaseRefund, data: any) {
  const id = String(data?.refund_id);
  if (!id || id === "undefined" || id === "null" || typeof data?.status !== "string")
    throw new WalletError("Provider refund ID or status is missing",503);
  if (String(data.charge_id) !== row.paymentId || data.reference !== row.id ||
      refundAmount(data.requested_amount) !== cents(row.amount) || (row.providerRefundId && id !== row.providerRefundId)) {
    logServiceTrace("v1/wallets/refund-provider","refund.response.mismatch","Refund response failed verification",{
      refundId:row.id,gateway:"BACHS",providerPaymentId:row.paymentId,responsePaymentId:String(data.charge_id),
      responseRefundId:id,expectedRefundId:row.providerRefundId,expectedAmount:row.amount.toString(),responseAmount:String(data.requested_amount),
    });
    throw new WalletError("Refund confirmation mismatch",409);
  }
  const status = data.status.toLowerCase();
  if (["success","successful","succeeded","completed","completed-mpgs","completed-offline","completed-bank-transfer","completed-momo","completed-preauth"].includes(status))
    return {id,status:refundAmount(data.refunded_amount) === cents(row.amount) ? "SUCCEEDED" : "REVIEW"};
  return {id,status:["failed","cancelled","canceled"].includes(status) ? "FAILED" : "PROCESSING"};
}
export const bachsRefundProvider = {
  environment: bachsApiOrigin,
  verifyPayment: verifyBachsRefundPayment,
  createRefund: createBachsRefund,
  readRefund: readBachsRefund,
  refundResult: bachsRefundResult,
};
