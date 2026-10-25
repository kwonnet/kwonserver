import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('@/cron/utils', () => ({
  addSubscriptionCronJob: vi.fn(async () => {}),
  removeSubscriptionCronJob: vi.fn(async () => {}),
}));
vi.mock('@/services/helper', () => ({ syncPrismaUserWalletToRedis: vi.fn(async () => {}) }));
vi.mock('@/services/v1/games', () => ({ syncUserRedisWalletToPrisma: vi.fn() }));
vi.mock('@/cron/jobs/queue', () => ({
  subscriptionCatalogQueue: { add: vi.fn(async () => ({ id: 'catalog-job' })) },
}));
import db from '@/db';
import {
  syncSubscriptionCatalog,
  subscriptionCatalogSpec,
  createSubscriptionCheckout,
  getSubscriptionCheckoutStatus,
  processSubscriptionWebhook,
  cancelAppSubscription,
  createSubscriptionTrialOffer,
  renewAppSubscriptionWithWallet,
  getSubscriptionCatalog,
  reconcileSubscriptionPayments,
} from '@/services/v1/subscriptions';
const prefix = `billing-${randomUUID()}`,
  users: string[] = [],
  plans: string[] = [],
  remotePlans: any[] = [],
  products: any[] = [];
let plan: any,
  ngnCountryId: string,
  sequence = 5000;
