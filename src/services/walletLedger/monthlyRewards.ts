import {Prisma} from '@prisma/client';

/** Monthly category policy. All amounts are integer hundredths of a coin. */
export const MONTHLY_REWARD_CAP = 50_000_000;
export function monthlyRewardTier(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid participant count');
  const qualifyingPercent = count <= 5_000_000 ? 20 : count <= 10_000_000 ? 25 : count <= 50_000_000 ? 30 : count <= 100_000_000 ? 32 : 35;
  return {qualifyingPercent, poolPercent: qualifyingPercent + 5,
    winners: Number(BigInt(count) * BigInt(qualifyingPercent) / 100n)};
}
export type MonthlyRewardCurve = {
  winners: number; pool: number; budget: number; unallocated: number;
  minimum: number; maximum: number; shape: number; remainder: number; cappedRanks: number;
};
// A bounded exponential curve has a closed-form sum: fitting it does not require
// repeatedly loading/summing millions of players. Subtracting its endpoint fixes
// the last rank at the minimum; reflecting it also supports cap-constrained pools.
function weight(rank: number, count: number, shape: number): number {
  if (rank === 1) return 1;
  if (rank === count) return 0;
  if (shape < 0) return 1 - weight(count - rank + 1, count, -shape);
  const x = (rank - 1) / (count - 1);
  if (shape < 1e-6) return 1 - x;
  return Math.exp(-shape * x) * -Math.expm1(-shape * (1 - x)) / -Math.expm1(-shape);
}
function weightSum(count: number, shape: number): number {
  if (shape < 0) return count - weightSum(count, -shape);
  if (shape < 1e-6) return count / 2;
  const step = shape / (count - 1), endpoint = Math.exp(-shape);
  const geometric = -Math.expm1(-step * count) / -Math.expm1(-step);
  return (geometric - count * endpoint) / -Math.expm1(-shape);
}
function floorReward(plan: MonthlyRewardCurve, rank: number): number {
  if (plan.winners === 1) return plan.budget;
  return Math.min(MONTHLY_REWARD_CAP, Math.floor(plan.minimum +
    (plan.maximum - plan.minimum) * weight(rank, plan.winners, plan.shape)));
}
export function createMonthlyRewardCurve(pool: number, winners: number): MonthlyRewardCurve {
  if (!Number.isSafeInteger(pool) || pool < 0 || !Number.isSafeInteger(winners) || winners < 0) throw new Error('Invalid reward budget');
  const capacity = BigInt(winners) * BigInt(MONTHLY_REWARD_CAP);
  const budget = Number(BigInt(pool) < capacity ? BigInt(pool) : capacity);
  const minimum = winners ? Math.max(Number(BigInt(budget) * 9n / (10n * BigInt(winners))),
    Number(BigInt(budget) - BigInt(winners - 1) * BigInt(MONTHLY_REWARD_CAP))) : 0;
  const desiredMaximum = winners ? Math.max(1, Number(BigInt(budget) * 5n / BigInt(winners))) : 0;
  const maximum = winners ? Math.min(MONTHLY_REWARD_CAP, desiredMaximum,
    budget - minimum * (winners - 1)) : 0;
  const plan: MonthlyRewardCurve = {winners, pool, budget, unallocated: pool - budget,
    minimum, maximum, shape: 0, remainder: 0, cappedRanks: 0};
  if (!winners || !budget) return plan;
  if (winners > 1 && maximum > minimum) {
    const target = (budget - minimum * winners) / (maximum - minimum);
    // Endpoint constraints may only be achievable by a step at integer precision.
    if (target <= 1) plan.shape = 1e15;
    else if (target >= winners - 1) plan.shape = -1e15;
    else {
      let low = -1, high = 1;
      while (weightSum(winners, low) < target) low *= 2;
      while (weightSum(winners, high) > target) high *= 2;
      for (let i = 0; i < 80; i++) {
        const middle = (low + high) / 2;
        if (weightSum(winners, middle) > target) low = middle;
        else high = middle;
      }
      plan.shape = (low + high) / 2;
    }
  }
  let allocated = 0;
  for (let rank = 1; rank <= winners; rank++) {
    const amount = floorReward(plan, rank);
    allocated += amount;
    // Protect exact maximum targets from the final cent allocation too.
    if (amount === plan.maximum) plan.cappedRanks++;
  }
  plan.remainder = budget - allocated;
  if (plan.remainder < 0 || plan.remainder > winners - plan.cappedRanks) throw new Error('Reward curve rounding failed');
  return plan;
}
export function monthlyRewardAtRank(plan: MonthlyRewardCurve, rank: number): number {
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > plan.winners) throw new Error('Invalid reward rank');
  const extra = rank > plan.cappedRanks && rank <= plan.cappedRanks + plan.remainder ? 1 : 0;
  return floorReward(plan, rank) + extra;
}

/** Bonus spending is explicitly offset against actual coin spending for funding. */
export function monthlyRewardFunding(coins: string, bonus: string, poolPercent: number) {
  const actualCoins = new Prisma.Decimal(coins), bonusSpent = new Prisma.Decimal(bonus);
  if (!actualCoins.isFinite() || actualCoins.isNegative() || !bonusSpent.isFinite() || bonusSpent.isNegative()
    || !Number.isInteger(poolPercent) || poolPercent < 0 || poolPercent > 100) throw new Error('Invalid monthly reward funding');
  const fundingBalance = Prisma.Decimal.max(0, actualCoins.minus(bonusSpent));
  const pool = fundingBalance.mul(100).mul(poolPercent).div(100).floor();
  if (pool.gt(Number.MAX_SAFE_INTEGER)) throw new Error('Monthly reward pool exceeds exact integer capacity');
  return {coinsSpent: actualCoins.toFixed(2), bonusSpent: bonusSpent.toFixed(2),
    fundingBalance: fundingBalance.toFixed(2), poolMinor: pool.toNumber()};
}
