import { Prisma, PurchaseRefund } from "@prisma/client";
import { bachsApiOrigin } from "@/utils/bachs";
import { cents, WalletError } from "@/services/walletLedger";
import { logServiceError, logServiceTrace } from "@/logger/events";
import {
  refundRequest,
  refundAmount,
  RefundProviderError,
} from "./refund-http";

async function request(
  path: string,
  body?: object,
  key?: string,
  context: Record<string, unknown> = {},
) {
  const environment = bachsApiOrigin();
  return await refundRequest(
    {
      gateway: "BACHS",
      baseUrl: `${environment}/v1`,
      secret: process.env.BACHS_API_KEY,
      environment,
      parseResponse: (response) => response,
    },
    path,
    body,
    key,
    context,
  );
}
function checkEnvironment(row: PurchaseRefund) {
  if (row.environment !== bachsApiOrigin())
    throw new WalletError("Refund belongs to another payment environment", 409);
}
export async function verifyBachsRefundPayment(
  paymentId: string,
  currency: string,
  paid: Prisma.Decimal,
  context: Record<string, unknown> = {},
) {
  const data = await request(
    `/payments/${encodeURIComponent(paymentId)}`,
    undefined,
    undefined,
    { ...context, providerPaymentId: paymentId },
  );
  if (
    String(data.payment_id) !== paymentId ||
    data.currency !== currency ||
    refundAmount(data.amount) !== cents(paid) ||
    !["succeeded", "accepted", "underpaid", "overpaid"].includes(
      String(data.status).toLowerCase(),
    )
  )
    throw new WalletError("Original payment could not be verified", 409);
  if (data.amount_paid != null && refundAmount(data.amount_paid) < cents(paid))
    throw new WalletError("Original payment does not cover this refund", 409);
  if (data.is_refundable === false)
    throw new WalletError(
      "Bachs does not allow a refund for this payment. It cannot be refunded automatically; please contact support.",
      409,
    );
}
export async function createBachsRefund(
  row: PurchaseRefund,
  saveProviderId?: (id: string) => Promise<void>,
) {
  checkEnvironment(row);
  const response = await request(
    "/refunds",
    {
      charge_id: row.paymentId,
      reference: row.id,
      reason: "Coin purchase refund within 14 days",
      idempotency_key: row.id,
    },
    row.id,
    {
      refundId: row.id,
      purchaseId: row.transactionId,
      providerPaymentId: row.paymentId,
      amount: row.amount.toFixed(2),
      currency: row.currency,
    },
  );
  if (
    (typeof response?.refund_id !== "string" &&
      typeof response?.refund_id !== "number") ||
    String(response.refund_id).trim() === ""
  )
    throw new WalletError("Payment provider did not return a refund ID", 503);
  try {
    if (saveProviderId) await saveProviderId(String(response.refund_id));
    return response;
  } catch (error) {
    logServiceError(
      "v1/wallets/refund-provider",
      "refund.verification.failed",
      error,
      false,
      { refundId: row.id, providerRefundId: String(response.refund_id) },
    );
    if (error instanceof RefundProviderError)
      throw new RefundProviderError(false, error);
    throw error;
  }
}
export async function readBachsRefund(row: PurchaseRefund) {
  checkEnvironment(row);
  const context = {
    refundId: row.id,
    purchaseId: row.transactionId,
    providerPaymentId: row.paymentId,
    providerRefundId: row.providerRefundId,
  };
  if (row.providerRefundId)
    return await request(
      `/refunds/${encodeURIComponent(row.providerRefundId)}`,
      undefined,
      undefined,
      context,
    );
  try {
    return await request(
      `/refunds/by-charge/${encodeURIComponent(row.paymentId)}`,
      undefined,
      undefined,
      context,
    );
  } catch (error) {
    logServiceError(
      "v1/wallets/refund-provider",
      "refund.bachs.lookup.failed",
      error,
      false,
      context,
    );
    if (
      !(error instanceof RefundProviderError) ||
      (error.cause as { statusCode?: number } | undefined)?.statusCode !== 404
    )
      throw error;
  }
  const payment = await request(
    `/payments/${encodeURIComponent(row.paymentId)}`,
    undefined,
    undefined,
    context,
  );
  if (
    String(payment.payment_id) !== row.paymentId ||
    payment.currency !== row.currency ||
    refundAmount(payment.amount) !== cents(row.amount)
  )
    throw new WalletError("Original payment could not be verified", 409);
  // The payment object exposes refund IDs even if the by-charge lookup is unavailable.
  if (Array.isArray(payment.refunds) && payment.refunds.length) {
    for (const refundId of payment.refunds) {
      const refund = await request(
        `/refunds/${encodeURIComponent(String(refundId))}`,
        undefined,
        undefined,
        context,
      );
      if (refund.reference === row.id) return refund;
    }
    throw new WalletError(
      "Bachs payment has another refund; manual review is required",
      409,
    );
  }
  const age = Date.now() - row.createdAt.getTime();
  // Bachs retains idempotency keys for 24 hours. Never retry outside that window.
  if (
    row.status === "SUBMITTING" &&
    age >= 0 &&
    age < 24 * 60 * 60 * 1000 &&
    payment.is_refundable === true &&
    (payment.refunds === null || Array.isArray(payment.refunds))
  ) {
    logServiceTrace(
      "v1/wallets/refund-provider",
      "refund.bachs.retry",
      "Retrying the original Bachs request with the same idempotency key",
      context,
    );
    return await createBachsRefund(row);
  }
  throw new WalletError(
    "Bachs refund needs manual review before another submission",
    409,
  );
}
export function bachsRefundResult(row: PurchaseRefund, data: any) {
  const id = String(data?.refund_id);
  if (
    !id ||
    id === "undefined" ||
    id === "null" ||
    typeof data?.status !== "string"
  )
    throw new WalletError("Provider refund ID or status is missing", 503);
  if (
    String(data.charge_id) !== row.paymentId ||
    data.reference !== row.id ||
    refundAmount(data.requested_amount) !== cents(row.amount) ||
    (row.providerRefundId && id !== row.providerRefundId)
  ) {
    logServiceTrace(
      "v1/wallets/refund-provider",
      "refund.response.mismatch",
      "Refund response failed verification",
      {
        refundId: row.id,
        gateway: "BACHS",
        providerPaymentId: row.paymentId,
        responsePaymentId: String(data.charge_id),
        responseRefundId: id,
        expectedRefundId: row.providerRefundId,
        expectedAmount: row.amount.toString(),
        responseAmount: String(data.requested_amount),
      },
    );
    throw new WalletError("Refund confirmation mismatch", 409);
  }
  const status = data.status.toLowerCase();
  if (status === "success")
    return {
      id,
      status:
        data.refunded_amount == null
          ? "REVIEW"
          : refundAmount(data.refunded_amount) === cents(row.amount)
            ? "SUCCEEDED"
            : "REVIEW",
    };
  return { id, status: status === "failed" ? "FAILED" : "PROCESSING" };
}
export const bachsRefundProvider = {
  environment: bachsApiOrigin,
  verifyPayment: verifyBachsRefundPayment,
  createRefund: createBachsRefund,
  readRefund: readBachsRefund,
  refundResult: bachsRefundResult,
};
