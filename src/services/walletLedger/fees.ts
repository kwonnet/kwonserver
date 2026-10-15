import { Prisma } from "@prisma/client";
import { cents, WalletError } from "./index";
export function transactionFee(
  amount: number | Prisma.Decimal,
  rate: number | Prisma.Decimal,
  kind: "tip" | "quiz",
) {
  const gross = cents(amount),
    feeRate = new Prisma.Decimal(rate);
  if (
    !feeRate.isFinite() ||
    feeRate.lt(0) ||
    feeRate.gt(1) ||
    (kind === "tip" && feeRate.eq(1))
  )
    throw new WalletError("Transaction fee unavailable", 503);
  const fee = new Prisma.Decimal(gross).mul(feeRate).ceil().toNumber();
  const total = kind === "quiz" ? gross + fee : gross;
  if (total > 1000000000000)
    throw new WalletError("Transaction amount is too large");
  return { gross, fee, total, received: gross - fee, rate: feeRate.toNumber() };
}
