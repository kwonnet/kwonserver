import { Prisma, CoinWithdrawal } from "@prisma/client";
import { WalletError } from "@/services/walletLedger";
import {logServiceError} from "@/logger/events";
import {
  withdrawalStep,
  withdrawalDiagnostic,
  withdrawalFeeEstimate,
  WithdrawalDestination,
  WithdrawalPlan,
  WithdrawalOutcome,
  SaveWithdrawal,
  payoutRequest,
  decimal,
  providerId,
  requireProviderBalance,
  availableBalance,
  cryptoRoutes,
  resolveWithdrawalBank,
} from "./withdrawal-provider";

async function transferFee(
  amount: Prisma.Decimal,
  currency: string,
  crypto: boolean,
  debitCurrency?: string,
) {
  const fees = await payoutRequest(
    "FLUTTERWAVE",
    `/transfers/fee?amount=${amount.toString()}&currency=${encodeURIComponent(currency)}&type=${crypto ? "crypto" : "account"}${crypto && debitCurrency && debitCurrency !== currency ? `&debit_currency=${encodeURIComponent(debitCurrency)}` : ""}`,
  );
  const fee = Array.isArray(fees)
    ? fees.find((f: any) => f.currency === currency)
    : null;
  if (!fee)
    throw new WalletError("Could not verify Flutterwave payout fees", 503);
  return fee;
}
async function usdFunding(receiveAmount: Prisma.Decimal, currency: string) {
  const cost = await payoutRequest(
    "FLUTTERWAVE",
    `/transfers/rates?amount=${receiveAmount.toString()}&destination_currency=${currency}&source_currency=USD`,
  );
  if (
    cost.source?.currency !== "USD" ||
    cost.destination?.currency !== currency ||
    !decimal(cost.destination.amount).eq(receiveAmount)
  )
    throw new WalletError("Could not verify payout funding requirement", 503);
  const fee = await transferFee(receiveAmount, currency, true, "USD");
  // Fiat-funded transfers charge fees separately in the debit wallet.
  if (fee.fee_amount_in_fiat_currency == null)
    throw new WalletError("Could not verify USD payout fees", 503);
  const sourceRequired = decimal(cost.source.amount)
    .add(decimal(fee.fee_amount_in_fiat_currency, true))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  await requireProviderBalance("FLUTTERWAVE", "USD", sourceRequired);
  return {sourceRequired, feeEstimate: {amount: decimal(fee.fee_amount_in_fiat_currency, true).toString(), currency: "USD", includesConversion: true}};
}
export async function prepareFlutterwaveWithdrawal(
  amount: Prisma.Decimal,
  destination: WithdrawalDestination,
): Promise<WithdrawalPlan> {
  return await withdrawalStep<WithdrawalPlan>(
    "provider.preparation",
    { gateway: "FLUTTERWAVE", destinationType: destination.type },
    async () => {
      let debitCurrency = "NGN",
        fiatFeesSeparate = false;
      let currency = "NGN",
        accountBank: string,
        accountNumber: string,
        beneficiaryName: string | undefined;
      let feeEstimate: {amount: string; currency: string; includesConversion: boolean};
      let transferAmount = amount,
        receiveAmount = amount,
        sourceRequired: Prisma.Decimal;
      if (destination.type === "bank") {
        const resolved = await resolveWithdrawalBank(
          "FLUTTERWAVE",
          destination.bankCode,
          destination.accountNumber,
        );
        beneficiaryName = resolved.accountName;
        accountBank = destination.bankCode;
        accountNumber = destination.accountNumber;
        const fee = await transferFee(amount, currency, false);
        const extra =
          fee.fee_type === "percentage"
            ? amount.mul(decimal(fee.fee, true)).div(100)
            : decimal(fee.fee, true);
        feeEstimate = {amount: extra.toString(), currency, includesConversion: false};
        sourceRequired = amount
          .add(extra)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
      } else {
        const route = cryptoRoutes.FLUTTERWAVE.find(
          (r) => r.id === destination.asset,
        )!;
        currency = route.asset;
        accountBank = route.network;
        accountNumber = destination.address;
        const rates = await payoutRequest(
          "FLUTTERWAVE",
          `/transfers/rates?amount=1&destination_currency=${currency}&source_currency=USD`,
        );
        if (
          rates.source?.currency !== "USD" ||
          rates.destination?.currency !== currency
        )
          throw new WalletError("Could not verify crypto exchange rate", 503);
        const rate = decimal(rates.rate);
        receiveAmount = amount
          .mul(rate)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
        transferAmount = receiveAmount;
        // Flutterwave deducts stablecoin fees from the transfer; gross them up so Kwonnet pays.
        for (let attempt = 0; attempt < 4; attempt++) {
          const fee = await transferFee(transferAmount, currency, true);
          const extra =
            fee.amount_minus_fee != null
              ? transferAmount.sub(decimal(fee.amount_minus_fee, true))
              : fee.fee_amount_in_crypto_currency != null
                ? decimal(fee.fee_amount_in_crypto_currency, true)
                : fee.fee_type === "percentage"
                  ? transferAmount.mul(decimal(fee.fee, true)).div(100)
                  : decimal(fee.fee, true);
          if (extra.isNegative())
            throw new WalletError("Invalid crypto transfer fee", 503);
          const next = receiveAmount
            .add(extra)
            .toDecimalPlaces(6, Prisma.Decimal.ROUND_UP);
          if (next.sub(transferAmount).abs().lte("0.000001")) {
            transferAmount = next;
            break;
          }
          transferAmount = next;
          if (attempt === 3)
            throw new WalletError(
              "Could not obtain a stable crypto fee quote",
              503,
            );
        }
        // Stablecoin fees are deducted from this gross transfer amount, so the
        // matching stablecoin wallet funds both the user's payout and our fee.
        sourceRequired = transferAmount;
        feeEstimate = {amount: transferAmount.sub(receiveAmount).toString(), currency, includesConversion: false};
        debitCurrency = currency;
        if (
          (await availableBalance("FLUTTERWAVE", currency, undefined, true)).lt(
            sourceRequired,
          )
        ) {
          const funding = await usdFunding(receiveAmount, currency);
          sourceRequired = funding.sourceRequired;feeEstimate = funding.feeEstimate;
          transferAmount = receiveAmount;
          debitCurrency = "USD";
          fiatFeesSeparate = true;
        }
      }
      await requireProviderBalance(
        "FLUTTERWAVE",
        debitCurrency,
        sourceRequired,
      );
      return {
        receiveAmount: receiveAmount.toString(),
        receiveCurrency: currency,
        expiresAt: new Date(Date.now() + 60000),
        data: {
          sourceRequired: sourceRequired.toString(),
          fiatFeesSeparate,
          feeEstimate,
          request: {
            account_bank: accountBank,
            account_number: accountNumber,
            amount: transferAmount.toNumber(),
            currency,
            debit_currency: debitCurrency,
            ...(beneficiaryName ? { beneficiary_name: beneficiaryName } : {}),
            narration: "Kwonnet coin withdrawal",
            skip_beneficiary_creation: "1",
          },
        },
      };
    },
  );
}
function flutterwaveNetworkMatches(currency: string, expected: string, actual: unknown) {
  if (actual === expected) return true;
  // Flutterwave receipts use these exact mainnet aliases for crypto request routes.
  // These aliases never apply to bank codes or change wallet-address comparison.
  return typeof actual === "string" &&
    cryptoRoutes.FLUTTERWAVE.some(route => route.asset === currency && route.network === expected) &&
    ((["SOLANA", "BASE", "POLYGON"].includes(expected) && actual === `${expected}_MAINNET`) ||
      (expected === "ETHEREUM" && actual === "ETH_MAINNET"));
}
export function flutterwaveWithdrawalOutcome(
  row: CoinWithdrawal,
  data: any,
): WithdrawalOutcome {
  const body = (row.providerData as any).request;
  const checks = {
    reference: data.reference === row.id,
    destination: String(data.account_number) === body.account_number,
    network: flutterwaveNetworkMatches(body.currency, body.account_bank, data.bank_code),
    currency: data.currency === body.currency,
    debit_currency: data.debit_currency == null || data.debit_currency === body.debit_currency,
    amount: decimal(data.amount).eq(body.amount),
    provider_id: !row.providerId || String(data.id) === row.providerId,
  };
  const mismatches = Object.entries(checks).filter(([, matches]) => !matches).map(([field]) => field);
  if (mismatches.length) {
    withdrawalDiagnostic("provider.response_mismatch", {
      gateway: "FLUTTERWAVE", withdrawalId: row.id,
      outcome: mismatches.join(","),
    });
    throw new WalletError("Payout response does not match this withdrawal", 409);
  }
  const status = String(data.status).toUpperCase();
  return {
    id: providerId(data.id),
    status: status === "SUCCESSFUL" ? "SUCCEEDED" : status === "FAILED" ? "FAILED" : "PROCESSING",
  };
}

