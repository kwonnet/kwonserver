import {type BachsPaymentMetadata,validateCryptoRefundAddress} from '@/utils/bachs';
import prisma from "@/db";
import { Prisma, PurchaseRefund } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import {
  cents,
  lockWallets,
  moneyJson,
  WalletError,
} from "@/services/walletLedger";
import {
  getRefundProvider,
  refundEnvironment,
  RefundProviderError,
} from "./refund-provider";
import { logServiceError, logServiceTrace } from "@/logger/events";

const refundResult = (row: PurchaseRefund) =>
  moneyJson({
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    coinsDebit: row.coinsDebit,
    bonusDebit: row.bonusDebit,
  });
export const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
type DB = Prisma.TransactionClient;
async function purchase(db: DB, id: string, userId: string) {
  const row = await db.transaction.findFirst({
    where: {
      id,
      userId,
      category: "COIN_PURCHASE",
      type: "CREDIT",
      currency: "COINS",
    },
    include: { purchaseRefund: true, package: { select: { name: true } } },
  });
  if (!row) throw new WalletError("Purchase not found", 404);
  const meta = row.metadata as {
    coins?: number;
    bonus?: number;
    providerId?: string;
    orderId?: string;
    paymentMethod?: string | null;
    isCrypto?: boolean | null;
    cryptoCurrency?: string | null;
    cryptoNetwork?: string | null;
  } | null;
  const fiat = await db.transaction.findFirst({
    where: {
      userId,
      txnRef: row.txnRef,
      exTxnRef: row.exTxnRef,
      gateway: row.gateway,
      category: "COIN_PURCHASE",
      type: "DEBIT",
      currency: { in: ["USD", "NGN"] },
    },
    orderBy: { createdAt: "asc" },
  });
  return { row, meta, fiat };
}
export function refundDeduction(
  coins: Prisma.Decimal,
  bonus: Prisma.Decimal,
  walletBonus: Prisma.Decimal,
  baseRate: Prisma.Decimal,
  bonusFee: Prisma.Decimal,
) {
  cents(coins);
  cents(bonus, true);
  cents(walletBonus, true);
  if (baseRate.lte(0) || bonusFee.lt(0) || bonusFee.gt(1))
    throw new WalletError("Refund charge rates are invalid", 503);
  const bonusDebit = Prisma.Decimal.min(bonus, walletBonus),
    bonusShortfall = bonus.minus(bonusDebit);
  const shortfallValue = baseRate.mul(bonusFee).mul(bonusShortfall);
  // Convert the shortfall's currency value back to coins, rounding up to wallet precision.
  const extraCoins = shortfallValue
    .div(baseRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
  return {
    coinsDebit: coins.add(extraCoins),
    bonusDebit,
    bonusShortfall,
    shortfallValue,
    baseRate,
    bonusFee,
  };
}
async function quote(db: DB, id: string, userId: string) {
  const p = await purchase(db, id, userId);
  if (p.row.purchaseRefund)
    throw new WalletError(
      "A refund has already been requested for this purchase",
      409,
    );
  const age = Date.now() - p.row.createdAt.getTime();
  if (p.row.status !== "COMPLETED" || age < 0 || age > REFUND_WINDOW_MS)
    throw new WalletError("The 14-day refund period has ended", 409);
  if (
    !["BACHS", "FLUTTERWAVE"].includes(p.row.gateway) ||
    !p.fiat ||
    !p.meta ||
    typeof p.meta.providerId !== "string" ||
    typeof p.meta.coins !== "number" ||
    typeof p.meta.bonus !== "number"
  )
    throw new WalletError(
      "This purchase has no supported original-payment details",
      409,
    );
  const originalCoins = new Prisma.Decimal(p.meta.coins),
    originalBonus = new Prisma.Decimal(p.meta.bonus);
  if (!originalCoins.add(originalBonus).eq(p.row.amount))
    throw new WalletError(
      "Original coin quantities could not be verified",
      409,
    );
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
  if (wallet.isLocked) throw new WalletError("Wallet is locked", 409);
  const rates = await db.chargeRate.findUnique({ where: { id: "default" } });
  if (!rates)
    throw new WalletError("Refund charge rates are not configured", 503);
  const deduction = refundDeduction(
    originalCoins,
    originalBonus,
    wallet.bonus,
    p.fiat.currency === "NGN" ? rates.ngnPrice : rates.price,
    rates.bonusFee,
  );
  if (wallet.coins.lt(deduction.coinsDebit))
    throw new WalletError(
      "Insufficient coins to return the purchased coins and cover the bonus shortfall",
      409,
    );
  return { p, wallet, deduction };
}
export async function getRefundQuote(id: string, userId: string) {
  const { p, deduction } = await quote(prisma, id, userId);
  const paymentDetails = p.row.gateway === "BACHS"
    ? typeof p.meta?.isCrypto === "boolean" && p.meta.paymentMethod
      ? p.meta as BachsPaymentMetadata
      : await getRefundProvider("BACHS").verifyPayment(p.meta!.providerId!,p.fiat!.currency,p.fiat!.amount,{purchaseId:id,checkoutId:p.row.exTxnRef,orderId:p.meta?.orderId})
    : undefined;
  return moneyJson({
    requiresRefundAddress: !!paymentDetails?.isCrypto,
    paymentMethod: paymentDetails?.paymentMethod ?? null,
    cryptoNetwork: paymentDetails?.cryptoNetwork ?? null,
    cryptoCurrency: paymentDetails?.cryptoCurrency ?? null,
    transactionId: id,
    amount: p.fiat!.amount,
    currency: p.fiat!.currency,
    coinsDebit: deduction.coinsDebit,
    bonusDebit: deduction.bonusDebit,
    bonusShortfall: deduction.bonusShortfall,
    shortfallValue: deduction.shortfallValue.toNumber(),
    baseRate: deduction.baseRate.toNumber(),
    bonusFee: deduction.bonusFee.toNumber(),
  });
}
export async function listPurchases(
  userId: string,
  page: number,
  limit: number,
) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new WalletError("Invalid pagination");
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      category: "COIN_PURCHASE",
      type: "CREDIT",
      currency: "COINS",
    },
    include: { purchaseRefund: true, package: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * limit,
    take: limit + 1,
  });
  const payments = await prisma.transaction.findMany({
    where: {
      userId,
      txnRef: { in: rows.map((row) => row.txnRef) },
      category: "COIN_PURCHASE",
      type: "DEBIT",
      currency: { not: "COINS" },
    },
  });
  return moneyJson({
    items: rows.slice(0, limit).map((row) => {
      const meta = row.metadata as any,
        age = Date.now() - row.createdAt.getTime();
      const paid = payments.find(
        (payment) =>
          payment.txnRef === row.txnRef &&
          payment.gateway === row.gateway &&
          payment.exTxnRef === row.exTxnRef,
      );
      return {
        id: row.id,
        paidAmount: paid?.amount ?? null,
        paidCurrency: paid?.currency ?? null,
        expired: age > REFUND_WINDOW_MS,
        name: row.package?.name ?? "Coin purchase",
        createdAt: row.createdAt,
        gateway: row.gateway,
        paymentMethod: meta?.paymentMethod ?? null,
        isCrypto: meta?.isCrypto ?? null,
        cryptoNetwork: meta?.cryptoNetwork ?? null,
        cryptoCurrency: meta?.cryptoCurrency ?? null,
        coins: meta?.coins ?? null,
        bonus: meta?.bonus ?? null,
        status: row.status,
        refundStatus: row.purchaseRefund?.status ?? null,
        refundId: row.purchaseRefund?.id ?? null,
        eligible:
          row.status === "COMPLETED" &&
          !row.purchaseRefund &&
          age >= 0 &&
          age <= REFUND_WINDOW_MS &&
          ["BACHS", "FLUTTERWAVE"].includes(row.gateway) &&
          typeof meta?.providerId === "string",
        refundUntil: new Date(row.createdAt.getTime() + REFUND_WINDOW_MS),
      };
    }),
    nextPage: rows.length > limit ? page + 1 : null,
  });
}
export async function requestPurchaseRefund(id: string, userId: string, expected: { coinsDebit: number; bonusDebit: number; refundAddress?: string; confirmCryptoNetwork?: boolean }) {
  const context = { purchaseId: id, userId };
  logServiceTrace("v1/wallets/refunds", "refund.requested", "Purchase refund requested", context);
  try {
    const receipt = await requestRefund(id, userId, expected);
    logServiceTrace("v1/wallets/refunds", "refund.request.finished", "Purchase refund request finished", { ...context, refundId: receipt.id, refundStatus: receipt.status });
    return receipt;
  } catch (error) {
    logServiceError("v1/wallets/refunds", "refund.request.failed", error, false, context);
    throw error;
  }
}
async function requestRefund(
  id: string,
  userId: string,
  expected: { coinsDebit: number; bonusDebit: number; refundAddress?: string; confirmCryptoNetwork?: boolean },
) {
  const existing = await prisma.purchaseRefund.findUnique({
    where: { transactionId: id },
  });
  if (existing) {
    if (existing.userId !== userId)
      throw new WalletError("Purchase not found", 404);
    logServiceTrace("v1/wallets/refunds", "refund.existing", "Existing refund reused", { purchaseId: id, refundId: existing.id, refundStatus: existing.status });
    return await processPurchaseRefund(existing.id);
  }
  let preview: Awaited<ReturnType<typeof quote>>;
  try {
    preview = await quote(prisma, id, userId);
  } catch (error) {
    const raced = await prisma.purchaseRefund.findUnique({
      where: { transactionId: id },
    });
    if (raced?.userId === userId) return await processPurchaseRefund(raced.id);
    logServiceError("v1/wallets/refunds", "requestPurchaseRefund", error);
    throw error;
  }
  logServiceTrace("v1/wallets/refunds", "refund.validation.passed", "Purchase eligibility and wallet deduction validated", { purchaseId: id, gateway: preview.p.row.gateway, providerPaymentId: preview.p.meta!.providerId, amount: preview.p.fiat!.amount.toString(), currency: preview.p.fiat!.currency, coinsDebit: preview.deduction.coinsDebit.toString(), bonusDebit: preview.deduction.bonusDebit.toString() });
  const provider = getRefundProvider(preview.p.row.gateway);
  const paymentDetails = await provider.verifyPayment(
    preview.p.meta!.providerId!,
    preview.p.fiat!.currency,
    preview.p.fiat!.amount,
    { purchaseId: id, ...(preview.p.row.gateway === 'BACHS' ? {checkoutId:preview.p.row.exTxnRef,orderId:preview.p.meta?.orderId} : {}) },
  );
  const refundAddress = paymentDetails && paymentDetails.isCrypto
    ? validateCryptoRefundAddress(expected.refundAddress,expected.confirmCryptoNetwork)
    : null;
  if (!refundAddress && expected.refundAddress) throw new WalletError('A refund address is only allowed for crypto purchases',400);
  logServiceTrace("v1/wallets/refunds", "refund.payment.verified", "Original gateway payment verified", { purchaseId: id, gateway: preview.p.row.gateway, providerPaymentId: preview.p.meta!.providerId });
  const refundId = createHash("sha256")
    .update(`purchase-refund:${id}`)
    .digest("hex");
  logServiceTrace("v1/wallets/refunds", "refund.reservation.started", "Wallet reservation transaction started", { purchaseId: id, refundId });
  // Reserve the exact coins and bonus under the same locks used by spending.
  await prisma.$transaction(
    async (tx) => {
      await lockWallets(tx, [userId]);
      if (await tx.purchaseRefund.findUnique({ where: { transactionId: id } }))
        return;
      const { p, wallet, deduction } = await quote(tx, id, userId);
      if (
        cents(expected.coinsDebit, true) !== cents(deduction.coinsDebit) ||
        cents(expected.bonusDebit, true) !== cents(deduction.bonusDebit, true)
      )
        throw new WalletError(
          "Your wallet balance changed. Review the refund again.",
          409,
        );
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          coins: { decrement: deduction.coinsDebit },
          bonus: { decrement: deduction.bonusDebit },
        },
      });
      await tx.purchaseRefund.create({
        data: {
          id: refundId,
          transactionId: id,
          userId,
          gateway: p.row.gateway,
          environment: refundEnvironment(p.row.gateway),
          paymentId: p.meta!.providerId!,
          ...(refundAddress ? {refundAddress} : {}),
          amount: p.fiat!.amount,
          currency: p.fiat!.currency,
          ...deduction,
        },
      });
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          txnRef: randomUUID(),
          exTxnRef: refundId,
          category: "COIN_REFUND",
          type: "DEBIT",
          currency: "COINS",
          source: "COINS_BONUS",
          gateway: p.row.gateway,
          status: "COMPLETED",
          amount: deduction.coinsDebit.add(deduction.bonusDebit),
          description: "Coins reserved for purchase refund",
          metadata: {
            purchaseId: id,
            coins: deduction.coinsDebit.toNumber(),
            bonus: deduction.bonusDebit.toNumber(),
          },
        },
      });
    },
    { timeout: 15000 },
  );
  logServiceTrace("v1/wallets/refunds", "refund.reservation.committed", "Wallet reservation transaction committed", { purchaseId: id, refundId });
  return await processPurchaseRefund(refundId);
}

