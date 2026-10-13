import { WalletError, cents } from "@/services/walletLedger";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { logServiceError, logServiceTrace } from "@/logger/events";
import { safeLogText } from "@/logger/sanitize";

export type RefundHttpProvider = {
  gateway: string;
  baseUrl: string;
  secret: string | undefined;
  environment: string;
  parseResponse: (response: any, path: string, status: number) => any;
};

export class RefundProviderError extends WalletError {
  submission = false;
  constructor(public definitive: boolean, cause?: Error) {
    super("The payment provider could not accept this refund", 503);
    this.name = "RefundProviderError";
    this.cause = cause;
  }
}
export function providerFailure(gateway: string, path: string, status: number, body: unknown, definitive: boolean) {
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
export async function refundRequest(
  provider: RefundHttpProvider,
  path: string,
  body?: object,
  key?: string,
  context: Record<string, unknown> = {},
) {
  const { gateway } = provider;
  const started = performance.now();
  const trace = { ...context, gateway, environment: provider.environment, providerAttemptId: randomUUID(), method: body ? "POST" : "GET", endpoint: path.split("?")[0] };
  let rejectionDetails: Record<string,unknown> = {};
  logServiceTrace("v1/wallets/refund-provider", "request.started", "Refund gateway request started", trace);
  try {
    const base = provider.baseUrl;
    const secret = provider.secret;
    if (!secret) throw new WalletError("Payment provider is unavailable", 503);
    const response = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
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
      if (gateway === 'BACHS' && response.status === 400) rejectionDetails = {
        providerHttpStatus: response.status,
        providerRequestId: response.headers.get('x-request-id'),
        providerErrorDetails: bachsErrorDetails(details,body),
      };
      const error = providerFailure(gateway, path, response.status, details,
        [400, 401, 403, 404, 422].includes(response.status));
      error.submission = body !== undefined;
      throw error;
    }
    const result = await response.json();
    const parsed = provider.parseResponse(result, path, response.status);
    const data = Array.isArray(parsed?.data) ? parsed.data : parsed;
    logServiceTrace("v1/wallets/refund-provider", "request.accepted", "Refund gateway response parsed", { ...trace, providerStatus: typeof data?.status === "string" ? data.status : undefined, providerRefundId: data?.refund_id ?? data?.id, isRefundable: typeof data?.is_refundable === "boolean" ? data.is_refundable : undefined, resultCount: Array.isArray(data) ? data.length : undefined });
    return parsed;
  } catch (error) {
    logServiceError("v1/wallets/refund-provider", "request.failed", error, false, { ...trace, ...rejectionDetails, durationMs: Math.round(performance.now() - started) });
    throw error;
  }
}
// Keep Bachs' explanation and validation messages, never echoed request inputs.
function bachsErrorDetails(value:unknown,requestBody?:object):unknown {
  const address = (requestBody as {refund_address?:unknown}|undefined)?.refund_address;
  const clean = (item:unknown,depth=0):unknown => {
    if (depth>5) return '[TRUNCATED]';
    if (typeof item==='string') {
      let text=item;
      if (typeof address==='string' && address) text=text.split(address).join('[REDACTED_ADDRESS]');
      return safeLogText(text).replace(/\b0x[0-9a-f]{40}\b/gi,'[REDACTED_ADDRESS]')
        .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g,'[REDACTED_ADDRESS]').slice(0,1000);
    }
    if (Array.isArray(item)) return item.slice(0,10).map(entry=>clean(entry,depth+1));
    if (item && typeof item==='object') return Object.fromEntries(Object.entries(item)
      .filter(([key])=>['error_code','detail','message','errors','loc','msg','type','field','code'].includes(key))
      .map(([key,entry])=>[key,clean(entry,depth+1)]));
    return typeof item==='number'||typeof item==='boolean'||item===null?item:undefined;
  };
  return clean(value);
}
export const refundAmount = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number")
    throw new WalletError("Provider refund amount is missing", 503);
  return cents(new Prisma.Decimal(value), true);
};
