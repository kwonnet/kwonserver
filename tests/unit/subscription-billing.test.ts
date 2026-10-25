import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  subscriptionProviderPlan: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  subscriptionTrialOffer: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  subscriptionTrialUse: { findUnique: vi.fn() },
  subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  country: { findUnique: vi.fn() },
  chargeRate: { findUniqueOrThrow: vi.fn() },
  subscriptionCheckout: { findFirst: vi.fn() },
}));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/helper', () => ({ syncPrismaUserWalletToRedis: vi.fn() }));
vi.mock('@/services/v1/games', () => ({ syncUserRedisWalletToPrisma: vi.fn() }));
vi.mock('@/cron/utils', () => ({
  addSubscriptionCronJob: vi.fn(),
  removeSubscriptionCronJob: vi.fn(),
}));
vi.mock('@/cron/jobs/queue', () => ({
  subscriptionCatalogQueue: { add: vi.fn(async () => ({ id: 'catalog' })) },
}));
import { subscriptionPrice, subscriptionPriceQuote, subscriptionPricingCurrency } from '@/services/walletLedger/pricing';
import {
  subscriptionCatalogSpec,
  subscriptionEnvironment,
  verifyFlutterwaveSubscriptionSignature,
  assertSubscriptionPayment,
  syncSubscriptionCatalog,
  createSubscriptionCheckout,
  createSubscriptionTrialOffer,
  getSubscriptionCheckoutStatus,
} from '@/services/v1/subscriptions';
const plan = {
  id: 'plan',
  name: 'Premium',
  price: new Prisma.Decimal(15),
  ngnPrice: new Prisma.Decimal(18000),
  discount: 0.1,
  accountType: 'PERSONAL',
  tier: [{ id: 'plus', name: 'Plus', price: 30, message: '' }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('FLUTTERWAVE_SECK', 'FLWSECK_TEST-one');
  vi.stubEnv('BACHS_API_KEY', 'sk_sandbox_one');
  vi.stubEnv('BACHS_WEBHOOK_SECRET', 'secret');
  db.subscriptionPlan.findMany.mockResolvedValue([plan]);
  db.subscriptionTrialOffer.findMany.mockResolvedValue([]);
  db.subscriptionProviderPlan.updateMany.mockResolvedValue({ count: 1 });
  db.subscriptionProviderPlan.update.mockImplementation(async ({ data }) => data);
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ['USD', 0.015, 2000],
  ['NGN', 18, 2000],
] as const)(
  'converts the correct %s price to coins through its charge rate',
  (currency, rate, coins) => {
    expect(
      subscriptionPrice(plan, 'MONTHLY', 'COINS', 'plus', new Prisma.Decimal(rate), currency),
    ).toBe(coins);
    expect(
      subscriptionPrice(plan, 'YEARLY', 'COINS', 'plus', new Prisma.Decimal(rate), currency),
    ).toBe(21600);
  },
);
it('uses explicit Nigerian tier pricing and rounds coins upward to avoid undercharging', () => {
  expect(
    subscriptionPrice(
      { ...plan, tier: [{ ...plan.tier[0], ngnPrice: 18001 }] },
      'MONTHLY',
      'COINS',
      'plus',
      new Prisma.Decimal(18),
      'NGN',
    ),
  ).toBe(1000.06);
});
it.each([0, -1, NaN])('rejects unusable coin rates %s', (rate) => {
  expect(() =>
    subscriptionPrice(plan, 'MONTHLY', 'COINS', 'plus', new Prisma.Decimal(rate)),
  ).toThrow('exchange rate');
});
it.each(['FLUTTERWAVE', 'BACHS'] as const)(
  'isolates %s mappings across merchant keys and environments',
  (gateway) => {
    const spec = subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', gateway);
    const before = spec.id;
    vi.stubEnv(
      gateway === 'BACHS' ? 'BACHS_API_KEY' : 'FLUTTERWAVE_SECK',
      gateway === 'BACHS' ? 'sk_sandbox_other' : 'FLWSECK_TEST-other',
    );
    expect(subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', gateway).id).not.toBe(before);
  },
);
it('changes provider mapping versions for tier, interval, price and trial changes', () => {
  const id = subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', 'BACHS').id;
  expect(subscriptionCatalogSpec(plan, 'plus', 'YEARLY', 'USD', 'BACHS').id).not.toBe(id);
  expect(subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', 'BACHS', 7).id).not.toBe(id);
  expect(
    subscriptionCatalogSpec(
      { ...plan, tier: [{ ...plan.tier[0], price: 31 }] },
      'plus',
      'MONTHLY',
      'USD',
      'BACHS',
    ).id,
  ).not.toBe(id);
});
it('creates indefinite Flutterwave plans and native Bachs trials using documented request shapes', () => {
  expect(
    subscriptionCatalogSpec(plan, 'plus', 'YEARLY', 'NGN', 'FLUTTERWAVE').request,
  ).toMatchObject({ amount: 388800, currency: 'NGN', interval: 'yearly' });
  expect(
    subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', 'FLUTTERWAVE').request,
  ).not.toHaveProperty('duration');
  expect(subscriptionCatalogSpec(plan, 'plus', 'YEARLY', 'USD', 'BACHS', 14).request).toMatchObject(
    {
      price: { amount: '324.00', currency: 'USD' },
      billing_cycle: { interval: 'year', frequency: 1 },
      trial_period: { interval: 'day', frequency: 14 },
    },
  );
});
it.each([undefined, '', 'incorrect', 42])(
  'rejects invalid Flutterwave webhook signature %s',
  (value) => {
    vi.stubEnv('FLUTTERWAVE_SECRET_HASH', 'expected');
    expect(verifyFlutterwaveSubscriptionSignature(value)).toBe(false);
  },
);
it('uses the configured webhook secret and refuses to accept unconfigured webhooks', () => {
  vi.stubEnv('FLUTTERWAVE_SECRET_HASH', 'secret');
  expect(verifyFlutterwaveSubscriptionSignature('secret')).toBe(true);
  vi.stubEnv('FLUTTERWAVE_SECRET_HASH', '');
  expect(verifyFlutterwaveSubscriptionSignature('')).toBe(false);
});
const snapshot: any = {
  id: 'checkout',
  amount: new Prisma.Decimal(15),
  currency: 'USD',
  request: { email: 'buyer@example.test' },
};
const payment = {
  status: 'successful',
  amount: 15,
  currency: 'USD',
  customer: { email: 'Buyer@example.test' },
};
it('checks payment amount, currency, successful state and the immutable customer identity', () => {
  expect(() => assertSubscriptionPayment(snapshot, payment)).not.toThrow();
});
it.each([
  { status: 'failed' },
  { amount: 14.99 },
  { amount: 15.01 },
  { currency: 'NGN' },
  { customer: { email: 'other@example.test' } },
])('rejects a mismatched subscription payment %j', (override) => {
  expect(() => assertSubscriptionPayment(snapshot, { ...payment, ...override })).toThrow(
    'does not match',
  );
});
it('does not recreate ready catalog mappings on every scheduled sync', async () => {
  db.subscriptionProviderPlan.upsert.mockResolvedValue({ remoteId: 'existing' });
  expect(await syncSubscriptionCatalog()).toEqual({ synced: 6 });
  expect(fetch).not.toHaveBeenCalled();
});
it('includes native trial variants only for the corresponding Bachs plan and tier', async () => {
  db.subscriptionProviderPlan.upsert.mockResolvedValue({ remoteId: 'existing' });
  db.subscriptionTrialOffer.findMany.mockResolvedValue([
    { planId: 'plan', tierId: 'plus', days: 7 },
    { planId: 'other', tierId: 'plus', days: 14 },
  ]);
  await syncSubscriptionCatalog();
  expect(
    db.subscriptionProviderPlan.upsert.mock.calls.filter(([arg]) => arg.create.trialDays === 7),
  ).toHaveLength(2);
  expect(
    db.subscriptionProviderPlan.upsert.mock.calls.some(
      ([arg]) => arg.create.gateway === 'FLUTTERWAVE' && arg.create.trialDays,
    ),
  ).toBe(false);
});
it('reconciles an uncertain Flutterwave plan before trying another create', async () => {
  const spec = subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', 'FLUTTERWAVE');
  db.subscriptionProviderPlan.upsert.mockImplementation(async ({ create }) =>
    create.id === spec.id
      ? { ...create, createdAt: new Date(), state: 'CREATING' }
      : { remoteId: 'existing' },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'success', data: [{ id: 80, ...spec.request }] })),
  );
  await syncSubscriptionCatalog();
  expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith({
    where: { id: spec.id },
    data: expect.objectContaining({ remoteId: '80', state: 'READY' }),
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('keeps uncertain non-idempotent creations in review instead of issuing duplicates', async () => {
  const spec = subscriptionCatalogSpec(plan, 'plus', 'MONTHLY', 'USD', 'FLUTTERWAVE');
  db.subscriptionProviderPlan.upsert.mockImplementation(async ({ create }) =>
    create.id === spec.id
      ? { ...create, state: 'CREATING', createdAt: new Date() }
      : { remoteId: 'existing' },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'success', data: [] })),
  );
  await expect(syncSubscriptionCatalog()).rejects.toThrow('need retry or review');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith({
    where: { id: spec.id },
    data: { processingUntil: null },
  });
});
it('does not expose another user checkout', async () => {
  db.subscriptionCheckout.findFirst.mockResolvedValue(null);
  await expect(getSubscriptionCheckoutStatus('other', 'id', '12')).rejects.toThrow('not found');
  expect(fetch).not.toHaveBeenCalled();
});
it('requires an idempotency key before querying subscription prices or calling providers', async () => {
  await expect(
    createSubscriptionCheckout(
      'buyer',
      {
        planId: 'plan',
        tierId: 'plus',
        billingCycle: 'MONTHLY',
        gateway: 'FLUTTERWAVE',
        recurring: true,
      },
      '',
    ),
  ).rejects.toThrow('Idempotency');
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it.each([{ days: 5, userId: 'u' }, { days: 14, userId: 'u', countryIso3: 'NGA' }, { days: 7 }])(
  'rejects invalid trial targeting %j',
  async (selection) => {
    await expect(
      createSubscriptionTrialOffer('admin', { planId: 'plan', ...selection }),
    ).rejects.toThrow('Choose one');
    expect(db.subscriptionTrialOffer.create).not.toHaveBeenCalled();
  },
);
it('checks trial offer expiry before saving an admin offer', async () => {
  db.subscriptionPlan.findUnique.mockResolvedValue(plan);
  db.user.findUnique.mockResolvedValue({ id: 'buyer' });
  await expect(
    createSubscriptionTrialOffer('admin', {
      planId: 'plan',
      tierId: 'plus',
      userId: 'buyer',
      days: 7,
      expiresAt: '2020-01-01T00:00:00Z',
    }),
  ).rejects.toThrow('future');
});
it('does not allow a different account type to subscribe', async () => {
  db.user.findUnique.mockResolvedValue({ id: 'buyer', userType: 'BUSINESS' });
  db.subscriptionPlan.findUnique.mockResolvedValue(plan);
  await expect(
    createSubscriptionCheckout(
      'buyer',
      {
        planId: 'plan',
        tierId: 'plus',
        billingCycle: 'MONTHLY',
        gateway: 'FLUTTERWAVE',
        recurring: true,
      },
      'intent-1234',
    ),
  ).rejects.toThrow('unavailable');
  expect(fetch).not.toHaveBeenCalled();
});

it('quotes yearly original price, discount and savings in the matching currency', () => {
  const ngn = subscriptionPriceQuote(plan, 'YEARLY', 'NGN', 'plus', new Prisma.Decimal(20));
  expect(ngn).toEqual({currency:'NGN',amount:388800,originalAmount:432000,savings:43200,discountPercent:10,coins:19440,originalCoins:21600});
  expect(subscriptionPriceQuote(plan,'MONTHLY','USD','plus',new Prisma.Decimal(.015))).toMatchObject({amount:30,originalAmount:30,discountPercent:0,savings:0,coins:2000});
});
it('validates local pricing against the account country and allows Nigerians to choose USD',()=>{
 expect(subscriptionPricingCurrency('NGA')).toBe('NGN');
 expect(subscriptionPricingCurrency('NGA','USD')).toBe('USD');
 expect(subscriptionPricingCurrency(null)).toBe('USD');
 expect(()=>subscriptionPricingCurrency('USA','NGN')).toThrow('not available');
});