const requestBodies: any[] = [];
async function buyer(local = false) {
  const id = `${prefix}-${users.length}`;
  users.push(id);
  return db.user.create({
    data: {
      id,
      username: id,
      email: `${id}@test.invalid`,
      name: 'Billing fixture',
      countryId: local ? ngnCountryId : null,
      wallet: { create: { coins: 100000 } },
    },
  });
}
function provider() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: any = {}) => {
      const url = new URL(input),
        body = options.body ? JSON.parse(options.body) : undefined;
      requestBodies.push({ url, body, method: options.method });
      if (url.pathname === '/v3/payment-plans' && body) {
        const remote = { id: ++sequence, ...body, status: 'active' };
        remotePlans.push(remote);
        return Response.json({ status: 'success', data: remote });
      }
      if (url.pathname === '/v3/payment-plans')
        return Response.json({
          status: 'success',
          data: remotePlans,
          meta: { page_info: { total_pages: 1 } },
        });
      if (url.pathname === '/v1/products' && body) {
        const remote = { id: `prod_${++sequence}`, ...body };
        products.push(remote);
        return Response.json(remote);
      }
      if (url.pathname === '/v1/products')
        return Response.json({ items: products, pagination: { has_more: false } });
      if (url.pathname === '/v3/payments')
        return Response.json({
          status: 'success',
          data: { link: `https://checkout.test/${body.tx_ref}` },
        });
      if (url.pathname === '/v1/checkout-sessions')
        return Response.json({
          checkout_id: `chk_${body.metadata.subscription_checkout}`,
          checkout_url: `https://checkout.test/${body.metadata.subscription_checkout}`,
        });
      throw new Error(`Unexpected provider call: ${url.pathname}`);
    }),
  );
}
beforeAll(async () => {
  vi.stubEnv('FLUTTERWAVE_SECK', 'FLWSECK_TEST-billing-fixture');
  vi.stubEnv('FLUTTERWAVE_SECRET_HASH', 'billing-secret');
  vi.stubEnv('BACHS_API_KEY', 'sk_sandbox_billing-fixture');
  vi.stubEnv('BACHS_WEBHOOK_SECRET', 'billing-secret');
  const continent = await db.continent.upsert({
    where: { code: 'AF' },
    create: { code: 'AF', name: 'Africa' },
    update: {},
  });
  const country = await db.country.upsert({
    where: { iso3: 'NGA' },
    create: { iso3: 'NGA', iso2: 'NG', name: 'Nigeria', emoji: '🇳🇬', continentId: continent.id },
    update: {},
  });
  ngnCountryId = country.id;
  await db.chargeRate.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      price: 0.015,
      ngnPrice: 18,
      fee: 0.25,
      minWithdrawal: 10,
      minNgnWithdrawal: 1000,
      ngnFee: 0.2,
    },
    update: { price: 0.015, ngnPrice: 18 },
  });
  plan = await db.subscriptionPlan.create({
    data: {
      name: prefix,
      price: 15,
      ngnPrice: 18000,
      discount: 0.1,
      accountType: 'PERSONAL',
      tier: [
        { id: 'basic', name: 'Basic', price: 15, message: '' },
        { id: 'plus', name: 'Plus', price: 30, ngnPrice: 36000, message: '' },
      ],
    },
  });
  plans.push(plan.id);
  provider();
  await syncSubscriptionCatalog();
});
afterEach(() => {
  provider();
});
afterAll(async () => {
  const subscriptionIds=(await db.subscription.findMany({where:{userId:{in:users}},select:{id:true}})).map(sub=>sub.id);
  await db.subscriptionProviderEvent.deleteMany({
    where: {
      subscriptionId: {
        in: (
          await db.subscription.findMany({ where: { userId: { in: users } }, select: { id: true } })
        ).map((s) => s.id),
      },
    },
  });
  await db.subscriptionTrialUse.deleteMany({ where: { userId: { in: users } } });
  await db.subscriptionTrialOffer.deleteMany({ where: { planId: { in: plans } } });
  await db.subscriptionCheckout.deleteMany({ where: { userId: { in: users } } });
  await db.transaction.deleteMany({ where: { userId: { in: users } } });
  await db.walletOperation.deleteMany({
    where: { OR:[{scope:{startsWith:`subscription:${prefix}`}},{scope:{in:subscriptionIds.map(id=>`renewal:${id}`)}}] },
  });
  await db.subscription.deleteMany({ where: { userId: { in: users } } });
  await db.wallet.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.subscriptionProviderPlan.deleteMany({ where: { planId: { in: plans } } });
  await db.subscriptionPlan.deleteMany({ where: { id: { in: plans } } });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('synchronizes monthly/yearly, both tiers and provider currency variants once', async () => {
  const entries = await db.subscriptionProviderPlan.findMany({ where: { planId: plan.id } });
  expect(entries).toHaveLength(12);
  const requests = remotePlans.length + products.length;
  await syncSubscriptionCatalog();
  expect(remotePlans.length + products.length).toBe(requests);
  expect(
    entries
      .find(
        (e) =>
          e.gateway === 'FLUTTERWAVE' &&
          e.tierId === 'plus' &&
          e.currency === 'USD' &&
          e.billingCycle === 'YEARLY',
      )
      ?.amount.toString(),
  ).toBe('324');
  const previous = entries[0];
  await db.subscriptionPlan.update({
    where: { id: plan.id },
    data: {
      tier: [
        { id: 'basic', name: 'Basic', price: 16, message: '' },
        { id: 'plus', name: 'Plus', price: 30, ngnPrice: 36000, message: '' },
      ],
    },
  });
  await syncSubscriptionCatalog();
  expect(
    (await db.subscriptionProviderPlan.findUniqueOrThrow({ where: { id: previous.id } })).remoteId,
  ).toBe(previous.remoteId);
  await db.subscriptionPlan.update({ where: { id: plan.id }, data: { tier: plan.tier } });
});
it('reconciles a timed-out Flutterwave creation without creating a duplicate', async () => {
  const spec = subscriptionCatalogSpec(plan, 'basic', 'MONTHLY', 'USD', 'FLUTTERWAVE');
  await db.subscriptionProviderPlan.update({
    where: { id: spec.id },
    data: { remoteId: null, state: 'CREATING' },
  });
  const before = remotePlans.length;
  await syncSubscriptionCatalog();
  expect(remotePlans.length).toBe(before);
  expect(
    (await db.subscriptionProviderPlan.findUniqueOrThrow({ where: { id: spec.id } })).remoteId,
  ).toBeTruthy();
});
it.each([false, true])(
  'wallet price uses the authoritative country and charge rate (Nigeria=%s), and replays debit once',
  async (local) => {
    const user = await buyer(local),
      input = {
        planId: plan.id,
        tierId: 'plus',
        billingCycle: 'MONTHLY' as const,
        gateway: 'WALLET' as const,
        recurring: true,
      };
    const first = await createSubscriptionCheckout(user.id, input, `${prefix}-wallet-${local}`);
    expect(first.status).toBe('COMPLETED');
    // Repeating the same financial intent returns its saved result, even with an active subscription.
    expect(
      (await createSubscriptionCheckout(user.id, input, `${prefix}-wallet-${local}`)).status,
    ).toBe('COMPLETED');
    const txn = await db.transaction.findFirstOrThrow({
      where: { userId: user.id, category: 'APP_SUBSCRIPTION' },
    });
    expect(txn.amount.toString()).toBe('2000');
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1);
  },
);
it('concurrent checkout retries issue only one provider payment link', async () => {
  const user = await buyer(),
    input = {
      planId: plan.id,
      tierId: 'basic',
      billingCycle: 'MONTHLY' as const,
      gateway: 'FLUTTERWAVE' as const,
      recurring: true,
    },
    key = `${prefix}-checkout`;
  const before = requestBodies.filter((r) => r.url.pathname === '/v3/payments').length;
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => createSubscriptionCheckout(user.id, input, key)),
  );
  expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  const retry = await createSubscriptionCheckout(user.id, input, key);
  expect(retry.url).toMatch(/^https:\/\/checkout.test/);
  expect(requestBodies.filter((r) => r.url.pathname === '/v3/payments')).toHaveLength(before + 1);
  const checkout = await db.subscriptionCheckout.findUniqueOrThrow({ where: { id: retry.id! } });
  const payment = {
    id: 99001,
    tx_ref: checkout.id,
    status: 'successful',
    currency: 'USD',
    amount: 15,
    customer: { id: 121, email: user.email },
    created_at: new Date().toISOString(),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.includes('/verify')
          ? { status: 'success', data: payment }
          : {
              status: 'success',
              data: [
                {
                  id: 32001,
                  plan: Number(
                    (
                      await db.subscriptionProviderPlan.findUniqueOrThrow({
                        where: { id: checkout.providerPlanId },
                      })
                    ).remoteId,
                  ),
                  status: 'active',
                  customer: { email: user.email },
                },
              ],
            },
      ),
    ),
  );
  await expect(getSubscriptionCheckoutStatus('another-user', checkout.id, '99001')).rejects.toThrow(
    'not found',
  );
  await Promise.all(
    Array.from({ length: 6 }, () => getSubscriptionCheckoutStatus(user.id, checkout.id, '99001')),
  );
  const sub = await db.subscription.findFirstOrThrow({ where: { userId: user.id } });
  expect(sub.providerSubscriptionId).toBe('32001');
  expect(sub.isRecurring).toBe(true);
  expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1);
  // A duplicate or old provider event cannot enable cancelled renewal again.
  await db.subscription.update({
    where: { id: sub.id },
    data: { isRecurring: false, renewalCancelledAt: new Date() },
  });
  await processSubscriptionWebhook('FLUTTERWAVE', {
    event: 'charge.completed',
    data: { id: 99001 },
  });
  expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).isRecurring).toBe(
    false,
  );
  payment.amount = 1;
  payment.id = 99002;
  await expect(getSubscriptionCheckoutStatus(user.id, checkout.id, '99002')).rejects.toThrow(
    'does not match',
  );
});
it.each([false, true])(
  'trial claims grant seven days without a debit; paid wallet renewal requires consent=%s',
  async (recurring) => {
    const user = await buyer(true),
      offer = await createSubscriptionTrialOffer('admin-fixture', {
        planId: plan.id,
        tierId: 'basic',
        userId: user.id,
        days: 7,
      });
    const catalog = await getSubscriptionCatalog(user.id);
    expect(catalog.offers.some((o) => o.id === offer.id)).toBe(true);
    await createSubscriptionCheckout(
      user.id,
      {
        planId: plan.id,
        tierId: 'basic',
        billingCycle: 'MONTHLY',
        gateway: 'WALLET',
        recurring,
        offerId: offer.id,
      },
      `${prefix}-trial-${recurring}`,
    );
    await createSubscriptionCheckout(
      user.id,
      {
        planId: plan.id,
        tierId: 'basic',
        billingCycle: 'MONTHLY',
        gateway: 'WALLET',
        recurring,
        offerId: offer.id,
      },
      `${prefix}-trial-${recurring}`,
    );
    const sub = await db.subscription.findFirstOrThrow({ where: { userId: user.id } });
    expect(sub.endDate.getTime() - sub.startDate.getTime()).toBe(7 * 86400000);
    expect(sub.isRecurring).toBe(recurring);
    expect(sub.renewalCoinAmount?.toString()).toBe('1000');
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
    await db.subscription.update({
      where: { id: sub.id },
      data: { endDate: new Date(Date.now() - 1000) },
    });
    expect((await renewAppSubscriptionWithWallet(sub.id)).isError).toBe(false);
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(recurring ? 1 : 0);
  },
);
it('Bachs saved-card trial verifies provider identity, records no fake charge, then renews and cancels at period end', async () => {
  const user = await buyer(),
    offer = await createSubscriptionTrialOffer('admin-fixture', {
      planId: plan.id,
      tierId: 'plus',
      countryIso3: 'NGA',
      days: 14,
    });
  await expect(
    createSubscriptionCheckout(
      user.id,
      {
        planId: plan.id,
        tierId: 'plus',
        billingCycle: 'MONTHLY',
        gateway: 'BACHS',
        recurring: true,
        offerId: offer.id,
      },
      `${prefix}-wrong-country`,
    ),
  ).rejects.toThrow('not available');
  const targeted = await createSubscriptionTrialOffer('admin-fixture', {
    planId: plan.id,
    tierId: 'plus',
    userId: user.id,
    days: 14,
  });
  await syncSubscriptionCatalog();
  const result = await createSubscriptionCheckout(
    user.id,
    {
      planId: plan.id,
      tierId: 'plus',
      billingCycle: 'MONTHLY',
      gateway: 'BACHS',
      recurring: true,
      offerId: targeted.id,
    },
    `${prefix}-bachs`,
  );
  const checkout = await db.subscriptionCheckout.findUniqueOrThrow({ where: { id: result.id } }),
    binding = await db.subscriptionProviderPlan.findUniqueOrThrow({
      where: { id: checkout.providerPlanId },
    });
  const start = new Date(),
    trialEnd = new Date(start.getTime() + 14 * 86400000);
  const remote: any = {
    id: 'sub_fixture',
    customer: { customer_id: 'cust_fixture', email: user.email },
    status: 'trialing',
    billing_cycle: { interval: 'month', frequency: 1 },
    amount: '30.00',
    currency: 'USD',
    product: { id: binding.remoteId },
    current_period_start: start.toISOString(),
    current_period_end: trialEnd.toISOString(),
    trial_end: trialEnd.toISOString(),
    cancel_at_period_end: false,
    metadata: { subscription_checkout: checkout.id },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, opts: any = {}) => {
      if (opts.method === 'DELETE') remote.cancel_at_period_end = true;
      return Response.json(remote);
    }),
  );
  await processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.created',
    data: { id: remote.id },
  });
  const sub = await db.subscription.findFirstOrThrow({ where: { userId: user.id } });
  expect(sub.providerSubscriptionId).toBe(remote.id);
  expect((await createSubscriptionCheckout(user.id,{planId:plan.id,tierId:'plus',billingCycle:'MONTHLY',gateway:'BACHS',recurring:true,offerId:targeted.id},`${prefix}-bachs`)).status).toBe('COMPLETED');
  expect(sub.trialEndsAt?.toISOString()).toBe(trialEnd.toISOString());
  expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
  remote.status = 'active';
  remote.current_period_start = trialEnd.toISOString();
  remote.current_period_end = new Date(trialEnd.getTime() + 30 * 86400000).toISOString();
  await Promise.all(
    Array.from({ length: 6 }, () =>
      processSubscriptionWebhook('BACHS', {
        type: 'customer.subscription.updated',
        data: { id: remote.id },
      }),
    ),
  );
  expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1);
  expect(
    (await cancelAppSubscription({ subId: sub.id, status: 'CANCELLED', userId: user.id })).status,
  ).toBe(200);
  const cancelled = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
  expect(cancelled.isRecurring).toBe(false);
  expect(cancelled.status).toBe('ACTIVE');
  await processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.updated',
    data: { id: remote.id },
  });
  expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).isRecurring).toBe(
    false,
  );
});

