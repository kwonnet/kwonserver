import { BillingCycleEnum, Prisma } from '@prisma/client';
import { cents, WalletError } from './index';
export function subscriptionPrice(plan: { price: number | Prisma.Decimal; ngnPrice: number | Prisma.Decimal; discount: number; tier: any[] }, cycle: string, currency: string, tierId?: string) {
  if (![BillingCycleEnum.MONTHLY, BillingCycleEnum.YEARLY].includes(cycle as BillingCycleEnum)) throw new WalletError('Invalid billing cycle');
  if (!['USD', 'NGN', 'TZX'].includes(currency)) throw new WalletError('Unsupported currency');
  const tier = tierId ? plan.tier.find(t => t.id === tierId) : undefined;
  if ((tierId && !tier) || (plan.tier.length && !tier)) throw new WalletError('Select a valid plan tier');
  const base = cents(currency === 'NGN' ? (tier?.ngnPrice ?? plan.ngnPrice) : (tier?.price ?? plan.price));
  if (!Number.isFinite(plan.discount) || plan.discount < 0 || plan.discount >= 1) throw new WalletError('Invalid plan discount');
  return (cycle === BillingCycleEnum.YEARLY ? Math.round(base * 12 * (1 - plan.discount)) : base) / 100;
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
