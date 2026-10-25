import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  state: {} as any,
  db: {} as any,
  queue: vi.fn(),
  lock: vi.fn(),
  operation: vi.fn(),
}));
vi.mock('@/db', () => ({ default: fixture.db }));
vi.mock('@/services/walletLedger', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  lockWallets: fixture.lock,
  walletOperation: fixture.operation,
}));
vi.mock('@/services/helper', () => ({ syncPrismaUserWalletToRedis: vi.fn() }));
vi.mock('@/cron/utils', () => ({
  addSubscriptionCronJob: vi.fn(async () => {}),
  removeSubscriptionCronJob: vi.fn(async () => {}),
}));
vi.mock('@/cron/jobs/queue', () => ({ subscriptionCatalogQueue: { add: fixture.queue } }));
import * as billing from '@/services/v1/subscriptions';
const d = (n: number) => new Prisma.Decimal(n),
  now = () => new Date();
const input: any = {
  planId: 'plan',
  tierId: 'plus',
  billingCycle: 'MONTHLY',
  gateway: 'FLUTTERWAVE',
  recurring: true,
};
const models = [
  'user',
  'country',
  'chargeRate',
  'wallet',
  'subscriptionPlan',
  'subscriptionProviderPlan',
  'subscriptionTrialOffer',
  'subscriptionTrialUse',
  'subscriptionCheckout',
  'subscription',
  'subscriptionProviderEvent',
  'transaction',
];
const methods = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'update',
  'updateMany',
  'upsert',
  'deleteMany',
];
const state = fixture.state,
  db = fixture.db;
