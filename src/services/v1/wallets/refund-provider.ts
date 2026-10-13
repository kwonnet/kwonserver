import { bachsApiOrigin } from "@/utils/bachs";
import { WalletError, cents } from "@/services/walletLedger";
import { Prisma, PurchaseRefund } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { logServiceError, logServiceTrace } from "@/logger/events";
import { safeLogText } from "@/logger/sanitize";

export class RefundProviderError extends WalletError {
  constructor(public definitive: boolean, cause?: Error) {
    super("The payment provider could not accept this refund", 503);
    this.name = "RefundProviderError";
    this.cause = cause;
  }
}
function providerFailure(gateway: string, path: string, status: number, body: unknown, definitive: boolean) {
  const operation = path.endsWith("/verify") || path.startsWith("/payments/")
    ? "verify payment"
    : path.startsWith("/refunds/by-charge/") ? "find refund by payment"
    : path.startsWith("/refunds/") ? "retrieve refund"
    : path.startsWith("/refunds?") ? "list refunds"
    : path === "/refunds" || path.endsWith("/refund") ? "create refund"
    : "refund request";
  const code = (body as { error_code?: unknown } | null)?.error_code;
  // Log diagnostic fields without provider bodies or customer details.
  const cause = Object.assign(new Error(`${gateway} ${operation} returned HTTP ${status}`), {
    statusCode: status,
    ...(typeof code === "string" ? { code: safeLogText(code).slice(0,80) } : {}),
  });
  return new RefundProviderError(definitive, cause);
}
export function refundEnvironment(gateway: string) {
  return gateway === "BACHS"
    ? bachsApiOrigin()
    : process.env.FLUTTERWAVE_SECK?.includes("_TEST")
      ? "flutterwave:test"
      : "flutterwave:live";
}
// Flutterwave uses both snake_case and legacy PascalCase refund fields.
function flutterwaveRefund(data: any) {
  return { id: data?.id, tx_id: data?.transaction_id ?? data?.TransactionId ?? data?.tx_id,
    amount_refunded: data?.amount_refunded ?? data?.AmountRefunded,
    comment: data?.comment ?? data?.comments, status: data?.status };
}
async function request(
  gateway: string,
  path: string,
  body?: object,
  key?: string,
  context: Record<string, unknown> = {},
) {
  const started = performance.now();
  const trace = { ...context, gateway, environment: refundEnvironment(gateway), providerAttemptId: randomUUID(), method: body ? "POST" : "GET", endpoint: path.split("?")[0] };
  logServiceTrace("v1/wallets/refund-provider", "request.started", "Refund gateway request started", trace);
  try {
    const base =
      gateway === "BACHS"
        ? `${bachsApiOrigin()}/v1`
        : "https://api.flutterwave.com/v3";
    const secret =
      gateway === "BACHS"
        ? process.env.BACHS_API_KEY
        : process.env.FLUTTERWAVE_SECK;
    if (!secret) throw new WalletError("Payment provider is unavailable", 503);
    const response = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(gateway === "BACHS" && key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    logServiceTrace("v1/wallets/refund-provider", "request.response", "Refund gateway HTTP response received", { ...trace, providerHttpStatus: response.status, durationMs: Math.round(performance.now() - started), providerRequestId: response.headers.get("x-request-id") });
    if (!response.ok) {
      let details: unknown;
      try {
        details = await response.json();
      } catch (error) {
        logServiceError("v1/wallets/refund-provider", "readProviderError", error, true);
      }
      throw providerFailure(gateway, path, response.status, details,
        [400, 401, 403, 404, 422].includes(response.status));
    }
    const result = await response.json();
    const bareRefund = gateway === "FLUTTERWAVE" && result.status !== "error" &&
      (path.startsWith("/refunds/") || path.endsWith("/refund")) &&
      (typeof result.id === "number" || typeof result.id === "string") &&
      (typeof flutterwaveRefund(result).amount_refunded === "number" || typeof flutterwaveRefund(result).amount_refunded === "string");
    if (gateway === "FLUTTERWAVE" && result.status !== "success" && !bareRefund)
      throw providerFailure(gateway, path, response.status, result, false);
    const data = gateway === "BACHS" || bareRefund ? result : result.data;
    logServiceTrace("v1/wallets/refund-provider", "request.accepted", "Refund gateway response parsed", { ...trace, providerStatus: typeof data?.status === "string" ? data.status : undefined, providerRefundId: data?.refund_id ?? (gateway === "FLUTTERWAVE" ? data?.id : undefined), isRefundable: typeof data?.is_refundable === "boolean" ? data.is_refundable : undefined, resultCount: Array.isArray(data) ? data.length : undefined });
    if (gateway === "FLUTTERWAVE" && path.startsWith("/refunds?"))
      return { data, pageInfo: result.meta?.page_info };
    return data;
  } catch (error) {
    logServiceError("v1/wallets/refund-provider", "request.failed", error, false, { ...trace, durationMs: Math.round(performance.now() - started) });
    throw error;
  }
}
const amount = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number")
    throw new WalletError("Provider refund amount is missing", 503);
  return cents(new Prisma.Decimal(value), true);
};
export async function verifyRefundPayment(
  gateway: string,
  paymentId: string,
  currency: string,
  paid: Prisma.Decimal,
  context: Record<string, unknown> = {},
) {
  const data = await request(
    gateway,
    gateway === "BACHS"
      ? `/payments/${encodeURIComponent(paymentId)}`
      : `/transactions/${encodeURIComponent(paymentId)}/verify`,
    undefined, undefined, { ...context, providerPaymentId: paymentId },
  );
  if (
    String(gateway === "BACHS" ? data.payment_id : data.id) !== paymentId ||
    data.currency !== currency ||
    amount(data.amount) !== cents(paid) ||
    !["succeeded", "overpaid", "successful"].includes(
      String(data.status).toLowerCase(),
    )
  )
    throw new WalletError("Original payment could not be verified", 409);
  if (gateway === "BACHS" && data.is_refundable === false)
    throw new WalletError("Bachs does not allow a refund for this payment. Bank-transfer payments cannot be refunded automatically; please contact support.", 409);
}
export async function createProviderRefund(row: PurchaseRefund, saveProviderId?: (id: string) => Promise<void>) {
  if (row.environment !== refundEnvironment(row.gateway))
    throw new WalletError("Refund belongs to another payment environment", 409);
  const response = await request(
    row.gateway,
    row.gateway === "BACHS"
      ? "/refunds"
      : `/transactions/${encodeURIComponent(row.paymentId)}/refund`,
    row.gateway === "BACHS"
      ? {
          charge_id: row.paymentId,
          reference: row.id,
          amount: row.amount.toFixed(2),
          fee_bearer: "org",
          reason: "Coin purchase refund within 14 days",
          idempotency_key: row.id,
        }
      : {
          amount: row.amount.toNumber(),
          comments: `Coin purchase refund ${row.id}`,
        },
    row.id,
    { refundId: row.id, purchaseId: row.transactionId, providerPaymentId: row.paymentId, amount: row.amount.toFixed(2), currency: row.currency },
  );
  const returnedId = row.gateway === "BACHS" ? response?.refund_id : response?.id;
  if ((typeof returnedId !== "string" && typeof returnedId !== "number") || String(returnedId).trim() === "")
    throw new WalletError("Payment provider did not return a refund ID",503);
  const refundId = String(returnedId);
  // Verify the refund resource using data.id returned by the initiation call.
  try {
    // Persist the accepted receipt before any verification request can fail.
    if (saveProviderId) await saveProviderId(refundId);
    if (row.gateway !== "FLUTTERWAVE") return response;
    const verified = await readProviderRefund({ ...row, providerRefundId: refundId });
    if (String(verified?.id) !== refundId) throw new WalletError("Refund confirmation mismatch",409);
    return verified;
  } catch (error) {
    logServiceError("v1/wallets/refund-provider", "refund.verification.failed", error, false, { refundId: row.id, providerRefundId: refundId });
    // Initiation succeeded; a failed GET does not mean the refund was rejected.
    if (error instanceof RefundProviderError) throw new RefundProviderError(false,error);
    throw error;
  }
}
export async function readProviderRefund(row: PurchaseRefund) {
  const context = { refundId: row.id, purchaseId: row.transactionId, providerPaymentId: row.paymentId, providerRefundId: row.providerRefundId };
  if (row.environment !== refundEnvironment(row.gateway))
    throw new WalletError("Refund belongs to another payment environment", 409);
  if (row.providerRefundId)
    return await request(
      row.gateway,
      `/refunds/${encodeURIComponent(row.providerRefundId)}`,
      undefined, undefined, context,
    );
  if (row.gateway === "BACHS")
    return await request(
      row.gateway,
      `/refunds/by-charge/${encodeURIComponent(row.paymentId)}`,
      undefined, undefined, context,
    );
  // A timed-out Flutterwave POST must be found, never submitted a second time.
  for (let page = 1; page <= 20; page++) {
    const { data, pageInfo } = await request(
      row.gateway,
      `/refunds?from=${row.createdAt.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&currency=${encodeURIComponent(row.currency)}&page=${page}`,
      undefined, undefined, { ...context, page },
    );
    if (!Array.isArray(data))
      throw new WalletError("Unable to reconcile refund", 503);
    // The exact server-generated reference also identifies refunds whose provider transaction ID differs.
    const match = data.find((item) => flutterwaveRefund(item).comment === `Coin purchase refund ${row.id}`)
      ?? data.find((item) => String(flutterwaveRefund(item).tx_id) === row.paymentId);
    if (match) return match;
    if (!data.length || (Number.isInteger(pageInfo?.total_pages) && page >= pageInfo.total_pages)) break;
  }
  throw new WalletError("Refund confirmation is pending", 503);
}
export function providerRefundResult(row: PurchaseRefund, data: any) {
  if (row.gateway === "FLUTTERWAVE") data = flutterwaveRefund(data);
  const id = String(row.gateway === "BACHS" ? data.refund_id : data.id);
  if (!id || id === "undefined" || id === "null" || typeof data?.status !== "string")
    throw new WalletError("Provider refund ID or status is missing",503);
  const paymentId = row.gateway === "BACHS" ? data.charge_id : data.tx_id;
  const requestedAmount = row.gateway === "BACHS" ? data.requested_amount : data.amount_refunded;
  const paymentMatches = String(paymentId) === row.paymentId;
  const savedIdMatches = row.gateway === "FLUTTERWAVE" && !!row.providerRefundId && id === row.providerRefundId;
  const referenceMatches = row.gateway === "FLUTTERWAVE" && !row.providerRefundId && data.comment === `Coin purchase refund ${row.id}`;
  if ((!paymentMatches && !savedIdMatches && !referenceMatches) || amount(requestedAmount) !== cents(row.amount) ||
      (row.providerRefundId && id !== row.providerRefundId) ||
      (row.gateway === "BACHS" && data.reference !== row.id)) {
    logServiceTrace("v1/wallets/refund-provider", "refund.response.mismatch", "Refund response failed verification", {
      refundId: row.id, gateway: row.gateway, providerPaymentId: row.paymentId,
      responsePaymentId: String(paymentId), responseRefundId: id, expectedRefundId: row.providerRefundId,
      expectedAmount: row.amount.toString(), responseAmount: String(requestedAmount),
    });
    throw new WalletError("Refund confirmation mismatch",409);
  }
  if (!paymentMatches && referenceMatches)
    logServiceTrace("v1/wallets/refund-provider", "refund.reference.verified", "Refund verified by exact purchase reference and amount", {
      refundId: row.id, providerRefundId: id, providerPaymentId: row.paymentId, responsePaymentId: String(paymentId),
    });
  const status = String(data.status).toLowerCase();
  // Flutterwave 'completed' acknowledges initiation, not final disbursement.
  if (row.gateway === "FLUTTERWAVE" && status === "completed") return { id, status: "PROCESSING" };
  if (
    [
      "success",
      "successful",
      "succeeded",
      "completed",
      "completed-mpgs",
      "completed-offline",
      "completed-bank-transfer",
      "completed-momo",
      "completed-preauth",
    ].includes(status)
  ) {
    if (row.gateway === "BACHS" && amount(data.refunded_amount) !== cents(row.amount))
      return { id, status: "REVIEW" };
    return { id, status: "SUCCEEDED" };
  }
  return {
    id,
    status: ["failed", "cancelled", "canceled"].includes(status)
      ? "FAILED"
      : "PROCESSING",
  };
}
