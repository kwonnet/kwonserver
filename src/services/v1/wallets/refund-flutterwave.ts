import { Prisma, PurchaseRefund } from "@prisma/client";
import { cents, WalletError } from "@/services/walletLedger";
import { logServiceError, logServiceTrace } from "@/logger/events";
import { refundRequest, refundAmount, providerFailure, RefundProviderError } from "./refund-http";

const refundStatuses: Record<string, "PROCESSING" | "SUCCEEDED" | "FAILED"> = {
  completed: "PROCESSING",
  "pending-momo": "PROCESSING",
  "pending-bank-transfer": "PROCESSING",
  "pending-mpgs": "PROCESSING",
  processing: "PROCESSING",
  "completed-bank-transfer": "SUCCEEDED",
  "completed-momo": "SUCCEEDED",
  "completed-mpgs": "SUCCEEDED",
  "completed-offline": "SUCCEEDED",
  "completed-preauth": "SUCCEEDED",
  // Preserve older final responses and explicit failure states.
  success: "SUCCEEDED", successful: "SUCCEEDED", succeeded: "SUCCEEDED",
  failed: "FAILED", cancelled: "FAILED", canceled: "FAILED",
};
export function flutterwaveRefundEnvironment() {
  return process.env.FLUTTERWAVE_SECK?.includes("_TEST") ? "flutterwave:test" : "flutterwave:live";
}
function refundFields(data: any) {
  return { id: data?.id, paymentId: data?.transaction_id ?? data?.TransactionId ?? data?.tx_id,
    amount: data?.amount_refunded ?? data?.AmountRefunded,
    comment: data?.comment ?? data?.comments, status: data?.status };
}
async function request(path: string, body?: object, context: Record<string, unknown> = {}) {
  return await refundRequest({
    gateway: "FLUTTERWAVE", baseUrl: "https://api.flutterwave.com/v3",
    secret: process.env.FLUTTERWAVE_SECK, environment: flutterwaveRefundEnvironment(),
    parseResponse(result, endpoint, httpStatus) {
      const bareRefund = result.status !== "error" && (endpoint.startsWith("/refunds/") || endpoint.endsWith("/refund")) &&
        (typeof result.id === "number" || typeof result.id === "string") &&
        (typeof refundFields(result).amount === "number" || typeof refundFields(result).amount === "string");
      if (result.status !== "success" && !bareRefund) throw providerFailure("FLUTTERWAVE",endpoint,httpStatus,result,false);
      const data = bareRefund ? result : result.data;
      return endpoint.startsWith("/refunds?") ? {data,pageInfo:result.meta?.page_info} : data;
    },
  },path,body,undefined,context);
}
function checkEnvironment(row: PurchaseRefund) {
  if (row.environment !== flutterwaveRefundEnvironment()) throw new WalletError("Refund belongs to another payment environment",409);
}
export async function verifyFlutterwaveRefundPayment(paymentId: string, currency: string, paid: Prisma.Decimal, context: Record<string, unknown> = {}) {
  const data = await request(`/transactions/${encodeURIComponent(paymentId)}/verify`,undefined,{...context,providerPaymentId:paymentId});
  if (String(data.id) !== paymentId || data.currency !== currency || refundAmount(data.amount) !== cents(paid) ||
      !["succeeded","overpaid","successful"].includes(String(data.status).toLowerCase()))
    throw new WalletError("Original payment could not be verified",409);
}
export async function createFlutterwaveRefund(row: PurchaseRefund, saveProviderId?: (id: string) => Promise<void>) {
  checkEnvironment(row);
  const response = await request(`/transactions/${encodeURIComponent(row.paymentId)}/refund`,{
    amount:row.amount.toNumber(),comments:`Coin purchase refund ${row.id}`,
  },{refundId:row.id,purchaseId:row.transactionId,providerPaymentId:row.paymentId,amount:row.amount.toFixed(2),currency:row.currency});
  if ((typeof response?.id !== "string" && typeof response?.id !== "number") || String(response.id).trim() === "")
    throw new WalletError("Payment provider did not return a refund ID",503);
  const refundId = String(response.id);
  try {
    // Save the accepted receipt before the verification GET can fail.
    if (saveProviderId) await saveProviderId(refundId);
    const verified = await readFlutterwaveRefund({...row,providerRefundId:refundId});
    if (String(verified?.id) !== refundId) throw new WalletError("Refund confirmation mismatch",409);
    return verified;
  } catch (error) {
    logServiceError("v1/wallets/refund-provider","refund.verification.failed",error,false,{refundId:row.id,providerRefundId:refundId});
    if (error instanceof RefundProviderError) throw new RefundProviderError(false,error);
    throw error;
  }
}
export async function readFlutterwaveRefund(row: PurchaseRefund) {
  checkEnvironment(row);
  const context = {refundId:row.id,purchaseId:row.transactionId,providerPaymentId:row.paymentId,providerRefundId:row.providerRefundId};
  if (row.providerRefundId) return await request(`/refunds/${encodeURIComponent(row.providerRefundId)}`,undefined,context);
  // Recovery for old or interrupted submissions only; never repeat their POST.
  for (let page=1;page<=20;page++) {
    const {data,pageInfo} = await request(`/refunds?from=${row.createdAt.toISOString().slice(0,10)}&to=${new Date().toISOString().slice(0,10)}&currency=${encodeURIComponent(row.currency)}&page=${page}`,undefined,{...context,page});
    if (!Array.isArray(data)) throw new WalletError("Unable to reconcile refund",503);
    const match = data.find(item=>refundFields(item).comment === `Coin purchase refund ${row.id}`)
      ?? data.find(item=>String(refundFields(item).paymentId) === row.paymentId);
    if (match) return match;
    if (!data.length || (Number.isInteger(pageInfo?.total_pages) && page>=pageInfo.total_pages)) break;
  }
  throw new WalletError("Refund confirmation is pending",503);
}
export function flutterwaveRefundResult(row: PurchaseRefund, response: any) {
  const data = refundFields(response), id = String(data.id);
  if (!id || id === "undefined" || id === "null" || typeof data.status !== "string")
    throw new WalletError("Provider refund ID or status is missing",503);
  const paymentMatches = String(data.paymentId) === row.paymentId;
  const savedIdMatches = !!row.providerRefundId && id === row.providerRefundId;
  const referenceMatches = !row.providerRefundId && data.comment === `Coin purchase refund ${row.id}`;
  if ((!paymentMatches && !savedIdMatches && !referenceMatches) || refundAmount(data.amount) !== cents(row.amount) ||
      (row.providerRefundId && id !== row.providerRefundId)) {
    logServiceTrace("v1/wallets/refund-provider","refund.response.mismatch","Refund response failed verification",{
      refundId:row.id,gateway:"FLUTTERWAVE",providerPaymentId:row.paymentId,responsePaymentId:String(data.paymentId),
      responseRefundId:id,expectedRefundId:row.providerRefundId,expectedAmount:row.amount.toString(),responseAmount:String(data.amount),
    });
    throw new WalletError("Refund confirmation mismatch",409);
  }
  if (!paymentMatches && referenceMatches)
    logServiceTrace("v1/wallets/refund-provider","refund.reference.verified","Refund verified by exact purchase reference and amount",{
      refundId:row.id,providerRefundId:id,providerPaymentId:row.paymentId,responsePaymentId:String(data.paymentId),
    });
  // Unknown statuses stay pending rather than releasing coins or claiming success.
  return {id,status:refundStatuses[data.status.toLowerCase()] ?? "PROCESSING"};
}
export const flutterwaveRefundProvider = {
  environment:flutterwaveRefundEnvironment,
  verifyPayment:verifyFlutterwaveRefundPayment,
  createRefund:createFlutterwaveRefund,
  readRefund:readFlutterwaveRefund,
  refundResult:flutterwaveRefundResult,
};