function arrangeCheckout(gateway = 'FLUTTERWAVE', overrides: any = {}) {
  const spec = billing.subscriptionCatalogSpec(
    state.plan,
    'plus',
    'MONTHLY',
    'USD',
    gateway as any,
    overrides.trialDays ?? 0,
  );
  state.binding = {
    ...spec,
    remoteId: gateway === 'FLUTTERWAVE' ? '50' : 'prod_50',
    state: 'READY',
  };
  state.checkout = {
    id: 'checkout',
    userId: 'buyer',
    planId: 'plan',
    tierId: 'plus',
    billingCycle: 'MONTHLY',
    gateway,
    environment: spec.environment,
    amount: d(30),
    currency: 'USD',
    providerPlanId: spec.id,
    recurring: true,
    trialDays: 0,
    status: 'OPEN',
    checkoutId: gateway === 'BACHS' ? 'chk_50' : null,
    checkoutUrl: 'https://checkout.test/pay',
    subscriptionId: null,
    request: {
      email: state.user.email,
      identity: 'identity',
      payload: { link_expiration: new Date(Date.now() + 3600000).toISOString() },
    },
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
  state.payment = {
    id: 81,
    tx_ref: 'checkout',
    amount: 30,
    currency: 'USD',
    status: 'successful',
    created_at: now().toISOString(),
    customer: { id: 90, email: state.user.email },
  };
  state.remote = { id: 100, plan: 50, status: 'active', customer: { email: state.user.email } };
  state.bachs = {
    id: 'sub_50',
    metadata: { subscription_checkout: 'checkout' },
    customer: { customer_id: 'cust_50', email: state.user.email },
    currency: 'USD',
    amount: '30.00',
    billing_cycle: { interval: 'month', frequency: 1 },
    product: { id: 'prod_50' },
    status: 'active',
    current_period_start: now().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancel_at_period_end: false,
  };
  return state.checkout;
}
function arrangeSub(overrides: any = {}) {
  state.sub = {
    id: 'sub',
    userId: 'buyer',
    planId: 'plan',
    billingCycle: 'MONTHLY',
    isPrimary: true,
    isRecurring: true,
    status: 'ACTIVE',
    startDate: now(),
    endDate: new Date(Date.now() + 86400000),
    providerGateway: 'FLUTTERWAVE',
    providerEnvironment: billing.subscriptionEnvironment('FLUTTERWAVE'),
    providerSubscriptionId: '100',
    providerPlanId: state.binding?.id ?? 'binding',
    providerCustomerId: '90',
    renewalCancelledAt: null,
    user: state.user,
    meta: {},
    metadata: [],
    ...overrides,
  };
  if (state.checkout) state.checkout.subscriptionId = 'sub';
  return state.sub;
}
function mockNetwork() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string, opts: any = {}) => {
      const url = new URL(raw),
        body = opts.body ? JSON.parse(opts.body) : null;
      if (state.networkError) throw new Error('Provider unavailable');
      if (state.httpError) return Response.json({}, { status: 503 });
      if (state.apiError) return Response.json({ status: 'error' });
      if (url.pathname === '/v3/payment-plans')
        return Response.json(
          opts.method === 'POST'
            ? { status: 'success', data: state.createdRemote ?? { id: 50 } }
            : { status: 'success', data: state.listedPlans ?? [], meta: state.planMeta },
        );
      if (url.pathname === '/v1/products')
        return Response.json(
          opts.method === 'POST'
            ? (state.createdRemote ?? { id: 'prod_50' })
            : { items: state.listedProducts ?? [], pagination: state.pagination },
        );
      if (url.pathname === '/v3/payments') {
        if (state.earlySettlement) state.checkout.status = 'COMPLETED';
        return Response.json({
          status: 'success',
          data: { link: state.link ?? 'https://checkout.test/pay' },
        });
      }
      if (url.pathname === '/v1/checkout-sessions')
        return Response.json({
          checkout_id: state.noCheckoutId ? undefined : 'chk_50',
          checkout_url: state.link ?? 'https://checkout.test/pay',
        });
      if (url.pathname.startsWith('/v1/checkout-sessions/'))
        return Response.json(state.session ?? { status: 'completed', subscription_id: 'sub_50' });
      if (url.pathname.startsWith('/v3/transactions/') && url.pathname.endsWith('/verify'))
        return Response.json({ status: 'success', data: state.payment });
      if (url.pathname === '/v3/transactions')
        return Response.json({
          status: 'success',
          data: state.payments ?? [state.payment],
          meta: state.paymentMeta,
        });
      if (url.pathname.startsWith('/v3/subscriptions/') && url.pathname.endsWith('/cancel')) {
        state.remote.status = 'cancelled';
        return Response.json({ status: 'success' });
      }
      if (url.pathname === '/v3/subscriptions') {
        let items = state.remotes ?? [state.remote];
        if (Array.isArray(items) && url.searchParams.has('status'))
          items = items.filter((item: any) => item?.status === url.searchParams.get('status'));
        return Response.json({ status: 'success', data: items });
      }
      if (url.pathname === '/v1/subscriptions')
        return Response.json({
          items: state.listedSubscriptions ?? [state.bachs],
          pagination: state.pagination,
        });
      if (url.pathname.startsWith('/v1/subscriptions/')) {
        if (opts.method === 'DELETE') state.bachs.cancel_at_period_end = true;
        return Response.json(state.bachs);
      }
      if (url.pathname.startsWith('/v1/customers/'))
        return Response.json(state.customer ?? { id: 'cust_50', email: state.user.email });
      throw new Error(`Unexpected call ${url.pathname} ${JSON.stringify(body)}`);
    }),
  );
}
beforeEach(() => {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.keys(db).forEach((k) => delete db[k]);
  vi.stubEnv('FLUTTERWAVE_SECK', 'FLWSECK_TEST-fixture');
  vi.stubEnv('FLW_SECRET_HASH', 'secret');
  vi.stubEnv('BACHS_API_KEY', 'sk_sandbox_fixture');
  vi.stubEnv('BACHS_WEBHOOK_SECRET', 'secret');
  state.user = {
    id: 'buyer',
    email: 'buyer@test.invalid',
    userType: 'PERSONAL',
    country: null,
    accountVerifiedAt: null,
  };
  state.plan = {
    id: 'plan',
    name: 'Premium',
    accountType: 'PERSONAL',
    price: d(15),
    ngnPrice: d(18000),
    discount: 0.1,
    tier: [{ id: 'plus', name: 'Plus', price: 30, message: '' }],
  };
  state.events = new Map();
  state.offer = {
    id: 'offer',
    planId: 'plan',
    tierId: 'plus',
    userId: 'buyer',
    countryIso3: null,
    days: 7,
    enabled: true,
    expiresAt: null,
  };
  for (const model of models)
    db[model] = Object.fromEntries(methods.map((method) => [method, vi.fn()]));
  db.$transaction = vi.fn(async (work: any) => work(db));
  fixture.operation
    .mockReset()
    .mockImplementation(async (_scope, _key, _payload, _ids, work) => work(db));
  fixture.queue.mockReset().mockResolvedValue({ id: 'job' });
  fixture.lock.mockReset();
  db.user.findFirst.mockImplementation(async () => state.user);
  db.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'wallet', coins: d(10000), isLocked: false });
  db.wallet.findFirst.mockResolvedValue({ id: 'wallet', coins: d(10000), isLocked: false });
  db.wallet.update.mockResolvedValue({ id: 'wallet', coins: d(8000) });
  db.user.findUnique.mockImplementation(async () => state.user);
  db.user.findUniqueOrThrow.mockImplementation(async () => state.user);
  db.user.update.mockResolvedValue({});
  db.country.findUnique.mockResolvedValue({ iso3: 'NGA' });
  db.chargeRate.findUniqueOrThrow.mockResolvedValue({ price: d(0.015), ngnPrice: d(18) });
  db.subscriptionPlan.findUnique.mockImplementation(async () => state.plan);
  db.subscriptionPlan.findMany.mockImplementation(async () => state.plans ?? [state.plan]);
  db.subscriptionProviderPlan.findUnique.mockImplementation(
    async () => state.binding ?? { id: 'binding', remoteId: '50', state: 'READY' },
  );
  db.subscriptionProviderPlan.findUniqueOrThrow.mockImplementation(
    async () => state.binding ?? { id: 'binding', remoteId: '50', state: 'READY' },
  );
  db.subscriptionProviderPlan.findMany.mockResolvedValue([]);
  db.subscriptionProviderPlan.upsert.mockImplementation(
    async ({ create }: any) => state.syncRow ?? { ...create, remoteId: 'ready' },
  );
  db.subscriptionProviderPlan.updateMany.mockResolvedValue({ count: 1 });
  db.subscriptionProviderPlan.update.mockImplementation(async ({ data }: any) => data);
  db.subscriptionTrialOffer.findUnique.mockImplementation(async () => state.offer);
  db.subscriptionTrialOffer.findMany.mockResolvedValue([]);
  db.subscriptionTrialOffer.create.mockImplementation(async ({ data }: any) => ({
    ...state.offer,
    ...data,
  }));
  db.subscriptionTrialOffer.update.mockResolvedValue({});
  db.subscriptionTrialUse.findUnique.mockImplementation(async () => state.use ?? null);
  db.subscriptionTrialUse.create.mockImplementation(
    async ({ data }: any) => (state.use = { ...data }),
  );
  db.subscriptionTrialUse.update.mockImplementation(async ({ data }: any) =>
    Object.assign(state.use ?? {}, data),
  );
  db.subscriptionCheckout.findFirstOrThrow.mockImplementation(async () => state.checkout);
  db.subscriptionCheckout.findUnique.mockImplementation(async () => state.checkout ?? null);
  db.subscriptionCheckout.findUniqueOrThrow.mockImplementation(async () => state.checkout);
  db.subscriptionCheckout.findFirst.mockImplementation(async ({ where }: any = {}) => {
    if (
      state.checkout &&
      (!where?.id || where.id === state.checkout.id) &&
      (!where?.subscriptionId || where.subscriptionId === state.checkout.subscriptionId)
    )
      return state.checkout;
    return null;
  });
  db.subscriptionCheckout.findMany.mockResolvedValue([]);
  db.subscriptionCheckout.create.mockImplementation(
    async ({ data }: any) =>
      (state.checkout = { ...data, status: 'PENDING', createdAt: now(), updatedAt: now() }),
  );
  db.subscriptionCheckout.update.mockImplementation(async ({ data }: any) =>
    Object.assign(state.checkout, data),
  );
  db.subscriptionCheckout.updateMany.mockImplementation(async ({ where, data }: any) => {
    if (typeof where.status === 'string' && where.status !== state.checkout?.status)
      return { count: 0 };
    if (where.status?.in && !where.status.in.includes(state.checkout?.status)) return { count: 0 };
    Object.assign(state.checkout, data);
    return { count: 1 };
  });
  db.subscription.findFirst.mockImplementation(async ({ where }: any = {}) =>
    where?.isPrimary ? (state.active ?? null) : (state.sub ?? null),
  );
  db.subscription.findUnique.mockImplementation(async () => state.sub ?? null);
  db.subscription.findUniqueOrThrow.mockImplementation(async () => state.sub);
  db.subscription.findMany.mockImplementation(async ({ where }: any = {}) =>
    where?.isRecurring === false ? (state.expired ?? []) : (state.due ?? []),
  );
  db.subscription.create.mockImplementation(
    async ({ data }: any) => (state.sub = { id: 'sub', ...data }),
  );
  db.subscription.update.mockImplementation(async ({ data }: any) =>
    Object.assign(state.sub, data),
  );
  db.subscriptionProviderEvent.findUnique.mockImplementation(
    async ({ where }: any) => state.events.get(where.id) ?? null,
  );
  db.subscriptionProviderEvent.create.mockImplementation(async ({ data }: any) => {
    state.events.set(data.id, data);
    return data;
  });
  mockNetwork();
});
afterEach(() => vi.unstubAllEnvs());
it.each(['FLUTTERWAVE', 'BACHS'])(
  'creates a server-priced %s checkout and reuses its hosted URL',
  async (gateway) => {
    const selected = { ...input, gateway };
    const first = await billing.createSubscriptionCheckout('buyer', selected, 'checkout-key');
    expect(first.url).toBe('https://checkout.test/pay');
    expect(state.checkout.amount).toBe(30);
    const before = (fetch as any).mock.calls.length;
    expect(await billing.createSubscriptionCheckout('buyer', selected, 'checkout-key')).toEqual(
      first,
    );
    expect(fetch).toHaveBeenCalledTimes(before);
  },
);
it('keeps an uncertain checkout for recovery when provider creation fails', async () => {
  state.networkError = true;
  await expect(billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).rejects.toThrow(
    'unavailable',
  );
  expect(state.checkout.status).toBe('REVIEW');
});
it.each(['FLUTTERWAVE', 'BACHS'])('settles one verified %s payment once', async (gateway) => {
  arrangeCheckout(gateway);
  if (gateway === 'FLUTTERWAVE')
    await billing.getSubscriptionCheckoutStatus('buyer', 'checkout', '81');
  else
    await billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    });
  expect(state.sub.isPrimary).toBe(true);
  expect(state.checkout.status).toBe('COMPLETED');
  expect(db.transaction.create).toHaveBeenCalledOnce();
  if (gateway === 'FLUTTERWAVE')
    await billing.getSubscriptionCheckoutStatus('buyer', 'checkout', '81');
  else
    await billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.updated',
      data: { id: 'sub_50' },
    });
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it('a provider redirect without a transaction ID searches and verifies the saved reference', async () => {
  arrangeCheckout();
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('tx_ref=checkout'), expect.anything());
});
it('records a native trial audit receipt without a payment transaction', async () => {
  arrangeCheckout('BACHS', { offerId: 'offer', trialDays: 7 });
  state.bachs.status = 'trialing';
  state.bachs.current_period_end = new Date(Date.now() + 7 * 86400000).toISOString();
  state.bachs.trial_end = state.bachs.current_period_end;
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.created',
    data: { id: 'sub_50' },
  });
  expect(state.sub.trialEndsAt).toBeInstanceOf(Date);
  expect(db.transaction.create).not.toHaveBeenCalled();
  expect(db.subscriptionTrialUse.update).toHaveBeenCalled();
});
it.each([false, true])(
  'wallet trial renewal requires explicit consent=%s and is idempotent',
  async (recurring) => {
    const arg = { ...input, gateway: 'WALLET', offerId: 'offer', recurring };
    expect((await billing.createSubscriptionCheckout('buyer', arg, 'trial-key')).status).toBe(
      'COMPLETED',
    );
    expect(state.sub.isRecurring).toBe(recurring);
    expect(state.sub.renewalCoinAmount).toBe(2000);
    expect(db.transaction.create).not.toHaveBeenCalled();
    expect((await billing.createSubscriptionCheckout('buyer', arg, 'trial-key')).status).toBe(
      'COMPLETED',
    );
    expect(db.subscription.create).toHaveBeenCalledOnce();
  },
);
it('Bachs trial checkout reserves the offer before opening saved-card checkout', async () => {
  expect(
    (
      await billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'BACHS', offerId: 'offer' },
        'trial-key',
      )
    ).url,
  ).toBeTruthy();
  expect(state.use.checkoutId).toBe(state.checkout.id);
});
it.each(['FLUTTERWAVE', 'BACHS'])(
  'cancels only the individual %s provider subscription and preserves access',
  async (gateway) => {
    arrangeCheckout(gateway);
    arrangeSub({
      providerGateway: gateway,
      providerEnvironment: billing.subscriptionEnvironment(gateway as any),
      providerSubscriptionId: gateway === 'BACHS' ? 'sub_50' : '100',
    });
    expect(
      (await billing.cancelAppSubscription({ subId: 'sub', userId: 'buyer', status: 'CANCELLED' }))
        .status,
    ).toBe(200);
    expect(state.sub.isRecurring).toBe(false);
    expect(state.sub.status).toBe('ACTIVE');
    expect(state.sub.renewalCancelledAt).toBeInstanceOf(Date);
  },
);
it('builds a personalized catalog and administrative plan references', async () => {
  arrangeCheckout();
  arrangeSub();
  db.subscription.findMany.mockResolvedValue([state.sub]);
  db.subscriptionTrialOffer.findMany.mockResolvedValue([state.offer]);
  expect((await billing.getSubscriptionCatalog('buyer')).plans[0].options[0]).toMatchObject({
    coins: 2000,
    currency: 'USD',
  });
  expect((await billing.subscriptionAdministration()).offers).toEqual([state.offer]);
  expect(await billing.disableSubscriptionTrialOffer('offer')).toEqual({});
  expect((await billing.enqueueSubscriptionSync()).jobId).toBe('job');
});
it('creates a targeted offer and tolerates a temporary queue outage after persisting it', async () => {
  fixture.queue.mockRejectedValue(new Error('queue down'));
  expect(
    (
      await billing.createSubscriptionTrialOffer('admin', {
        planId: 'plan',
        tierId: 'plus',
        countryIso3: 'NGA',
        days: 14,
      })
    ).days,
  ).toBe(14);
  expect(db.subscriptionTrialOffer.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ createdBy: 'admin' }),
  });
});

