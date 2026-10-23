import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, CoinWithdrawal } from "@prisma/client";
import { WalletError } from "@/services/walletLedger";
import { bachsApiOrigin } from "@/utils/bachs";
import { logServiceTrace, logServiceError } from "@/logger/events";
import { safeLogText } from "@/logger/sanitize";

export type WithdrawalGateway = "FLUTTERWAVE" | "BACHS";
export type WithdrawalDestination =
  | {
      type: "bank";
      bankCode: string;
      accountNumber: string;
      accountName?: string;
    }
  | { type: "crypto"; asset: string; address: string; confirmed: true };
export type WithdrawalPlan = {
  receiveAmount: string;
  receiveCurrency: string;
  expiresAt: Date;
  data: Record<string, any>;
};
export type WithdrawalOutcome = {
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  id?: string;
};
export type WithdrawalFeeFields = {
  estimatedProviderFee?: string | null;
  estimatedProviderFeeCurrency?: string | null;
  estimatedProviderFeeIncludesConversion?: boolean | null;
  providerFee?: string | null;
  providerFeeCurrency?: string | null;
  providerFeeIncludesConversion?: boolean | null;
  providerFeeSource?: string | null;
  providerConversionFee?: string | null;
  providerConversionFeeCurrency?: string | null;
  providerFeesRecordedAt?: Date | null;
};
// A missing fee is unknown, not a zero charge. Estimates never populate actuals.
export function withdrawalFeeEstimate(data: Record<string, any>): WithdrawalFeeFields {
  const fee = data.feeEstimate;
  return {
    estimatedProviderFee: fee ? decimal(fee.amount, true).toString() : null,
    estimatedProviderFeeCurrency: fee?.currency ?? null,
    estimatedProviderFeeIncludesConversion: fee?.includesConversion ?? null,
  };
}
export type SaveWithdrawal = (data: {
  stage?: string;
  providerId?: string;
  providerData?: Prisma.InputJsonValue;
} & WithdrawalFeeFields) => Promise<CoinWithdrawal>;
export class WithdrawalProviderError extends WalletError {
  constructor(
    public definitive: boolean,
    public providerStatus: number,
    public providerCode?: string,
  ) {
    super("The payout provider could not complete this request", 503);
  }
}
export function withdrawalEnvironment(gateway: WithdrawalGateway) {
  if (gateway === "BACHS") return bachsApiOrigin();
  if (!process.env.FLUTTERWAVE_SECK)
    throw new WalletError("Flutterwave withdrawals are not configured", 503);
  return process.env.FLUTTERWAVE_SECK.includes("_TEST")
    ? "flutterwave:test"
    : "flutterwave:live";
}
export function decimal(value: unknown, allowZero = false) {
  if (typeof value !== "number" && typeof value !== "string")
    throw new WalletError("Invalid payout provider amount", 503);
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(value);
  } catch (error) {
    logServiceError("v1/wallets/withdrawals", "provider.amount.invalid", error);
    throw new WalletError("Invalid payout provider amount", 503);
  }
  if (!d.isFinite() || d.lt(allowZero ? 0 : 0.000000000001))
    throw new WalletError("Invalid payout provider amount", 503);
  return d;
}
export function providerId(value: unknown): string {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !String(value).length ||
    String(value).length > 512
  )
    throw new WalletError("Payout provider did not return an identifier", 503);
  return String(value);
}
// Only operational identifiers and states belong in withdrawal diagnostics.
// Never pass destinations, provider payloads, names, email addresses or OTPs here.
type WithdrawalDiagnosticContext = {
  withdrawalId?: string; userId?: string; actorId?: string; gateway?: string; stage?: string;
  attempt?: number; destinationType?: string; decision?: string;
  providerAccountId?: string; providerEndpoint?: string; providerRequestId?: string | null;
  idempotencyRef?: string; method?: string; httpStatus?: number;
  durationMs?: number; outcome?: string; pageOffset?: number;
};
const withdrawalContext = new AsyncLocalStorage<WithdrawalDiagnosticContext>();
export function withdrawalDiagnostic(operation: string, context: WithdrawalDiagnosticContext = {}) {
  const values = {...withdrawalContext.getStore(), ...context};
  const allowed = ["withdrawalId", "userId", "actorId", "gateway", "stage", "attempt",
    "destinationType", "decision", "providerAccountId", "providerEndpoint",
    "providerRequestId", "idempotencyRef", "method", "httpStatus", "durationMs",
    "outcome", "pageOffset"] as const;
  logServiceTrace("v1/wallets/withdrawals", operation, `Withdrawal ${operation}`,
    Object.fromEntries(allowed.filter(key => values[key] !== undefined).map(key => [key, values[key]])));
}
export async function withdrawalStep<T>(
  operation: string, context: WithdrawalDiagnosticContext, work: () => Promise<T>,
): Promise<T> {
  return await withdrawalContext.run({...withdrawalContext.getStore(), ...context}, async () => {
    const started = performance.now();
    withdrawalDiagnostic(`${operation}.started`);
    try {
      const result = await work();
      withdrawalDiagnostic(`${operation}.completed`, {durationMs: Math.round(performance.now() - started)});
      return result;
    } catch (error) {
      // Log a fixed error description rather than potentially private provider text.
      logServiceError("v1/wallets/withdrawals", `${operation}.failed`,
        new Error("Withdrawal step failed; see lifecycle outcome and provider request ID"), false,
        {withdrawalId: withdrawalContext.getStore()?.withdrawalId});
      // Do not serialize exceptions or provider error messages into lifecycle traces.
      withdrawalDiagnostic(`${operation}.failed`, {
        durationMs: Math.round(performance.now() - started),
        outcome: error instanceof WithdrawalProviderError
          ? (error.definitive ? "provider_rejected" : "provider_uncertain")
          : error instanceof WalletError ? "validation_rejected"
          : operation === "provider.request" ? "provider_uncertain" : "internal_error",
        ...(error instanceof WalletError ? {httpStatus: error.status} : {}),
      });
      throw error;
    }
  });
}
export async function payoutRequest(
  gateway: WithdrawalGateway,
  path: string,
  body?: object,
  key?: string,
  account?: string,
) {
  return await withdrawalStep("provider.request", {gateway, providerEndpoint: path.split("?")[0], method: body ? "POST" : "GET", ...(account ? {providerAccountId: account} : {}), ...(key ? {idempotencyRef: key} : {})}, async () => {
  const environment = withdrawalEnvironment(gateway);
  const base =
    gateway === "BACHS"
      ? `${environment}/v1`
      : "https://api.flutterwave.com/v3";
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${gateway === "BACHS" ? process.env.BACHS_API_KEY : process.env.FLUTTERWAVE_SECK}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(account ? { "X-Account-Id": account } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  withdrawalDiagnostic("provider.response", {
    gateway, httpStatus: response.status,
    providerRequestId: response.headers.get("x-request-id"),
  });
  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    logServiceError(
      "v1/wallets/withdrawals",
      "provider.response.invalid",
      error,
      false,
      { gateway, httpStatus: response.status },
    );
    throw new WithdrawalProviderError(false, response.status);
  }
  if (
    !response.ok ||
    (gateway === "FLUTTERWAVE" && data.status !== "success")
  ) {
    const code =
      typeof data.error_code === "string" ? data.error_code : undefined;
    // Duplicates/timeouts/concurrent idempotent requests are uncertain, never proof of failure.
    const duplicate =
      gateway === "FLUTTERWAVE" &&
      typeof data.message === "string" &&
      data.message.toLowerCase().includes("reference");
    const definitive =
      [400, 401, 403, 422].includes(response.status) && !duplicate;
    withdrawalDiagnostic("provider.rejected", {
      gateway, httpStatus: response.status,
      outcome: definitive ? "provider_rejected" : "provider_uncertain",
      providerRequestId: response.headers.get("x-request-id"),
    });
    throw new WithdrawalProviderError(definitive, response.status, code);
  }
  return gateway === "FLUTTERWAVE" ? data.data : data;
  });
}
export async function availableBalance(
  gateway: WithdrawalGateway,
  currency: string,
  account?: string,
  missingAsZero = false,
) {
  return await withdrawalStep("provider.balance", {gateway, ...(account ? {providerAccountId: account} : {})}, async () => {
  const result = await payoutRequest(
    gateway,
    "/balances",
    undefined,
    undefined,
    account,
  );
  const balances = gateway === "BACHS" ? result.balances : result;
  if (!Array.isArray(balances))
    throw new WalletError("Could not verify payout provider balance", 503);
  const balance = balances.find((b: any) => b.currency === currency);
  if (!balance && missingAsZero) return new Prisma.Decimal(0);
  if (!balance)
    throw new WalletError(
      "Payout provider has no available balance in this currency",
      503,
    );
  return decimal(balance.available_balance, true);
  });
}
export async function requireProviderBalance(
  gateway: WithdrawalGateway,
  currency: string,
  amount: Prisma.Decimal,
  account?: string,
) {
  return await withdrawalStep("provider.funding_check", {gateway, ...(account ? {providerAccountId: account} : {})}, async () => {
  if ((await availableBalance(gateway, currency, account)).lt(amount))
    throw new WalletError(
      "Withdrawals are temporarily unavailable: insufficient provider funds. Your coins have not been paid out.",
      503,
    );
  });
}
export const cryptoRoutes: Record<
  WithdrawalGateway,
  { id: string; label: string; asset: string; network: string }[]