export async function runFlutterwaveWithdrawal(
  row: CoinWithdrawal,
  save: SaveWithdrawal,
  guard?: () => Promise<void>,
): Promise<WithdrawalOutcome> {
  return await withdrawalStep<WithdrawalOutcome>(
    "provider.dispatch",
    { gateway: "FLUTTERWAVE", withdrawalId: row.id, stage: row.stage },
    async () => {
      let plan = row.providerData as any;
      let response: any;
      if (row.providerId)
        response = await payoutRequest(
          "FLUTTERWAVE",
          `/transfers/${encodeURIComponent(row.providerId)}`,
        );
      else if (row.stage === "PREPARED") {
        if (row.expiresAt.getTime() <= Date.now()) return { status: "FAILED" };
        if (
          plan.request.currency !== "NGN" &&
          plan.request.debit_currency === plan.request.currency &&
          (
            await availableBalance(
              "FLUTTERWAVE",
              plan.request.currency,
              undefined,
              true,
            )
          ).lt(decimal(plan.sourceRequired))
        ) {
          plan = {
            ...plan,
            fiatFeesSeparate: true,
            request: {
              ...plan.request,
              debit_currency: "USD",
              amount: decimal(row.receiveAmount).toNumber(),
            },
          };
        }
        if (!plan.fiatFeesSeparate)
          await requireProviderBalance(
            "FLUTTERWAVE",
            plan.request.debit_currency,
            decimal(plan.sourceRequired),
          );
        if (plan.fiatFeesSeparate) {
          const funding = await usdFunding(decimal(row.receiveAmount), plan.request.currency);
          plan = {...plan, sourceRequired: funding.sourceRequired.toString(), feeEstimate: funding.feeEstimate};
          if (!decimal(plan.request.amount).eq(decimal(row.receiveAmount)))
            throw new WalletError(
              "Payout amount does not match this withdrawal",
              409,
            );
        } else if (plan.request.currency !== "NGN") {
          const amount = decimal(plan.request.amount),
            fee = await transferFee(
              amount,
              plan.request.currency,
              true,
              plan.request.debit_currency,
            );
          const extra =
            fee.amount_minus_fee != null
              ? amount.sub(decimal(fee.amount_minus_fee, true))
              : fee.fee_amount_in_crypto_currency != null
                ? decimal(fee.fee_amount_in_crypto_currency, true)
                : fee.fee_type === "percentage"
                  ? amount.mul(decimal(fee.fee, true)).div(100)
                  : decimal(fee.fee, true);
          if (
            extra.isNegative() ||
            amount.sub(extra).lt(decimal(row.receiveAmount))
          )
            throw new WalletError(
              "Crypto fees changed. Please review a fresh withdrawal quote.",
              409,
            );
          if (plan.request.debit_currency === plan.request.currency) {
            plan = {...plan, feeEstimate: {amount: extra.toString(), currency: plan.request.currency, includesConversion: false}};
            await requireProviderBalance(
              "FLUTTERWAVE",
              plan.request.currency,
              amount,
            );
          } else {
            // Preserve the funding currency on existing, already-authorized fiat plans.
            const rates = await payoutRequest(
              "FLUTTERWAVE",
              `/transfers/rates?amount=${amount.toString()}&destination_currency=${plan.request.currency}&source_currency=USD`,
            );
            if (
              rates.source?.currency !== "USD" ||
              rates.destination?.currency !== plan.request.currency ||
              !decimal(rates.destination.amount).eq(amount)
            )
              throw new WalletError(
                "Could not verify current payout funding",
                503,
              );
            const fiatFee =
              fee.fee_amount_in_fiat_currency != null
                ? decimal(fee.fee_amount_in_fiat_currency, true)
                : extra.div(decimal(rates.rate));
            await requireProviderBalance(
              "FLUTTERWAVE",
              "USD",
              decimal(rates.source.amount).add(fiatFee),
            );
            plan = {...plan, feeEstimate: {amount: fiatFee.toString(), currency: "USD", includesConversion: true}};
          }
        } else {
          const fee = await transferFee(
            decimal(plan.request.amount),
            "NGN",
            false,
          );
          const extra =
            fee.fee_type === "percentage"
              ? decimal(plan.request.amount)
                  .mul(decimal(fee.fee, true))
                  .div(100)
              : decimal(fee.fee, true);
          await requireProviderBalance(
            "FLUTTERWAVE",
            "NGN",
            decimal(plan.request.amount).add(extra),
          );
          plan = {...plan, feeEstimate: {amount: extra.toString(), currency: "NGN", includesConversion: false}};
        }
        if (guard) await guard();
        row = await save({ stage: "PAYOUT_SUBMITTING", providerData: plan, ...withdrawalFeeEstimate(plan) });
        response = await payoutRequest(
          "FLUTTERWAVE",
          "/transfers",
          { ...plan.request, reference: row.id },
          row.id,
        );
      } else {
        // A lost POST response is reconciled by the unique reference, never sent again blindly.
        const transfers = await payoutRequest(
          "FLUTTERWAVE",
          `/transfers?reference=${encodeURIComponent(row.id)}`,
        );
        if (!Array.isArray(transfers))
          throw new WalletError("Could not reconcile payout", 503);
        response = transfers.find((item: any) => item.reference === row.id);
        if (!response) return { status: "PROCESSING" };
      }
      // Retain the authenticated provider's reference-bound transfer ID even if
      // another response field needs review. Saving an ID never settles coins.
      if (!row.providerId && response?.reference === row.id) {
        const id = providerId(response.id);
        await save({ providerId: id, stage: "PAYOUT_ACCEPTED" });
        row = { ...row, providerId: id, stage: "PAYOUT_ACCEPTED" };
        withdrawalDiagnostic("provider.transfer_id_saved", {
          gateway: "FLUTTERWAVE", withdrawalId: row.id, stage: row.stage,
        });
      }
      const outcome = flutterwaveWithdrawalOutcome(row, response);
      if (outcome.status !== "PROCESSING") {
        // The v3 transfer fee is charged in the debit wallet: native crypto
        // fees are deducted from crypto, fiat-funded fees are charged separately.
        const native = plan.request.debit_currency === plan.request.currency;
        const reported = native ? response.fee : response.fee_amount_in_fiat_currency ?? response.fee;
        // If Flutterwave supplies an explicit currency, it must agree with the
        // funding contract rather than silently labelling a different unit.
        const currency = native ? plan.request.currency : plan.request.debit_currency;
        if (reported != null && (!response.fee_currency || response.fee_currency === currency)) {
          let amount: string | undefined;
          try { amount = decimal(reported, true).toString(); }
          catch { logServiceError("v1/wallets/withdrawals", "provider.fee.invalid", new Error("Provider fee metadata was invalid"), false, {withdrawalId: row.id}); withdrawalDiagnostic("provider.fee_unavailable", {gateway: "FLUTTERWAVE", withdrawalId: row.id, outcome: "invalid_fee"}); }
          if (amount !== undefined) await save({providerFee: amount, providerFeeCurrency: currency,
            providerFeeIncludesConversion: !native, providerFeeSource: "PROVIDER",
            providerConversionFee: native ? "0" : null, providerConversionFeeCurrency: native ? currency : null,
            providerFeesRecordedAt: new Date()});
        }
      }
      return outcome;
    },
  );
}