it('routes wallet signup through a server-priced coin debit', async () => {
  expect(
    (
      await billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'WALLET' },
        'wallet-key',
      )
    ).status,
  ).toBe('COMPLETED');
  expect(db.transaction.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ amount: 2000, currency: 'COINS', gateway: 'WALLET' }),
  });
});
it('uses the local Nigerian price and charge rate for a trial renewal quote', async () => {
  state.user.country = { iso3: 'NGA' };
  await billing.createSubscriptionCheckout(
    'buyer',
    { ...input, gateway: 'WALLET', offerId: 'offer' },
    'trial-key',
  );
  expect(state.sub.renewalCoinAmount).toBe(2000);
});
it('renews the first wallet period after an opted-in trial without requiring an earlier payment', async () => {
  arrangeSub({
    providerGateway: 'WALLET',
    endDate: new Date(0),
    trialEndsAt: now(),
    renewalCoinAmount: d(2000),
    transactions: [],
    plan: state.plan,
  });
  expect((await billing.renewAppSubscriptionWithWallet('sub')).isError).toBe(false);
  expect(db.transaction.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ amount: d(2000), currency: 'COINS' }),
  });
  expect(state.sub.trialEndsAt).toBeNull();
});
it('refuses to renew an externally managed subscription from wallet coins', async () => {
  arrangeSub({ endDate: new Date(0), transactions: [] });
  expect((await billing.renewAppSubscriptionWithWallet('sub')).isError).toBe(true);
  expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([{ user: null }, { plan: null }])(
  'requires a catalog plan and an authenticated account %j',
  async (change) => {
    Object.assign(state, change);
    await expect(
      billing.createSubscriptionCheckout('buyer', input, 'checkout-key'),
    ).rejects.toThrow('unavailable');
  },
);
it.each([
  { enabled: false },
  { expiresAt: new Date(0) },
  { planId: 'other' },
  { tierId: 'other' },
  { userId: 'other' },
])('rejects an ineligible trial offer %j', async (change) => {
  Object.assign(state.offer, change);
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer' },
      'trial-key',
    ),
  ).rejects.toThrow('not available');
  expect(db.subscription.create).not.toHaveBeenCalled();
});
it('rejects a missing trial offer', async () => {
  state.offer = null;
  await expect(
    billing.createSubscriptionCheckout('buyer', { ...input, offerId: 'missing' }, 'trial-key'),
  ).rejects.toThrow('not available');
});
it('applies country targeting using the account country', async () => {
  state.offer.userId = null;
  state.offer.countryIso3 = 'NGA';
  state.user.country = { iso3: 'NGA' };
  expect(
    (
      await billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'WALLET', offerId: 'offer' },
        'trial-key',
      )
    ).status,
  ).toBe('COMPLETED');
});
it('does not consume an offer a second time using another key', async () => {
  state.use = { claimedAt: now(), checkoutId: 'other-intent' };
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer' },
      'trial-key',
    ),
  ).rejects.toThrow('already been used');
});
it('blocks a trial already reserved in an unfinished provider checkout', async () => {
  state.use = { claimedAt: null };
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer' },
      'trial-key',
    ),
  ).rejects.toThrow('unfinished');
});
it.each(['WALLET', 'FLUTTERWAVE'])(
  'does not stack a free trial over an active %s subscription',
  async (gateway) => {
    state.active = {
      endDate: gateway === 'FLUTTERWAVE' ? new Date(0) : new Date(Date.now() + 86400000),
      isRecurring: true,
      providerGateway: gateway,
    };
    await expect(
      billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'WALLET', offerId: 'offer' },
        'trial-key',
      ),
    ).rejects.toThrow('still active');
  },
);
it('does not start a competing trial while a paid checkout is unfinished', async () => {
  arrangeCheckout();
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer' },
      'trial-key',
    ),
  ).rejects.toThrow('existing checkout');
});
it('does not charge a trial signup through Flutterwave', async () => {
  await expect(
    billing.createSubscriptionCheckout('buyer', { ...input, offerId: 'offer' }, 'trial-key'),
  ).rejects.toThrow('initial paid charge');
});
it('does not enroll a Bachs subscriber without renewal consent', async () => {
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'BACHS', recurring: false },
      'checkout-key',
    ),
  ).rejects.toThrow('renewal opt-in');
});
it.each(['FLUTTERWAVE', 'BACHS'])('hides unconfigured %s billing', async (gateway) => {
  vi.stubEnv(gateway === 'FLUTTERWAVE' ? 'FLW_SECRET_HASH' : 'BACHS_WEBHOOK_SECRET', '');
  await expect(
    billing.createSubscriptionCheckout('buyer', { ...input, gateway }, 'checkout-key'),
  ).rejects.toThrow('not configured');
});
it.each([null, { state: 'READY' }, { remoteId: '50', state: 'REVIEW' }])(
  'queues synchronization for an unavailable mapping %j',
  async (binding) => {
    db.subscriptionProviderPlan.findUnique.mockResolvedValue(binding);
    await expect(
      billing.createSubscriptionCheckout('buyer', input, 'checkout-key'),
    ).rejects.toThrow('synchronized');
    expect(fixture.queue).toHaveBeenCalled();
  },
);
it('binds an idempotency key to its original selection', async () => {
  await billing.createSubscriptionCheckout('buyer', input, 'checkout-key');
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, billingCycle: 'YEARLY' },
      'checkout-key',
    ),
  ).rejects.toThrow('same selection');
});
it('rejects a second checkout while another intent is open', async () => {
  arrangeCheckout();
  db.subscriptionCheckout.findUnique.mockResolvedValue(null);
  await expect(billing.createSubscriptionCheckout('buyer', input, 'different-key')).rejects.toThrow(
    'unfinished checkout',
  );
});
it('does not issue another payment link after completion', async () => {
  await billing.createSubscriptionCheckout('buyer', input, 'checkout-key');
  state.checkout.status = 'COMPLETED';
  expect(await billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).toMatchObject({
    status: 'COMPLETED',
  });
});
it('does not reuse an expired hosted checkout', async () => {
  await billing.createSubscriptionCheckout('buyer', input, 'checkout-key');
  state.checkout.status = 'EXPIRED';
  await expect(billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).rejects.toThrow(
    'expired',
  );
});
it('lets only the lease winner create a hosted link', async () => {
  db.subscriptionCheckout.updateMany.mockResolvedValue({ count: 0 });
  await expect(billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).rejects.toThrow(
    'awaiting provider',
  );
  expect(fetch).not.toHaveBeenCalled();
});
it('does not overwrite settlement if its webhook arrives before the link response', async () => {
  state.earlySettlement = true;
  expect((await billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).status).toBe(
    'COMPLETED',
  );
});
it.each(['httpError', 'apiError'])(
  'retains review state after provider failure %s',
  async (failure) => {
    state[failure] = true;
    await expect(
      billing.createSubscriptionCheckout('buyer', input, 'checkout-key'),
    ).rejects.toThrow();
    expect(state.checkout.status).toBe('REVIEW');
  },
);
it('refuses to return an insecure provider checkout URL', async () => {
  state.link = 'http://checkout.test/pay';
  await expect(billing.createSubscriptionCheckout('buyer', input, 'checkout-key')).rejects.toThrow(
    'invalid checkout URL',
  );
  expect(state.checkout.status).toBe('REVIEW');
});
it('requires the Bachs session identifier before saving a checkout', async () => {
  state.noCheckoutId = true;
  await expect(
    billing.createSubscriptionCheckout('buyer', { ...input, gateway: 'BACHS' }, 'checkout-key'),
  ).rejects.toThrow('identifier');
});
it('resumes a persisted intent that never started provider creation', async () => {
  arrangeCheckout('FLUTTERWAVE', { status: 'PENDING', checkoutUrl: null });
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/payments'),
    expect.objectContaining({ method: 'POST' }),
  );
});
it.each(['expiresAt', 'invalidDate'])('validates admin offer dates: %s', async (kind) => {
  await expect(
    billing.createSubscriptionTrialOffer('admin', {
      planId: 'plan',
      tierId: 'plus',
      userId: 'buyer',
      days: 7,
      expiresAt: kind === 'expiresAt' ? '2020-01-01T00:00:00Z' : 'invalid',
    }),
  ).rejects.toThrow('future');
});
it.each(['plan', 'user', 'country'])('requires the trial target %s to exist', async (target) => {
  db[target === 'plan' ? 'subscriptionPlan' : target].findUnique.mockResolvedValue(null);
  await expect(
    billing.createSubscriptionTrialOffer('admin', {
      planId: 'plan',
      tierId: 'plus',
      ...(target === 'country' ? { countryIso3: 'NGA' } : { userId: 'buyer' }),
      days: 7,
    }),
  ).rejects.toThrow('not found');
});
it('stores individual admin trial targets and a future claim deadline', async () => {
  expect(
    await billing.createSubscriptionTrialOffer('admin', {
      planId: 'plan',
      tierId: 'plus',
      userId: 'buyer',
      days: 7,
      expiresAt: '2090-01-01T00:00:00Z',
    }),
  ).toMatchObject({ userId: 'buyer', expiresAt: new Date('2090-01-01T00:00:00Z') });
});
it('uses a no-tier plan and Nigerian prices in the account catalog', async () => {
  state.plan.tier = [];
  state.user.country = { iso3: 'NGA' };
  expect((await billing.getSubscriptionCatalog('buyer')).plans[0].options[0]).toMatchObject({
    tierId: '',
    currency: 'NGN',
    coins: 1000,
  });
});

