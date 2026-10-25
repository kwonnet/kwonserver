import { beforeEach, expect, it, vi } from 'vitest';
import { response } from './fixtures';
import { WalletError } from '@/services/walletLedger';
const services = vi.hoisted(() => ({
  getSubscriptionCatalog: vi.fn(),
  createSubscriptionCheckout: vi.fn(),
  getSubscriptionCheckoutStatus: vi.fn(),
  subscriptionAdministration: vi.fn(),
  createSubscriptionTrialOffer: vi.fn(),
  disableSubscriptionTrialOffer: vi.fn(),
  verifyFlutterwaveSubscriptionSignature: vi.fn(),
  processSubscriptionWebhook: vi.fn(),
}));
vi.mock('@/services/v1/subscriptions', () => services);
import {
  subscriptionCatalogController,
  subscriptionCheckoutController,
  subscriptionCheckoutStatusController,
  subscriptionAdminController,
  flutterwaveSubscriptionWebhookController,
} from '@/controllers/v1/subscriptions';
const selection = {
  planId: 'premium',
  tierId: 'gold',
  billingCycle: 'MONTHLY',
  gateway: 'FLUTTERWAVE',
  recurring: true,
};
beforeEach(() => {
  vi.resetAllMocks();
});
it('binds catalog and checkout to the authenticated user and passes the idempotency key', async () => {
  const req: any = { user: { id: 'viewer' }, body: selection, get: () => 'intent-12345' };
  const res = response();
  await subscriptionCheckoutController(req, res);
  expect(services.createSubscriptionCheckout).toHaveBeenCalledWith(
    'viewer',
    selection,
    'intent-12345',
  );
  await subscriptionCatalogController(req, res);
  expect(services.getSubscriptionCatalog).toHaveBeenCalledWith('viewer');
  expect(res.headers['Cache-Control']).toBe('private, no-store');
});
it.each([{ amount: 0.01 }, { userId: 'victim' }, { recurring: 'true' }, { gateway: 'CRYPTO' }])(
  'rejects untrusted checkout parameters %j',
  async (override) => {
    const res = response();
    await subscriptionCheckoutController(
      {
        user: { id: 'viewer' },
        body: { ...selection, ...override },
        get: () => 'key-12345',
      } as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(services.createSubscriptionCheckout).not.toHaveBeenCalled();
  },
);
it('only checks owned checkout records', async () => {
  const res = response();
  await subscriptionCheckoutStatusController(
    { user: { id: 'viewer' }, params: { id: 'checkout' }, query: { paymentId: '82' } } as any,
    res,
  );
  expect(services.getSubscriptionCheckoutStatus).toHaveBeenCalledWith('viewer', 'checkout', '82');
});
it.each(['USER', 'MODERATOR'])(
  'denies %s access to admin subscription operations',
  async (role) => {
    const res = response();
    await subscriptionAdminController({ user: { id: 'viewer', role }, method: 'GET' } as any, res);
    expect(res.statusCode).toBe(403);
    expect(services.subscriptionAdministration).not.toHaveBeenCalled();
  },
);
it('records the authenticated administrator as trial creator', async () => {
  const offer = { planId: 'premium', tierId: 'gold', countryIso3: 'NGA', days: 14 };
  const res = response();
  await subscriptionAdminController(
    { user: { id: 'admin', role: 'ADMIN' }, body: offer, params: {}, method: 'POST' } as any,
    res,
  );
  expect(res.statusCode).toBe(201);
  expect(services.createSubscriptionTrialOffer).toHaveBeenCalledWith('admin', offer);
});
it('does not reveal provider payloads when a payment service fails', async () => {
  services.createSubscriptionCheckout.mockRejectedValue(
    new Error('<html>secret proxy error</html>'),
  );
  const res = response();
  await subscriptionCheckoutController(
    { user: { id: 'viewer' }, body: selection, get: () => 'intent-12345' } as any,
    res,
  );
  expect(res.statusCode).toBe(503);
  expect(res.body).not.toContain('html');
});
it('returns safe domain errors so buyers can resume a checkout', async () => {
  services.createSubscriptionCheckout.mockRejectedValue(
    new WalletError('Check your existing checkout', 409),
  );
  const res = response();
  await subscriptionCheckoutController(
    { user: { id: 'viewer' }, body: selection, get: () => 'intent-12345' } as any,
    res,
  );
  expect(res.statusCode).toBe(409);
  expect(res.body).toBe('Check your existing checkout');
});
it('verifies Flutterwave webhook authentication before touching subscription state', async () => {
  const res = response();
  res.end = vi.fn();
  services.verifyFlutterwaveSubscriptionSignature.mockReturnValue(false);
  await flutterwaveSubscriptionWebhookController({ get: () => 'wrong', body: {} } as any, res);
  expect(res.statusCode).toBe(401);
  expect(services.processSubscriptionWebhook).not.toHaveBeenCalled();
  services.verifyFlutterwaveSubscriptionSignature.mockReturnValue(true);
  await flutterwaveSubscriptionWebhookController(
    { get: () => 'right', body: { event: 'charge.completed' } } as any,
    res,
  );
  expect(services.processSubscriptionWebhook).toHaveBeenCalledWith('FLUTTERWAVE', {
    event: 'charge.completed',
  });
});
it('lists admin catalog references and disables trial offers through role-gated routes', async () => {
  const res = response();
  services.subscriptionAdministration.mockResolvedValue({ plans: [] });
  await subscriptionAdminController(
    { user: { id: 'admin', role: 'SUPER' }, method: 'GET' } as any,
    res,
  );
  expect(res.body).toEqual({ plans: [] });
  await subscriptionAdminController(
    { user: { id: 'admin', role: 'ADMIN' }, method: 'DELETE', params: { id: 'offer' } } as any,
    res,
  );
  expect(services.disableSubscriptionTrialOffer).toHaveBeenCalledWith('offer');
});
it('reports catalog, status and administration failures without leaking provider errors', async () => {
  for (const [controller, method, req] of [
    [subscriptionCatalogController, services.getSubscriptionCatalog, { user: { id: 'viewer' } }],
    [
      subscriptionCheckoutStatusController,
      services.getSubscriptionCheckoutStatus,
      { user: { id: 'viewer' }, params: { id: 'checkout' }, query: { paymentId: ['81'] } },
    ],
    [
      subscriptionAdminController,
      services.subscriptionAdministration,
      { user: { id: 'admin', role: 'ADMIN' }, method: 'GET' },
    ],
  ] as any) {
    method.mockRejectedValue(new Error('private'));
    const res = response();
    await controller(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('private');
  }
});
it('returns an error to retry a correctly authenticated webhook whose verification fails', async () => {
  const res = response();
  services.verifyFlutterwaveSubscriptionSignature.mockReturnValue(true);
  services.processSubscriptionWebhook.mockRejectedValue(
    new WalletError('Provider is unavailable', 503),
  );
  await flutterwaveSubscriptionWebhookController({ get: () => 'secret', body: {} } as any, res);
  expect(res.statusCode).toBe(503);
});
it('passes missing payment IDs as undefined and lets the service resolve the reference', async () => {
  const res = response();
  await subscriptionCheckoutStatusController(
    { user: { id: 'viewer' }, params: { id: 'checkout' }, query: {} } as any,
    res,
  );
  expect(services.getSubscriptionCheckoutStatus).toHaveBeenCalledWith(
    'viewer',
    'checkout',
    undefined,
  );
  await subscriptionCheckoutController(
    { user: { id: 'viewer' }, body: selection, get: () => undefined } as any,
    res,
  );
  expect(services.createSubscriptionCheckout).toHaveBeenCalledWith('viewer', selection, '');
});
it('requires an administrator role even when no role claim is supplied', async () => {
  const res = response();
  await subscriptionAdminController({ user: { id: 'viewer' }, method: 'GET' } as any, res);
  expect(res.statusCode).toBe(403);
});