async function settleRefund(
  row: PurchaseRefund,
  status: string,
  providerRefundId?: string,
) {
  logServiceTrace("v1/wallets/refunds", "refund.settlement.started", "Refund settlement transaction started", { refundId: row.id, purchaseId: row.transactionId, previousStatus: row.status, targetStatus: status, providerRefundId });
  let settlementApplied = false;
  const receipt = await prisma.$transaction(async (tx) => {
    await lockWallets(tx, [row.userId]);
    const current = await tx.purchaseRefund.findUniqueOrThrow({
      where: { id: row.id },
    });
    if (["SUCCEEDED", "FAILED"].includes(current.status))
      return refundResult(current);
    if (status === "FAILED") {
      // Restore a reserved deduction only after a definitive provider failure.
      const wallet = await tx.wallet.update({
        where: { userId: row.userId },
        data: {
          coins: { increment: current.coinsDebit },
          bonus: { increment: current.bonusDebit },
        },
      });
      await tx.transaction.create({
        data: {
          userId: row.userId,
          walletId: wallet.id,
          txnRef: randomUUID(),
          exTxnRef: row.id,
          category: "COIN_REFUND",
          type: "CREDIT",
          currency: "COINS",
          source: "COINS_BONUS",
          gateway: row.gateway,
          status: "COMPLETED",
          amount: current.coinsDebit.add(current.bonusDebit),
          description: "Failed refund: coins restored",
          metadata: {
            purchaseId: row.transactionId,
            coins: current.coinsDebit.toNumber(),
            bonus: current.bonusDebit.toNumber(),
          },
        },
      });
    } else if (status === "SUCCEEDED") {
      await tx.transaction.update({
        where: { id: row.transactionId },
        data: { status: "REFUNDED" },
      });
      await tx.transaction.create({
        data: {
          userId: row.userId,
          txnRef: randomUUID(),
          exTxnRef: row.id,
          category: "COIN_REFUND",
          type: "CREDIT",
          currency: row.currency,
          source: "FIAT",
          gateway: row.gateway,
          status: "COMPLETED",
          amount: row.amount,
          description: "Purchase refunded to original payment method",
          metadata: {
            purchaseId: row.transactionId,
            providerRefundId: providerRefundId ?? current.providerRefundId,
          },
        },
      });
    }
    const updated = await tx.purchaseRefund.update({
        where: { id: row.id },
        data: {
          status,
          ...(providerRefundId ? { providerRefundId } : {}),
          ...(["SUCCEEDED", "FAILED"].includes(status)
            ? { completedAt: new Date() }
            : {}),
        },
      });
    settlementApplied = true;
    return refundResult(updated);
  });
  logServiceTrace("v1/wallets/refunds", "refund.settlement.committed", "Refund settlement transaction committed", { refundId: row.id, purchaseId: row.transactionId, refundStatus: receipt.status, settlementApplied, coinsRestored: settlementApplied && receipt.status === "FAILED" ? row.coinsDebit.toString() : undefined, bonusRestored: settlementApplied && receipt.status === "FAILED" ? row.bonusDebit.toString() : undefined });
  return receipt;
}
export async function processPurchaseRefund(id: string, userId?: string) {
  logServiceTrace("v1/wallets/refunds", "refund.processing.started", "Refund processing started", { refundId: id, source: userId ? "user" : "service" });
  const row = await prisma.purchaseRefund.findUnique({ where: { id } });
  if (!row) throw new WalletError("Refund not found", 404);
  if (userId && row.userId !== userId)
    throw new WalletError("Refund not found", 404);
  const context = { refundId: id, purchaseId: row.transactionId, gateway: row.gateway, environment: row.environment, providerPaymentId: row.paymentId, providerRefundId: row.providerRefundId, refundStatus: row.status };
  if (["SUCCEEDED", "FAILED"].includes(row.status)) {
    logServiceTrace("v1/wallets/refunds", "refund.terminal.skipped", "Terminal refund requires no gateway call", context);
    return refundResult(row);
  }
  const provider = getRefundProvider(row.gateway);
  if (row.environment !== provider.environment())
    throw new WalletError("Refund belongs to another payment environment", 409);
  // Claim submission before contacting a provider; concurrent retries only reconcile.
  const claimed = await prisma.purchaseRefund.updateMany({
    where: { id, status: "RESERVED" },
    data: { status: "SUBMITTING" },
  });
  logServiceTrace("v1/wallets/refunds", "refund.submission.claimed", "Refund submission claim resolved", { ...context, action: claimed.count ? "submit" : "check", claimed: claimed.count > 0 });
  try {
    const response = claimed.count
      ? await provider.createRefund(row, async providerRefundId => {
          await prisma.purchaseRefund.update({where:{id},data:{providerRefundId}});
          row.providerRefundId = providerRefundId;
          context.providerRefundId = providerRefundId;
          logServiceTrace("v1/wallets/refunds", "refund.receipt.saved", "Accepted gateway refund ID saved before verification", {...context});
        })
      : await provider.readRefund(row);
    const result = provider.refundResult(row, response);
    logServiceTrace("v1/wallets/refunds", "refund.provider.verified", "Gateway refund response verified", { ...context, providerRefundId: result.id, targetStatus: result.status });
    return await settleRefund(row, result.status, result.id);
  } catch (error) {
    logServiceError("v1/wallets/refunds", "processPurchaseRefund", error, false, { ...context, action: claimed.count ? "submit" : "check", definitive: error instanceof RefundProviderError ? error.definitive : false });
    if (
      error instanceof RefundProviderError &&
      (claimed.count || error.submission) &&
      error.definitive
    )
      return await settleRefund(row, "FAILED");
    logServiceTrace("v1/wallets/refunds", "refund.reservation.retained", "Unconfirmed gateway outcome; wallet reservation retained", context);
    // Unknown outcomes retain the reservation. Never report a timeout as refunded.
    await prisma.purchaseRefund.updateMany({
      where: { id, status: { in: ["SUBMITTING", "PROCESSING", "REVIEW"] } },
      data: { updatedAt: new Date() },
    });
    return refundResult(
      await prisma.purchaseRefund.findUniqueOrThrow({ where: { id } }),
    );
  }
}
export async function reconcilePurchaseRefunds() {
  const reconciliationId = randomUUID();
  logServiceTrace("v1/wallets/refunds", "refund.reconciliation.started", "Refund reconciliation batch started", { reconciliationId });
  const rows = await prisma.purchaseRefund.findMany({
    where: {
      status: { in: ["RESERVED", "SUBMITTING", "PROCESSING", "REVIEW"] },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  logServiceTrace("v1/wallets/refunds", "refund.reconciliation.loaded", "Outstanding refunds loaded", { reconciliationId, count: rows.length });
  for (const row of rows) {
    try {
      logServiceTrace("v1/wallets/refunds", "refund.reconciliation.item", "Checking outstanding refund", { reconciliationId, refundId: row.id, purchaseId: row.transactionId, refundStatus: row.status });
      await processPurchaseRefund(row.id);
    } catch (error) {
      logServiceError("v1/wallets/refunds", "reconcilePurchaseRefunds", error, false, { reconciliationId, refundId: row.id, purchaseId: row.transactionId });
      await prisma.purchaseRefund.updateMany({
        where: {
          id: row.id,
          status: { in: ["RESERVED", "SUBMITTING", "PROCESSING", "REVIEW"] },
        },
        data: { updatedAt: new Date() },
      });
    }
  }
  logServiceTrace("v1/wallets/refunds", "refund.reconciliation.finished", "Refund reconciliation batch finished", { reconciliationId, count: rows.length });
}