function syncTarget(gateway: 'FLUTTERWAVE' | 'BACHS', stateName = 'PENDING', age = 0) {
  const spec = billing.subscriptionCatalogSpec(state.plan, 'plus', 'MONTHLY', 'USD', gateway);
  state.syncRow = { ...spec, state: stateName, createdAt: new Date(Date.now() - age) };
  db.subscriptionProviderPlan.upsert.mockImplementation(async ({ create }: any) =>
    create.id === spec.id ? state.syncRow : { ...create, remoteId: 'ready' },
  );
  return spec;
}
it.each(['FLUTTERWAVE', 'BACHS'] as const)(
  'creates a new %s price mapping and saves its provider reference',
  async (gateway) => {
    const spec = syncTarget(gateway);
    expect((await billing.syncSubscriptionCatalog()).synced).toBe(6);
    expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith({
      where: { id: spec.id },
      data: expect.objectContaining({
        state: 'READY',
        remoteId: gateway === 'BACHS' ? 'prod_50' : '50',
      }),
    });
  },
);
it('skips disabled providers and an empty catalog without issuing network calls', async () => {
  vi.stubEnv('FLUTTERWAVE_SECK', '');
  vi.stubEnv('BACHS_WEBHOOK_SECRET', '');
  expect(await billing.syncSubscriptionCatalog()).toEqual({ synced: 0 });
  state.plans = [];
  expect(await billing.syncSubscriptionCatalog()).toEqual({ synced: 0 });
  expect(fetch).not.toHaveBeenCalled();
});
it('does not create a provider plan when another worker holds its lease', async () => {
  syncTarget('FLUTTERWAVE');
  db.subscriptionProviderPlan.updateMany.mockResolvedValue({ count: 0 });
  await expect(billing.syncSubscriptionCatalog()).rejects.toThrow('retry or review');
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['FLUTTERWAVE', 'BACHS'] as const)(
  'keeps malformed %s create responses in review',
  async (gateway) => {
    syncTarget(gateway);
    state.createdRemote = {};
    await expect(billing.syncSubscriptionCatalog()).rejects.toThrow('retry or review');
    expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'REVIEW' }) }),
    );
  },
);
it('reconciles Bachs products by immutable binding and currency before retrying', async () => {
  const spec = syncTarget('BACHS', 'CREATING', 24 * 3600000);
  state.listedProducts = [
    { id: 'wrong', metadata: {}, price: {} },
    {
      id: 'prod_existing',
      metadata: { kwonnet_binding: spec.id },
      price: { currency: 'USD', amount: '30.00' },
    },
  ];
  await billing.syncSubscriptionCatalog();
  expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ remoteId: 'prod_existing' }) }),
  );
  expect((fetch as any).mock.calls.every(([, options]: any) => options.method === 'GET')).toBe(
    true,
  );
});
it('retries a Bachs create within its idempotency window after catalog reconciliation', async () => {
  syncTarget('BACHS', 'CREATING');
  await billing.syncSubscriptionCatalog();
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/products'),
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': state.syncRow.id }),
    }),
  );
});
it('does not repeat an unknown Bachs create after the idempotency window', async () => {
  syncTarget('BACHS', 'CREATING', 24 * 3600000);
  await expect(billing.syncSubscriptionCatalog()).rejects.toThrow('review');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([undefined, 'cursor'])(
  'bounds paginated Bachs reconciliation with cursor %s',
  async (cursor) => {
    syncTarget('BACHS', 'CREATING');
    state.pagination = { has_more: true, next_cursor: cursor };
    await expect(billing.syncSubscriptionCatalog()).rejects.toThrow('review');
    expect(fetch).toHaveBeenCalledTimes(cursor ? 100 : 1);
  },
);
it('bounds Flutterwave catalog reconciliation instead of silently creating another plan', async () => {
  syncTarget('FLUTTERWAVE', 'CREATING');
  state.listedPlans = [{ name: 'different' }];
  state.planMeta = { page_info: { total_pages: 101 } };
  await expect(billing.syncSubscriptionCatalog()).rejects.toThrow('review');
  expect(fetch).toHaveBeenCalledTimes(100);
});
it('matches exact Flutterwave plan terms while skipping different prices and networks', async () => {
  const spec = syncTarget('FLUTTERWAVE', 'CREATING');
  state.listedPlans = [
    { name: 'other' },
    { ...spec.request, id: 1, currency: 'NGN' },
    { ...spec.request, id: 2, amount: 1 },
    { ...spec.request, id: 3, interval: undefined },
    { ...spec.request, id: 4, interval: 'yearly' },
    { ...spec.request, id: 5 },
  ];
  await billing.syncSubscriptionCatalog();
  expect(db.subscriptionProviderPlan.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ remoteId: '5' }) }),
  );
});
it('refuses to use an unconfigured Flutterwave environment', () => {
  vi.stubEnv('FLUTTERWAVE_SECK', '');
  expect(() => billing.subscriptionEnvironment('FLUTTERWAVE')).toThrow('not configured');
});
it('detects a concurrent trial claim after eligibility was checked', async () => {
  db.subscriptionTrialUse.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ claimedAt: now(), checkoutId: 'different' });
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer' },
      'trial-key',
    ),
  ).rejects.toThrow('already been used');
});
it.each(['invalid-id', '0x10'])('refuses invalid provider transaction IDs %s', async (id) => {
  await expect(billing.reconcileFlutterwaveSubscriptionPayment(id)).rejects.toThrow('identifier');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not associate a settled provider receipt with another checkout', async () => {
  arrangeCheckout();
  await billing.reconcileFlutterwaveSubscriptionPayment('81');
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81', 'other')).rejects.toThrow(
    'another checkout',
  );
});
it('does not accept a different payment ID from the provider', async () => {
  arrangeCheckout();
  state.payment.id = 82;
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81')).rejects.toThrow(
    'different payment',
  );
});
it('rejects a different expected checkout before granting access', async () => {
  arrangeCheckout();
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81', 'other')).rejects.toThrow(
    'another checkout',
  );
});
it('waits for the provider subscription identifier after a successful recurring charge', async () => {
  arrangeCheckout();
  state.remotes = [];
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81')).rejects.toThrow('waiting');
  expect(db.subscription.create).not.toHaveBeenCalled();
});
it('verifies the subscription association for a renewal with a different charge reference', async () => {
  arrangeCheckout();
  arrangeSub();
  state.payment.tx_ref = 'renewal-reference';
  expect(await billing.reconcileFlutterwaveSubscriptionPayment('81')).toBe(true);
  expect(state.sub.endDate.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
});
it.each([[], {}])(
  'ignores unrelated merchant charges when subscription lookup returns %j',
  async (remotes) => {
    arrangeCheckout();
    state.payment.tx_ref = 'other-product';
    state.remotes = remotes;
    expect(await billing.reconcileFlutterwaveSubscriptionPayment('81')).toBe(false);
    expect(db.transaction.create).not.toHaveBeenCalled();
  },
);
it('ignores a provider subscription that has no saved local checkout', async () => {
  arrangeCheckout();
  arrangeSub();
  state.payment.tx_ref = 'other';
  state.checkout = null;
  expect(await billing.reconcileFlutterwaveSubscriptionPayment('81')).toBe(false);
});
it('validates provider billing timestamps', async () => {
  arrangeCheckout();
  state.payment.created_at = 'invalid';
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81')).rejects.toThrow(
    'billing dates',
  );
});
it.each(['BUSINESS', 'GOVERNMENT'])(
  'sets the correct premium badge for a paid %s account',
  async (userType) => {
    arrangeCheckout('FLUTTERWAVE', { recurring: false });
    state.user.userType = userType;
    state.payment.customer.id = undefined;
    await billing.reconcileFlutterwaveSubscriptionPayment('81');
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'buyer' },
      data: { meta: expect.objectContaining({ color: userType === 'BUSINESS' ? 'gold' : 'grey' }) },
    });
  },
);
it('preserves the already granted period when an older receipt is confirmed later', async () => {
  arrangeCheckout();
  arrangeSub({ endDate: new Date('2090-01-01') });
  await billing.reconcileFlutterwaveSubscriptionPayment('81');
  expect(state.sub.endDate).toEqual(new Date('2090-01-01'));
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it.each([{ providerSubscriptionId: 'different' }, { isPrimary: false }])(
  'does not overwrite a conflicting local subscription %j',
  async (change) => {
    arrangeCheckout();
    arrangeSub(change);
    await expect(billing.reconcileFlutterwaveSubscriptionPayment('81')).rejects.toThrow(
      /changed unexpectedly|superseded/,
    );
    expect(db.transaction.create).not.toHaveBeenCalled();
  },
);
it('does not let a duplicate receipt change its bound provider subscription ID', async () => {
  arrangeCheckout('BACHS');
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.created',
    data: { id: 'sub_50' },
  });
  state.sub.providerSubscriptionId = 'another';
  await expect(
    billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.updated',
      data: { id: 'sub_50' },
    }),
  ).rejects.toThrow('changed unexpectedly');
});
it('does not create a second local subscription while another paid one exists', async () => {
  arrangeCheckout();
  state.active = { endDate: new Date('2090-01-01') };
  await expect(billing.reconcileFlutterwaveSubscriptionPayment('81')).rejects.toThrow(
    'still active',
  );
  expect(db.subscription.create).not.toHaveBeenCalled();
});
it('keeps local cancellation effective when a newly paid period arrives', async () => {
  arrangeCheckout();
  arrangeSub({ renewalCancelledAt: now(), isRecurring: false });
  await billing.reconcileFlutterwaveSubscriptionPayment('81');
  expect(state.sub.isRecurring).toBe(false);
});
it.each(['different-id', 'mismatch'])(
  'rejects invalid Bachs subscription responses %s',
  async (kind) => {
    arrangeCheckout('BACHS');
    if (kind === 'different-id') state.bachs.id = 'other';
    else state.bachs.amount = '1.00';
    await expect(
      billing.processSubscriptionWebhook('BACHS', {
        type: 'customer.subscription.created',
        data: { id: 'sub_50' },
      }),
    ).rejects.toThrow(/different subscription|does not match/);
  },
);
it.each([
  { currency: 'NGN' },
  { customer: { email: 'other', customer_id: 'cust_50' } },
  { product: null },
  { billing_cycle: { interval: 'year', frequency: 1 } },
  { billing_cycle: { interval: 'month', frequency: 2 } },
])('does not grant access for mismatched Bachs terms %j', async (change) => {
  arrangeCheckout('BACHS');
  Object.assign(state.bachs, change);
  await expect(
    billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    }),
  ).rejects.toThrow(/does not match/);
});
it('does not grant a native trial without an eligible local offer', async () => {
  arrangeCheckout('BACHS');
  state.bachs.status = 'trialing';
  await expect(
    billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    }),
  ).rejects.toThrow('Unexpected');
});
it.each(['too-long', 'different-end', 'no-period'])(
  'checks the native trial period %s',
  async (kind) => {
    arrangeCheckout('BACHS', { offerId: 'offer', trialDays: 7 });
    state.bachs.status = 'trialing';
    state.bachs.current_period_end = new Date(
      Date.now() + (kind === 'too-long' ? 8 : 7) * 86400000,
    ).toISOString();
    state.bachs.trial_end =
      kind === 'different-end' ? now().toISOString() : state.bachs.current_period_end;
    if (kind === 'no-period') state.bachs.current_period_end = state.bachs.current_period_start;
    await expect(
      billing.processSubscriptionWebhook('BACHS', {
        type: 'customer.subscription.created',
        data: { id: 'sub_50' },
      }),
    ).rejects.toThrow('period');
  },
);
it('rejects a zero-length paid billing period', async () => {
  arrangeCheckout('BACHS');
  state.bachs.current_period_end = state.bachs.current_period_start;
  await expect(
    billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    }),
  ).rejects.toThrow('billing period');
});
it.each(['past_due', 'unpaid', 'paused', 'canceled'])(
  'reflects Bachs %s state without granting an unpaid period',
  async (status) => {
    arrangeCheckout('BACHS');
    arrangeSub({
      providerGateway: 'BACHS',
      providerSubscriptionId: 'sub_50',
      providerCustomerId: 'cust_50',
    });
    state.bachs.status = status;
    await billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.updated',
      data: { id: 'sub_50' },
    });
    expect(state.sub.providerState).toBe(status);
    expect(db.transaction.create).not.toHaveBeenCalled();
  },
);
it('does not grant a newly created but unpaid provider subscription', async () => {
  arrangeCheckout('BACHS');
  state.bachs.status = 'past_due';
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.updated',
    data: { id: 'sub_50' },
  });
  expect(db.subscription.create).not.toHaveBeenCalled();
});
it('retrieves a Bachs customer that is represented by an opaque identifier', async () => {
  arrangeCheckout('BACHS');
  state.bachs.customer = 'cust_50';
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.created',
    data: { id: 'sub_50' },
  });
  expect(state.sub.providerCustomerId).toBe('cust_50');
});
it('uses the enrolled Bachs customer ID after a legitimate customer email change', async () => {
  arrangeCheckout('BACHS');
  arrangeSub({
    providerGateway: 'BACHS',
    providerSubscriptionId: 'sub_50',
    providerCustomerId: 'cust_50',
  });
  state.bachs.customer.email = 'updated@test.invalid';
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.updated',
    data: { id: 'sub_50' },
  });
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it('requires a stable Bachs customer identifier', async () => {
  arrangeCheckout('BACHS');
  state.bachs.customer = { email: state.user.email };
  await expect(
    billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    }),
  ).rejects.toThrow('customer identifier');
});
it.each([
  { items: [{ product: { id: 'prod_50' } }], product: undefined },
  { items: [{ product_id: 'prod_50' }], product: undefined },
  { product: undefined, product_id: 'prod_50' },
])('accepts documented expanded and reference Bachs product forms %j', async (change) => {
  arrangeCheckout('BACHS');
  Object.assign(state.bachs, change);
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.created',
    data: { id: 'sub_50' },
  });
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it('ignores unrelated Bachs subscriptions', async () => {
  arrangeCheckout('BACHS');
  state.checkout = null;
  expect(
    await billing.processSubscriptionWebhook('BACHS', {
      type: 'customer.subscription.created',
      data: { id: 'sub_50' },
    }),
  ).toBe(false);
});
it('uses the stored provider subscription association when event metadata is unavailable', async () => {
  arrangeCheckout('BACHS');
  arrangeSub({
    providerGateway: 'BACHS',
    providerSubscriptionId: 'sub_50',
    providerCustomerId: 'cust_50',
  });
  state.bachs.metadata = null;
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'customer.subscription.updated',
    data: { id: 'sub_50' },
  });
  expect(db.transaction.create).toHaveBeenCalledOnce();
});

