import { BillingCycleEnum, Prisma } from '@prisma/client';
import { cents, WalletError } from './index';
export function subscriptionPrice(plan: { price: number | Prisma.Decimal; ngnPrice: number | Prisma.Decimal; discount: number; tier: any[] }, cycle: string, currency: string, tierId?: string, coinRate?: Prisma.Decimal, pricingCurrency: 'USD' | 'NGN' = 'USD') {
  if (![BillingCycleEnum.MONTHLY, BillingCycleEnum.YEARLY].includes(cycle as BillingCycleEnum)) throw new WalletError('Invalid billing cycle');
  if (!['USD', 'NGN', 'COINS'].includes(currency)) throw new WalletError('Unsupported currency');
  const tier = tierId ? plan.tier.find(t => t.id === tierId) : undefined;
  if ((tierId && !tier) || (plan.tier.length && !tier)) throw new WalletError('Select a valid plan tier');
  const local = currency === 'NGN' || currency === 'COINS' && pricingCurrency === 'NGN';
  // Older tiers only stored USD. Derive their local price proportionally, never charge every tier the base plan price.
  const tierNgn = tier?.ngnPrice ?? (tier?.price != null && new Prisma.Decimal(plan.price).gt(0) ? new Prisma.Decimal(plan.ngnPrice).mul(tier.price).div(plan.price).toDecimalPlaces(2) : plan.ngnPrice);
  const base = cents(local ? tierNgn : (tier?.price ?? plan.price));
  if (!Number.isFinite(plan.discount) || plan.discount < 0 || plan.discount >= 1) throw new WalletError('Invalid plan discount');
  const amount=(cycle === BillingCycleEnum.YEARLY ? Math.round(base * 12 * (1 - plan.discount)) : base) / 100;
  if(currency!=='COINS')return amount;
  if(!coinRate?.isFinite()||!coinRate.gt(0))throw new WalletError('Coin exchange rate unavailable',503);
  return new Prisma.Decimal(amount).div(coinRate).toDecimalPlaces(2,Prisma.Decimal.ROUND_UP).toNumber();
}

// Calendar billing uses UTC and clamps month-end/leap-day overflow.
export function nextBillingDate(start: Date, cycle: BillingCycleEnum) {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  if (cycle === BillingCycleEnum.MONTHLY) end.setUTCMonth(end.getUTCMonth() + 1);
  else if (cycle === BillingCycleEnum.YEARLY) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else throw new WalletError('Invalid billing cycle');
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

// Only Nigerian accounts can opt into local pricing; omitted currency preserves legacy defaults.
export function subscriptionPricingCurrency(countryIso3: string | null | undefined, requested?: 'USD' | 'NGN'): 'USD' | 'NGN' {
  const currency = requested ?? (countryIso3 === 'NGA' ? 'NGN' : 'USD');
  if (!['USD', 'NGN'].includes(currency) || (currency === 'NGN' && countryIso3 !== 'NGA'))
    throw new WalletError('Currency is not available for this account', 400);
  return currency;
}
export function subscriptionPriceQuote(plan: Parameters<typeof subscriptionPrice>[0], cycle: string, currency: 'USD' | 'NGN', tierId: string | undefined, coinRate: Prisma.Decimal) {
  const amount = subscriptionPrice(plan, cycle, currency, tierId);
  const originalAmount = cents(subscriptionPrice(plan, 'MONTHLY', currency, tierId)) * (cycle === 'YEARLY' ? 12 : 1) / 100;
  const coins = subscriptionPrice(plan, cycle, 'COINS', tierId, coinRate, currency);
  return {
    currency, amount, originalAmount,
    savings: (cents(originalAmount) - cents(amount)) / 100,
    discountPercent: cycle === 'YEARLY' ? Math.round(plan.discount * 10000) / 100 : 0,
    coins,
    originalCoins: new Prisma.Decimal(originalAmount).div(coinRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP).toNumber(),
  };
}
