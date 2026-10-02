import { beforeEach, expect, it, vi } from 'vitest';
import { FlutterwaveTxnType } from '@/types';
const deps = vi.hoisted(() => ({ verify: vi.fn(), findTxn: vi.fn(), plans: vi.fn(), update: vi.fn(), transaction: vi.fn(),
  post: vi.fn(), planPost: vi.fn(), cancel: vi.fn() }));
vi.mock('@/db', () => ({ default: { transaction: { findFirst: deps.findTxn }, subscriptionPlan: { findMany: deps.plans, update: deps.update }, $transaction: deps.transaction } }));
vi.mock('@/utils/flutterwave', () => ({ flwAPI: { Transaction: { verify: deps.verify } } }));
vi.mock('axios', () => ({ default: { post: deps.post, create: () => ({ post: deps.planPost, put: deps.cancel }) } }));
import { generateFlutterwavePaymentLink, verifyFlutterwavePayment, syncFlwSubscriptionPlans } from '@/services/v1/payments';
beforeEach(() => {
  Object.values(deps).forEach(fn => fn.mockReset());
  deps.findTxn.mockResolvedValue(null); deps.transaction.mockImplementation((queries: any[]) => Promise.all(queries));
});
const args = { status: 'successful', tx_ref: 'ref', transaction_id: 12 };
const txn = (overrides = {}) => ({ id: 12, status: 'successful', tx_ref: 'ref', amount: 5,
  meta: { type: FlutterwaveTxnType.COIN_PACKAGE, id: 'coin', userId: 'u', currency: 'USD', amount: '100', price: '5', bonus: '10', name: 'Starter', isActive: true }, ...overrides });
it('creates a payment link using server-side credentials', async () => {
  deps.post.mockResolvedValue({ data: { data: { link: 'https://checkout.invalid/ref' } } });
  expect(await generateFlutterwavePaymentLink({ tx_ref: 'ref' } as any)).toEqual({ status: 200, data: 'https://checkout.invalid/ref' });
  expect(deps.post).toHaveBeenCalledWith('https://payments.invalid', { tx_ref: 'ref' }, { headers: {
    Authorization: 'Bearer unit-test-only', 'Content-Type': 'application/json',
  } });
});
it.each([{ status: 422, response: { data: { message: 'Invalid amount' } } }, { message: 'Network error' }])('reports payment provider errors', async error => {
  deps.post.mockRejectedValue(error); const result = await generateFlutterwavePaymentLink({} as any);
  expect(result.status).toBe(error.status ?? 500); expect(result.data).toBe(error.response?.data.message ?? error.message);
});
it.each([{ status: 'failed' }, { tx_ref: 'wrong-ref' }])('rejects mismatched provider verification %j', async overrides => {
  deps.verify.mockResolvedValue({ data: txn(overrides) }); expect((await verifyFlutterwavePayment(args)).status).toBe(400);
  expect(deps.findTxn).not.toHaveBeenCalled();
});
it('rejects replay of an already-settled transaction', async () => {
  deps.verify.mockResolvedValue({ data: txn() }); deps.findTxn.mockResolvedValue({ id: 'settled' });
  expect(await verifyFlutterwavePayment(args)).toEqual({ status: 400, message: 'Transaction already settled' });
  expect(deps.findTxn).toHaveBeenCalledWith({ where: { exTxnRef: 'ref' } });
});
it('normalizes coin purchase metadata after successful verification', async () => {
  deps.verify.mockResolvedValue({ data: txn() }); const result = await verifyFlutterwavePayment(args);
  expect(result).toMatchObject({ status: 200, data: { id: 'coin', amount: 100, bonus: 10, userId: 'u',
    gateway: 'FLUTTERWAVE', source: 'FIAT', coin: { price: 5 }, meta: { txn: { txnId: '12', txnRef: 'ref', amount: 5 } } } });
});
it('normalizes subscription purchase metadata', async () => {
  deps.verify.mockResolvedValue({ data: txn({ meta: { type: 'APP_SUBSCRIPTION', planId: 'pro', amount: '5', planType: 'MONTHLY', planName: 'Pro', isRecurring: true, currency: 'USD' } }) });
  expect(await verifyFlutterwavePayment(args)).toMatchObject({ status: 200, data: { planId: 'pro', amount: 5, isRecurring: true, planType: 'MONTHLY' } });
});
it('propagates verification provider errors', async () => {
  deps.verify.mockRejectedValue({ status: 503, response: { data: { message: 'Unavailable' } } });
  expect(await verifyFlutterwavePayment(args)).toEqual({ status: 503, message: 'Unavailable', data: null });
});
const plan = { id: 'pro', name: 'Pro', price: 10, discount: 0.2, tier: [], metadata: { preserved: true } };
it('does not create external plans for an empty catalog', async () => {
  deps.plans.mockResolvedValue([]); expect((await syncFlwSubscriptionPlans()).status).toBe(404); expect(deps.planPost).not.toHaveBeenCalled();
});
it('creates monthly/yearly plans with the annual discount and preserves metadata', async () => {
  deps.plans.mockResolvedValue([plan]); deps.planPost.mockResolvedValue({ data: { data: { id: 123, status: 'active' } } });
  expect((await syncFlwSubscriptionPlans()).status).toBe(200);
  expect(deps.planPost).toHaveBeenCalledWith('/payment-plans', expect.objectContaining({ amount: 10, interval: 'Monthly' }));
  expect(deps.planPost).toHaveBeenCalledWith('/payment-plans', expect.objectContaining({ amount: 96, interval: 'Yearly' }));
  expect(deps.update.mock.calls[0][0].data.metadata).toMatchObject({ preserved: true, flw: expect.any(Array) });
});
it('uses each tier price when creating plan variants', async () => {
  deps.plans.mockResolvedValue([{ ...plan, tier: [{ id: 'gold', name: 'Gold', price: 20 }] }]);
  deps.planPost.mockResolvedValue({ data: { data: { id: 123 } } }); await syncFlwSubscriptionPlans();
  expect(deps.planPost).toHaveBeenCalledWith('/payment-plans', expect.objectContaining({ amount: 192, planRef: 'yearly_pro_gold' }));
});
it('cancels successful external plans if another plan fails and does not persist partial data', async () => {
  deps.plans.mockResolvedValue([plan]); deps.planPost.mockResolvedValueOnce({ data: { data: { id: 123 } } }).mockRejectedValueOnce(new Error('provider failure'));
  expect((await syncFlwSubscriptionPlans()).status).toBe(402);
  expect(deps.cancel).toHaveBeenCalledWith('payment-plans/123/cancel', { id: 123 }); expect(deps.update).not.toHaveBeenCalled();
});
it('handles database failure during plan synchronization', async () => {
  deps.plans.mockRejectedValue(new Error('db')); expect((await syncFlwSubscriptionPlans()).status).toBe(500);
});