it('releases an expired hosted link only after checking for a successful payment', async () => {
  const user = await buyer();
  const result = await createSubscriptionCheckout(
    user.id,
    {
      planId: plan.id,
      tierId: 'basic',
      billingCycle: 'MONTHLY',
      gateway: 'FLUTTERWAVE',
      recurring: false,
    },
    `${prefix}-expired`,
  );
  const checkout = await db.subscriptionCheckout.findUniqueOrThrow({ where: { id: result.id } });
  const request: any = checkout.request;
  request.payload.link_expiration = new Date(Date.now() - 2 * 86400000).toISOString();
  await db.subscriptionCheckout.update({ where: { id: checkout.id }, data: { request } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'success', data: [] })),
  );
  expect((await getSubscriptionCheckoutStatus(user.id, checkout.id)).status).toBe('EXPIRED');
  expect(await db.subscription.count({ where: { userId: user.id } })).toBe(0);
  expect((await getSubscriptionCatalog(user.id)).pending).toBeNull();
});

it('expires a trial without renewal consent and removes its premium badge without charging', async () => {
  const trial = await db.subscription.findFirstOrThrow({
    where: {
      userId: { in: users },
      providerGateway: 'WALLET',
      trialEndsAt: { not: null },
      isRecurring: false,
      endDate: { lt: new Date() },
    },
  });
  const before = await db.transaction.count({ where: { userId: trial.userId } });
  vi.stubEnv('FLUTTERWAVE_SECK', '');
  await reconcileSubscriptionPayments();
  expect((await db.subscription.findUniqueOrThrow({ where: { id: trial.id } })).status).toBe(
    'EXPIRED',
  );
  expect((await db.user.findUniqueOrThrow({ where: { id: trial.userId } })).meta).toMatchObject({
    type: 'LEGACY',
  });
  expect(await db.transaction.count({ where: { userId: trial.userId } })).toBe(before);
  vi.stubEnv('FLUTTERWAVE_SECK', 'FLWSECK_TEST-billing-fixture');
});