it('refuses to check a checkout under another provider account', async () => {
  arrangeCheckout('BACHS', { environment: 'other' });
  await expect(billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).rejects.toThrow(
    'different provider account',
  );
});
it('recovers a Bachs checkout response using the exact saved payload and key', async () => {
  arrangeCheckout('BACHS', {
    checkoutId: null,
    checkoutUrl: null,
    status: 'REVIEW',
    updatedAt: new Date(0),
  });
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/checkout-sessions'),
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': 'checkout' }),
    }),
  );
});
it('keeps an incomplete Bachs recovery pending when the API omits the session ID', async () => {
  arrangeCheckout('BACHS', { checkoutId: null, status: 'REVIEW', updatedAt: new Date(0) });
  state.noCheckoutId = true;
  await expect(billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).rejects.toThrow(
    'confirmation is pending',
  );
});
it.each([
  { updatedAt: new Date() },
  { createdAt: new Date(0), updatedAt: new Date(0) },
  { request: { email: 'buyer@test.invalid' }, updatedAt: new Date(0) },
])(
  'does not repeat an uncertain Bachs creation outside its safe retry conditions %j',
  async (change) => {
    arrangeCheckout('BACHS', { checkoutId: null, status: 'REVIEW', ...change });
    expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
      'REVIEW',
    );
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([{}, { offerId: 'offer' }])(
  'expires a Bachs session only after the provider confirms expiry %j',
  async (change) => {
    arrangeCheckout('BACHS', change);
    state.session = { status: 'expired' };
    expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
      'EXPIRED',
    );
    expect(db.transaction.create).not.toHaveBeenCalled();
    if (state.checkout.offerId) expect(db.subscriptionTrialUse.deleteMany).toHaveBeenCalled();
  },
);
it('does not replace a completed settlement with an expiry response', async () => {
  arrangeCheckout('BACHS');
  state.session = {
    get status() {
      state.checkout.status = 'COMPLETED';
      return 'expired';
    },
  };
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
  expect(db.subscriptionCheckout.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: 'EXPIRED' } }),
  );
});
it('expires an old Flutterwave link only after looking for a successful charge', async () => {
  arrangeCheckout('FLUTTERWAVE', {
    request: { email: state.user.email, payload: { link_expiration: new Date(0).toISOString() } },
  });
  state.payments = [];
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe('EXPIRED');
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/transactions?tx_ref=checkout'),
    expect.anything(),
  );
});
it('a successful final verification wins over stale hosted-link expiry', async () => {
  arrangeCheckout('FLUTTERWAVE', {
    request: { email: state.user.email, payload: { link_expiration: new Date(0).toISOString() } },
  });
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
});
it.each([
  { subscription: 'sub_50' },
  { subscription: { id: 'sub_50' } },
  { subscription_id: 'sub_50' },
  { recurring: { subscription_id: 'sub_50' } },
  { recurring: { id: 'sub_50' } },
])('resolves Bachs hosted subscription reference %j', async (shape) => {
  arrangeCheckout('BACHS');
  state.session = { status: 'completed', ...shape };
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
});
it('resolves a Bachs subscription through the checkout customer if a session has no subscription ID', async () => {
  arrangeCheckout('BACHS');
  state.session = { status: 'completed', customer: { customer_id: 'cust_50' } };
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe(
    'COMPLETED',
  );
});
it.each([{}, { customer: { id: 'cust_50' } }])(
  'leaves an unconfirmed Bachs subscription pending when no association is found %j',
  async (shape) => {
    arrangeCheckout('BACHS');
    state.session = { status: 'completed', ...shape };
    state.listedSubscriptions = [];
    expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe('OPEN');
    expect(db.subscription.create).not.toHaveBeenCalled();
  },
);
it('bounds Bachs subscription association pagination', async () => {
  arrangeCheckout('BACHS');
  state.session = { status: 'completed', customer: { id: 'cust_50' } };
  state.listedSubscriptions = [];
  state.pagination = { has_more: true };
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe('OPEN');
  expect(fetch).toHaveBeenCalledTimes(21);
});
it('does not reconcile an unfinished Bachs session without a subscription reference', async () => {
  arrangeCheckout('BACHS');
  state.session = { status: 'open' };
  expect((await billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).status).toBe('OPEN');
});
it('checks expected Bachs checkout ownership before settlement', async () => {
  const checkout = arrangeCheckout('BACHS');
  db.subscriptionCheckout.findFirst
    .mockResolvedValueOnce(checkout)
    .mockResolvedValueOnce({ ...checkout, id: 'other' });
  await expect(billing.getSubscriptionCheckoutStatus('buyer', 'checkout')).rejects.toThrow(
    'another checkout',
  );
});
it.each([undefined, { event: 'ignored' }, { event: 'charge.completed', data: {} }])(
  'ignores unrelated Flutterwave events %j',
  async (event) => {
    expect(await billing.processSubscriptionWebhook('FLUTTERWAVE', event)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('verifies a successful charge webhook by transaction ID', async () => {
  arrangeCheckout();
  expect(
    await billing.processSubscriptionWebhook('FLUTTERWAVE', {
      event: 'charge.completed',
      data: { id: 81 },
    }),
  ).toBe(true);
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it.each([
  undefined,
  { type: 'ignored' },
  { type: 'invoice.created', data: {} },
  { type: 'customer.subscription.updated', data: {} },
])('ignores unrelated Bachs events %j', async (event) => {
  expect(await billing.processSubscriptionWebhook('BACHS', event)).toBe(false);
});
it.each([
  { subscription: 'sub_50' },
  { subscription: { id: 'sub_50' } },
  { subscription_id: 'sub_50' },
])('rechecks provider state for Bachs invoice events %j', async (data) => {
  arrangeCheckout('BACHS');
  await billing.processSubscriptionWebhook('BACHS', { type: 'invoice.paid', data });
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it.each([
  { metadata: { subscription_checkout: 'checkout' }, checkout_id: 'chk_50' },
  { id: 'chk_50' },
])('verifies completed Bachs checkout webhooks %j', async (data) => {
  arrangeCheckout('BACHS');
  expect(
    await billing.processSubscriptionWebhook('BACHS', { type: 'checkout.completed', data }),
  ).toBe(true);
  expect(state.checkout.status).toBe('COMPLETED');
});
it('recovers the hosted checkout ID from a signed completion webhook', async () => {
  arrangeCheckout('BACHS', { checkoutId: null });
  await billing.processSubscriptionWebhook('BACHS', {
    type: 'checkout.completed',
    data: { metadata: { subscription_checkout: 'checkout' }, id: 'chk_50' },
  });
  expect(state.checkout.checkoutId).toBe('chk_50');
});
it('does not fabricate a Bachs checkout ID from a malformed event', async () => {
  arrangeCheckout('BACHS', { checkoutId: null });
  expect(
    await billing.processSubscriptionWebhook('BACHS', {
      type: 'checkout.completed',
      data: { metadata: { subscription_checkout: 'checkout' }, id: 50 },
    }),
  ).toBe(true);
  expect(state.checkout.checkoutId).toBeNull();
});
it.each([{ metadata: { subscription_checkout: 'unknown' } }, {}, { checkout_id: 'unknown' }])(
  'ignores unknown Bachs checkout completion events %j',
  async (data) => {
    db.subscriptionCheckout.findUnique.mockResolvedValue(null);
    db.subscriptionCheckout.findFirst.mockResolvedValue(null);
    expect(
      await billing.processSubscriptionWebhook('BACHS', { type: 'checkout.completed', data }),
    ).toBe(false);
  },
);
it.each([
  { providerSubscriptionId: null },
  { providerGateway: null },
  { providerGateway: 'WALLET' },
  { providerEnvironment: 'other' },
])('does not poll an invalid or unrelated subscription %j', async (change) => {
  arrangeCheckout();
  arrangeSub(change);
  db.subscription.findMany.mockResolvedValue([state.sub]);
  expect(
    await billing.processSubscriptionWebhook('FLUTTERWAVE', {
      event: 'subscription.cancelled',
      data: {},
    }),
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it('re-queries Bachs state when refreshing a known provider subscription', async () => {
  arrangeCheckout('BACHS');
  arrangeSub({
    providerGateway: 'BACHS',
    providerEnvironment: billing.subscriptionEnvironment('BACHS'),
    providerSubscriptionId: 'sub_50',
    providerCustomerId: 'cust_50',
  });
  db.subscription.findMany.mockResolvedValue([state.sub]);
  await billing.processSubscriptionWebhook('FLUTTERWAVE', {
    event: 'subscription.cancelled',
    data: { customer: { email: state.user.email } },
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/v1/subscriptions/sub_50'),
    expect.anything(),
  );
});
it.each(['active', 'cancelled', 'missing'])(
  'refreshes the actual Flutterwave subscription state: %s',
  async (status) => {
    arrangeCheckout();
    arrangeSub();
    state.remote.status = status;
    if (status === 'missing') state.remotes = [];
    db.subscription.findMany.mockResolvedValue([state.sub]);
    await billing.processSubscriptionWebhook('FLUTTERWAVE', {
      event: 'subscription.cancelled',
      data: { customer: { email: state.user.email } },
    });
    if (status === 'cancelled') expect(state.sub.isRecurring).toBe(false);
    if (status === 'active') expect(state.sub.providerState).toBe('active');
  },
);
it.each([{ providerSubscriptionId: null }, { providerEnvironment: 'other' }])(
  'does not report cancellation success without the original provider association %j',
  async (change) => {
    arrangeCheckout();
    arrangeSub(change);
    expect(
      (await billing.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED', userId: 'buyer' }))
        .status,
    ).toBe(409);
    expect(state.sub.isRecurring).toBe(true);
  },
);
it.each([{ cancel_at_period_end: true }, { status: 'canceled' }, { status: 'cancelled' }])(
  'does not send a duplicate Bachs cancellation for %j',
  async (change) => {
    arrangeCheckout('BACHS');
    arrangeSub({
      providerGateway: 'BACHS',
      providerEnvironment: billing.subscriptionEnvironment('BACHS'),
      providerSubscriptionId: 'sub_50',
    });
    Object.assign(state.bachs, change);
    expect(
      (await billing.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED', userId: 'buyer' }))
        .status,
    ).toBe(200);
    expect((fetch as any).mock.calls.some(([, opts]: any) => opts.method === 'DELETE')).toBe(false);
  },
);
it('does not repeat an acknowledged Flutterwave cancellation', async () => {
  arrangeCheckout();
  arrangeSub();
  state.remote.status = 'cancelled';
  expect(
    (await billing.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED', userId: 'buyer' }))
      .status,
  ).toBe(200);
  expect((fetch as any).mock.calls.some(([, opts]: any) => opts.method === 'PUT')).toBe(false);
});
it.each([{ endDate: new Date('2090-01-01') }, { isPrimary: false, endDate: new Date(0) }])(
  'does not remove premium access when the expiry job sees a concurrently changed subscription %j',
  async (change) => {
    arrangeSub(change);
    await billing.cancelAppSubscription({ subId: 'sub', status: 'EXPIRED' });
    expect(db.user.update).not.toHaveBeenCalled();
  },
);
it('reconciles no provider charges when Flutterwave is not configured', async () => {
  vi.stubEnv('FLUTTERWAVE_SECK', '');
  await billing.reconcileSubscriptionPayments();
  expect(fetch).not.toHaveBeenCalled();
});
it('expires non-renewing access without creating a payment', async () => {
  arrangeSub({ providerGateway: 'WALLET', isRecurring: false, endDate: new Date(0) });
  state.expired = [{ id: 'sub' }];
  state.payments = [];
  await billing.reconcileSubscriptionPayments();
  expect(state.sub.status).toBe('EXPIRED');
  expect(db.transaction.create).not.toHaveBeenCalled();
});
it('recovers pending checkouts and due subscriptions in the scheduled sweep', async () => {
  arrangeCheckout();
  arrangeSub();
  db.subscriptionCheckout.findMany.mockResolvedValueOnce([state.checkout]).mockResolvedValue([]);
  state.due = [state.sub];
  await billing.reconcileSubscriptionPayments();
  expect(state.checkout.status).toBe('COMPLETED');
  expect(db.transaction.create).toHaveBeenCalledOnce();
});
it('retains provider failures for retry without failing the rest of the sweep', async () => {
  arrangeCheckout();
  arrangeSub();
  state.checkout.environment = 'wrong';
  db.subscriptionCheckout.findMany.mockResolvedValueOnce([state.checkout]);
  state.due = [state.sub];
  state.remotes = [];
  state.payments = [{ id: 'invalid' }];
  await billing.reconcileSubscriptionPayments();
  expect(db.subscription.update).toHaveBeenCalledWith({
    where: { id: 'sub' },
    data: { providerUpdatedAt: expect.any(Date) },
  });
});
it('logs a failed provider refresh and advances its fair-scheduling timestamp', async () => {
  arrangeCheckout();
  arrangeSub();
  state.due = [state.sub];
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (++call === 1) throw new Error('provider down');
      return Response.json({ status: 'success', data: [] });
    }),
  );
  await billing.reconcileSubscriptionPayments();
  expect(db.subscription.update).toHaveBeenCalledWith({
    where: { id: 'sub' },
    data: { providerUpdatedAt: expect.any(Date) },
  });
});
it('paginates a full pending-checkout batch and continues after failures', async () => {
  state.payments = [];
  db.subscriptionCheckout.findMany
    .mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({ id: String(i), userId: 'buyer' })),
    )
    .mockResolvedValue([]);
  await billing.reconcileSubscriptionPayments();
  expect(db.subscriptionCheckout.findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: { id: '99' }, skip: 1 }),
  );
});
it('paginates missed payment recovery and skips charges with no subscription hint', async () => {
  state.payments = [
    { id: 81, tx_ref: 'unrelated' },
    { id: 82, customer: { email: 'other@test.invalid' } },
  ];
  state.paymentMeta = { page_info: { total_pages: 2 } };
  await billing.reconcileSubscriptionPayments();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(db.transaction.create).not.toHaveBeenCalled();
});
it('rejects a stale wallet coin quote before debiting', async () => {
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', quotedCoins: 1000 },
      'wallet-key',
    ),
  ).rejects.toThrow('price changed');
  expect(db.transaction.create).not.toHaveBeenCalled();
  expect(
    (
      await billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'WALLET', quotedCoins: 2000 },
        'wallet-key',
      )
    ).status,
  ).toBe('COMPLETED');
});
it('requires the displayed wallet trial renewal quote to match the saved debit amount', async () => {
  await expect(
    billing.createSubscriptionCheckout(
      'buyer',
      { ...input, gateway: 'WALLET', offerId: 'offer', quotedCoins: 1000 },
      'trial-key',
    ),
  ).rejects.toThrow('price changed');
  expect(db.subscription.create).not.toHaveBeenCalled();
  expect(
    (
      await billing.createSubscriptionCheckout(
        'buyer',
        { ...input, gateway: 'WALLET', offerId: 'offer', quotedCoins: 2000 },
        'trial-key',
      )
    ).status,
  ).toBe('COMPLETED');
});
it('finds a cancelled Flutterwave subscription after the active list is empty', async () => {
  arrangeCheckout();
  arrangeSub();
  let reads = 0;
  Object.defineProperty(state, 'remotes', {
    configurable: true,
    get: () => (++reads === 1 ? [] : [{ ...state.remote, status: 'cancelled' }]),
  });
  db.subscription.findMany.mockResolvedValue([state.sub]);
  await billing.processSubscriptionWebhook('FLUTTERWAVE', {
    event: 'subscription.cancelled',
    data: { customer: { email: state.user.email } },
  });
  expect(state.sub.isRecurring).toBe(false);
});
it('the wallet settlement service independently rejects a plan for another account type', async () => {
  state.user.userType = 'BUSINESS';
  expect(
    await billing.purchaseAppSubscriptionWithWallet(
      {
        planId: 'plan',
        amount: 1,
        currency: 'COINS',
        planType: 'MONTHLY',
        isRecurring: true,
        meta: { tierId: 'plus' },
        idempotencyKey: 'wallet-key',
      },
      'buyer',
    ),
  ).toMatchObject({ status: 400, data: expect.stringContaining('not available') });
  expect(db.transaction.create).not.toHaveBeenCalled();
});
it('rechecks unfinished provider checkouts under the wallet debit lock', async () => {
  arrangeCheckout();
  await expect(
    billing.createSubscriptionCheckout('buyer', { ...input, gateway: 'WALLET' }, 'wallet-key'),
  ).rejects.toThrow('existing checkout');
  expect(db.transaction.create).not.toHaveBeenCalled();
});
it('does not send a provider request if credentials disappear during a refresh', async () => {
  arrangeCheckout();
  arrangeSub();
  db.subscription.findMany.mockResolvedValue([state.sub]);
  db.subscriptionProviderPlan.findUniqueOrThrow.mockImplementation(async () => {
    vi.stubEnv('FLUTTERWAVE_SECK', '');
    return state.binding;
  });
  await expect(
    billing.processSubscriptionWebhook('FLUTTERWAVE', {
      event: 'subscription.cancelled',
      data: {},
    }),
  ).rejects.toThrow('not configured');
  expect(fetch).not.toHaveBeenCalled();
});