> = {
  BACHS: [
    ["USDT_TRC20", "USDT · Tron"],
    ["USDT_BEP20", "USDT · BNB Chain"],
    ["USDT_ERC20", "USDT · Ethereum"],
    ["USDT_SOL", "USDT · Solana"],
    ["USDC_ERC20", "USDC · Ethereum"],
    ["USDC_BEP20", "USDC · BNB Chain"],
    ["USDC_SOL", "USDC · Solana"],
    ["USDC_BASE", "USDC · Base"],
  ].map(([id, label]) => ({ id, label, asset: id, network: id.split("_")[1] })),
  FLUTTERWAVE: [
    ["USDT_SOLANA", "USDT · Solana", "USDT", "SOLANA"],
    ["USDC_SOLANA", "USDC · Solana", "USDC", "SOLANA"],
    ["USDT_ETHEREUM", "USDT · Ethereum", "USDT", "ETHEREUM"],
    ["USDC_ETHEREUM", "USDC · Ethereum", "USDC", "ETHEREUM"],
    ["RLUSD_ETHEREUM", "RLUSD · Ethereum", "RLUSD", "ETHEREUM"],
    ["USDC_BASE", "USDC · Base", "USDC", "BASE"],
    ["USDT_POLYGON", "USDT · Polygon", "USDT", "POLYGON"],
    ["USDC_POLYGON", "USDC · Polygon", "USDC", "POLYGON"],
  ].map(([id, label, asset, network]) => ({ id, label, asset, network })),
};
export function validateWithdrawalDestination(
  destination: WithdrawalDestination,
  gateway: WithdrawalGateway,
  nigerian: boolean,
) {
  if (destination.type === "bank") {
    if (!nigerian)
      throw new WalletError("Bank withdrawals are available to Nigerian users");
    if (!destination.bankCode || !/^\d{10}$/.test(destination.accountNumber))
      throw new WalletError("A valid Nigerian bank account is required");
  } else {
    if (
      destination.type !== "crypto" ||
      !destination.confirmed ||
      !cryptoRoutes[gateway].some((route) => route.id === destination.asset)
    )
      throw new WalletError(
        "Choose a supported crypto asset and confirm its network",
      );
    const route = cryptoRoutes[gateway].find(
      (r) => r.id === destination.asset,
    )!;
    const evm = ["ETHEREUM", "BASE", "POLYGON", "BEP20", "ERC20"].includes(
      route.network,
    );
    if (evm && !/^0x[0-9a-fA-F]{40}$/.test(destination.address))
      throw new WalletError("Enter a valid address for the selected network");
    if (
      destination.address.length < 20 ||
      destination.address.length > 255 ||
      /\s/.test(destination.address)
    )
      throw new WalletError("Enter a valid wallet address");
  }
  return destination;
}
export async function withdrawalBanks(gateway: WithdrawalGateway) {
  return await withdrawalStep("bank.list", {gateway}, async () => {
  const response = await payoutRequest(
    gateway,
    gateway === "BACHS" ? "/reference/banks?country=NG" : "/banks/NG",
  );
  const banks =
    gateway === "BACHS"
      ? (response.banks ?? response.items ?? response)
      : response;
  if (!Array.isArray(banks))
    throw new WalletError("Could not retrieve banks", 503);
  return banks
    .filter((b: any) => b.code && b.name && !b.has_branches)
    .map((b: any) => ({ code: String(b.code), name: String(b.name) }));
  });
}
export async function resolveWithdrawalBank(
  gateway: WithdrawalGateway,
  bankCode: string,
  accountNumber: string,
) {
  return await withdrawalStep("bank.verification", {gateway}, async () => {
  if (!/^\d{10}$/.test(accountNumber))
    throw new WalletError("Enter a 10-digit bank account number");
  const banks = await withdrawalBanks(gateway);
  if (!banks.some((b) => b.code === bankCode))
    throw new WalletError("Choose a supported bank");
  const data = await payoutRequest(
    gateway,
    gateway === "BACHS" ? "/misc/bank-accounts/resolve" : "/accounts/resolve",
    gateway === "BACHS"
      ? { bank_code: bankCode, account_number: accountNumber, country: "NG" }
      : { account_bank: bankCode, account_number: accountNumber },
  );
  if (
    (gateway === "BACHS" && data.resolved !== true) ||
    typeof data.account_name !== "string" ||
    !data.account_name.trim() ||
    (data.account_number != null && data.account_number !== accountNumber)
  )
    throw new WalletError("Could not verify the bank account", 503);
  return { accountName: safeLogText(data.account_name) };
  });
}
