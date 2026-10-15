import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { transactionFee } from "@/services/walletLedger/fees";
it("adds the configured quiz fee to the full pool and deducts tip fees from gross coins", () => {
  expect(
    transactionFee(1000, new Prisma.Decimal("0.15"), "quiz"),
  ).toMatchObject({ gross: 100000, fee: 15000, total: 115000, rate: 0.15 });
  expect(transactionFee(100, 0.4, "tip")).toMatchObject({
    gross: 10000,
    fee: 4000,
    total: 10000,
    received: 6000,
  });
  expect(transactionFee(1000, 0.2, "quiz").total).toBe(120000);
});
it("uses integer fractional coins, rounding fees upward without losing value", () => {
  expect(transactionFee(500.01, 0.15, "quiz")).toMatchObject({
    gross: 50001,
    fee: 7501,
    total: 57502,
  });
  expect(transactionFee(0.03, 0.5, "tip")).toMatchObject({
    gross: 3,
    fee: 2,
    received: 1,
  });
  expect(transactionFee(1, 0, "quiz").fee).toBe(0);
  expect(transactionFee(1, 1, "quiz").total).toBe(200);
});
it.each([-1, 1.01, NaN, Infinity])("rejects unavailable fee rates %s", (rate) =>
  expect(() => transactionFee(100, rate, "quiz")).toThrow(),
);
it("rejects invalid amounts, a fully withheld tip, and fee totals beyond wallet bounds", () => {
  for (const value of [0, -1, 1.001, NaN, Infinity])
    expect(() => transactionFee(value, 0.15, "quiz")).toThrow();
  expect(() => transactionFee(10, 1, "tip")).toThrow();
  expect(() => transactionFee(10000000000, 0.15, "quiz")).toThrow();
});
