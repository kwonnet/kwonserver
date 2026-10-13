import { bachsApiOrigin } from "@/utils/bachs";
import { WalletError, cents } from "@/services/walletLedger";
import { Prisma, PurchaseRefund } from "@prisma/client";

export class RefundProviderError extends WalletError {
  constructor(public definitive: boolean) {
    super("The payment provider could not accept this refund", 503);
  }
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
) {
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
  if (!response.ok)
    throw new RefundProviderError(
      [400, 401, 403, 404, 422].includes(response.status),
    );
  const result = await response.json();
  if (gateway === "FLUTTERWAVE" && result.status !== "success")
    throw new RefundProviderError(false);
  return gateway === "BACHS" ? result : result.data;
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
) {
  const data = await request(
    gateway,
    gateway === "BACHS"
      ? `/payments/${encodeURIComponent(paymentId)}`
      : `/transactions/${encodeURIComponent(paymentId)}/verify`,
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
  );
}
export async function readProviderRefund(row: PurchaseRefund) {
  if (row.environment !== refundEnvironment(row.gateway))
    throw new WalletError("Refund belongs to another payment environment", 409);
  if (row.gateway === "BACHS")
    return await request(
      row.gateway,
      `/refunds/by-charge/${encodeURIComponent(row.paymentId)}`,
    );
  if (row.providerRefundId)
    return await request(
      row.gateway,
      `/refunds/${encodeURIComponent(row.providerRefundId)}`,
    );
  // A timed-out Flutterwave POST must be found, never submitted a second time.
  for (let page = 1; page <= 20; page++) {
    const data = await request(
      row.gateway,
      `/refunds?from=${row.createdAt.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&page=${page}`,
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
