import { beforeEach, expect, it, vi } from 'vitest';
import { response, resetMocks } from './fixtures';
const services = vi.hoisted(() => ({ wallet: vi.fn(), transfer: vi.fn(), fund: vi.fn(), history: vi.fn(), bonus: vi.fn(), task: vi.fn(),
  coins: vi.fn(), walletCoins: vi.fn(), tokenCoins: vi.fn(), plans: vi.fn(), walletSub: vi.fn(), externalSub: vi.fn(), cancel: vi.fn() }));
vi.mock('@/services/v1/wallets', () => ({ getUserCoinsWallet: services.wallet, transferCoins: services.transfer, fundCoins: services.fund,
  getTxnHistory: services.history, updateWalletBonus: services.bonus, rewardDailyTask: services.task }));
vi.mock('@/services/v1/coins', () => ({ getCoinPackages: services.coins, purchaseCoinsWithWallet: services.walletCoins, purchaseCoinsWithToken: services.tokenCoins }));
vi.mock('@/services/v1/subscriptions', () => ({ getPlans: services.plans, purchaseAppSubscriptionWithWallet: services.walletSub,
  purchaseAppSubscription: services.externalSub, cancelAppSubscription: services.cancel }));
import * as w from '@/controllers/v1/wallets';
import * as c from '@/controllers/v1/coins';
import * as s from '@/controllers/v1/subscriptions';
const req = (body: any = {}, query: any = {}): any => ({ body, query, user: { id: 'owner', name: 'Ada' } });
beforeEach(() => { resetMocks(services); Object.values(services).forEach(fn => fn.mockResolvedValue({ status: 200, data: 'ok' })); vi.spyOn(console, 'log').mockImplementation(() => {}); });
it('scopes wallet lookup to the authenticated user', async () => {
  const res = response(); await w.getUserCoinsWalletController(req({ userId: 'other' }), res);
  expect(services.wallet).toHaveBeenCalledWith('owner'); expect(res.body).toBe('ok');
});
it('ignores forged transfer sender IDs', async () => {
  const res = response(); await w.transferCoinsController(req({ senderId: 'victim', recipientId: 'recipient', amount: 100 }), res);
  expect(services.transfer).toHaveBeenCalledWith({ senderId: 'owner', recipientId: 'recipient', amount: 100 });
});
it('rejects invalid transfers before calling the service', async () => {
  const res = response(); await w.transferCoinsController(req({ senderId: 'owner', recipientId: 'r', amount: 99 }), res);
  expect(res.statusCode).toBe(400); expect(services.transfer).not.toHaveBeenCalled();
});
it('keeps failed service messages in the transfer response', async () => {
  services.transfer.mockResolvedValue({ status: 400, message: 'Insufficient balance' }); const res = response();
  await w.transferCoinsController(req({ recipientId: 'r', senderId: 'owner', amount: 100 }), res);
  expect(res.statusCode).toBe(400); expect(res.body).toBe('Insufficient balance');
});
it.each([{ amount: 0, bonus: 0 }, { amount: -1, bonus: -1 }, {}])('rejects invalid funding %j', async body => {
  const res = response(); await w.fundCoinsController(req({ userId: 'recipient', ...body }), res); expect(res.statusCode).toBe(400); expect(services.fund).not.toHaveBeenCalled();
});
it('passes validated funding and the authenticated actor', async () => {
  const request = req({ userId: 'recipient', amount: 1, bonus: 0 }); await w.fundCoinsController(request, response());
  expect(services.fund).toHaveBeenCalledWith(request.body, request.user);
});
it.each([{ query: {}, page: 1, limit: 10 }, { query: { page: '2', limit: '20', userId: 'victim' }, page: 2, limit: 20 }])('scopes transaction history and pagination', async ({ query, page, limit }) => {
  await w.getTxnHistoryController(req({}, query), response()); expect(services.history).toHaveBeenCalledWith({ userId: 'owner', page, limit });
});
it('rejects invalid history pagination', async () => {
  const res = response(); await w.getTxnHistoryController(req({}, { page: 'bad' }), res); expect(res.statusCode).toBe(400); expect(services.history).not.toHaveBeenCalled();
});
it('ignores forged reward recipient IDs', async () => {
  await w.claimDailyBonusController(req({ userId: 'victim', amount: 5, type: 'BONUS', date: '2026-10-02' }), response());
  expect(services.bonus).toHaveBeenCalledWith({ userId: 'owner', amount: 5, type: 'BONUS', date: '2026-10-02', isTask: false });
});
it.each([11, 100])('rejects oversized bonus %s', async amount => {
  const res = response(); await w.claimDailyBonusController(req({ amount, type: 'BONUS', date: '2026-10-02' }), res);
  expect(res.statusCode).toBe(400); expect(services.bonus).not.toHaveBeenCalled();
});
it('claims tasks for the authenticated user', async () => {
  await w.claimDailyTaskController(req({ id: 'task', code: 'code', userId: 'victim' }), response());
  expect(services.task).toHaveBeenCalledWith({ id: 'task', code: 'code', userId: 'owner' });
});
it('rejects invalid task claims', async () => {
  const res = response(); await w.claimDailyTaskController(req(), res); expect(res.statusCode).toBe(400); expect(services.task).not.toHaveBeenCalled();
});
it.each([{ controller: c.getCoinsController, fn: 'coins' }, { controller: s.getSubscriptionPlansController, fn: 'plans' }])('returns catalog results', async ({ controller, fn }) => {
  services[fn as keyof typeof services].mockResolvedValue({ status: 404, data: 'Not found' }); const res = response();
  await controller(req(), res); expect(res.statusCode).toBe(404); expect(res.body).toBe('Not found');
});
it.each(['TZX', 'USD'])('routes %s coin purchases to the correct service', async currency => {
  const request = req({ packageId: 'pack', currency, meta: { amount: 5, currency, gateway: 'FLUTTERWAVE', source: 'FIAT' } });
  await c.purchaseCoinsController(request, response());
  const service = currency === 'TZX' ? services.walletCoins : services.tokenCoins;
  expect(service).toHaveBeenCalledWith(expect.objectContaining({ id: 'pack', currency }), request.user);
  expect(currency === 'TZX' ? services.tokenCoins : services.walletCoins).not.toHaveBeenCalled();
});
it('rejects invalid coin purchase payloads', async () => {
  const res = response(); await c.purchaseCoinsController(req(), res); expect(res.statusCode).toBe(400); expect(services.tokenCoins).not.toHaveBeenCalled();
});
const sub = { planId: 'pro', planName: 'Pro', amount: 5, currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT', planType: 'MONTHLY', isRecurring: false };
it.each(['TZX', 'USD'])('routes %s subscriptions for the authenticated owner', async currency => {
  await s.subscriptionPremiumController(req({ ...sub, currency }), response());
  expect(currency === 'TZX' ? services.walletSub : services.externalSub).toHaveBeenCalledWith({ ...sub, currency }, 'owner');
});
it('rejects invalid subscription payloads', async () => {
  const res = response(); await s.subscriptionPremiumController(req(), res); expect(res.statusCode).toBe(400); expect(services.externalSub).not.toHaveBeenCalled();
});
it('passes ownership to subscription cancellation', async () => {
  await s.cancelSubscriptionController(req({ id: 'sub' }), response());
  expect(services.cancel).toHaveBeenCalledWith({ subId: 'sub', status: 'CANCELLED', userId: 'owner' });
});
it('rejects invalid cancellation payloads', async () => {
  const res = response(); await s.cancelSubscriptionController(req(), res); expect(res.statusCode).toBe(400); expect(services.cancel).not.toHaveBeenCalled();
});
it.each([
  { controller: w.getUserCoinsWalletController, fn: 'wallet', body: {} },
  { controller: w.transferCoinsController, fn: 'transfer', body: { senderId: 'owner', recipientId: 'r', amount: 100 } },
  { controller: w.fundCoinsController, fn: 'fund', body: { userId: 'r', amount: 1, bonus: 0 } },
  { controller: w.getTxnHistoryController, fn: 'history', body: {} },
  { controller: w.claimDailyBonusController, fn: 'bonus', body: { amount: 5, type: 'BONUS', date: '2026-10-02' } },
  { controller: w.claimDailyTaskController, fn: 'task', body: { id: 't' } },
  { controller: c.purchaseCoinsController, fn: 'walletCoins', body: { packageId: 'p', currency: 'TZX' } },
  { controller: s.getSubscriptionPlansController, fn: 'plans', body: {} },
  { controller: s.subscriptionPremiumController, fn: 'externalSub', body: sub },
  { controller: s.cancelSubscriptionController, fn: 'cancel', body: { id: 'sub' } },
])('$fn controller masks unexpected service failures', async ({ controller, fn, body }) => {
  services[fn as keyof typeof services].mockRejectedValue(new Error('private db error')); const res = response();
  await controller(req(body), res); expect(res.statusCode).toBe(500); expect(res.body).not.toContain('private db error');
});
