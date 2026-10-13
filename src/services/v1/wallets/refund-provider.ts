import { bachsApiOrigin } from "@/utils/bachs";
import { WalletError, cents } from "@/services/walletLedger";
import { Prisma, PurchaseRefund } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { logServiceError, logServiceTrace } from "@/logger/events";

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
    ...(typeof code === "string" && /^[A-Z_]{1,80}$/.test(code) ? { code } : {}),
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
    if (gateway === "FLUTTERWAVE" && result.status !== "success")
      throw providerFailure(gateway, path, response.status, result, false);
    const data = gateway === "BACHS" ? result : result.data;
    logServiceTrace("v1/wallets/refund-provider", "request.accepted", "Refund gateway response parsed", { ...trace, providerStatus: typeof data?.status === "string" ? data.status : undefined, providerRefundId: data?.refund_id ?? (gateway === "FLUTTERWAVE" ? data?.id : undefined), isRefundable: typeof data?.is_refundable === "boolean" ? data.is_refundable : undefined, resultCount: Array.isArray(data) ? data.length : undefined });
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
export async function createProviderRefund(row: PurchaseRefund) {
  if (row.environment !== refundEnvironment(row.gateway))
    throw new WalletError("Refund belongs to another payment environment", 409);
  return await request(
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
    const data = await request(
      row.gateway,
      `/refunds?from=${row.createdAt.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&page=${page}`,
      undefined, undefined, { ...context, page },
    );
    if (!Array.isArray(data))
      throw new WalletError("Unable to reconcile refund", 503);
    const match = data.find((item) => String(item.tx_id) === row.paymentId);
    if (match) return match;
    if (!data.length) break;
  }
  throw new WalletError("Refund confirmation is pending", 503);
}
export function providerRefundResult(row: PurchaseRefund, data: any) {
  const id = String(row.gateway === "BACHS" ? data.refund_id : data.id);
  if (
    !id ||
    id === "undefined" ||
    String(row.gateway === "BACHS" ? data.charge_id : data.tx_id) !==
      row.paymentId ||
    (row.gateway === "BACHS" && data.reference !== row.id) ||
    amount(
      row.gateway === "BACHS" ? data.requested_amount : data.amount_refunded,
    ) !== cents(row.amount)
  )
    throw new WalletError("Refund confirmation mismatch", 409);
  const status = String(data.status).toLowerCase();
  if (
    [
      "success",
      "successful",
      "succeeded",
      "completed",
      "completed-mpgs",
      "completed-offline",
    ].includes(status)
  ) {
    if (
      row.gateway === "BACHS" &&
      amount(data.refunded_amount) !== cents(row.amount)
    )
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
