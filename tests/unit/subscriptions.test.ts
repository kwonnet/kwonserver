import { setupWalletTransaction } from './wallet-fixture';
import { markVerifiedPayment } from '@/services/walletLedger/verifiedPayment';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn(), update: vi.fn() },
  subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() }, wallet: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  subscription: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  transaction: { findFirst: vi.fn(), create: vi.fn() }, $transaction: vi.fn() }));
const jobs = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), from: vi.fn(), to: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('@/services/v1/games', () => ({ syncUserRedisWalletToPrisma: jobs.from }));
vi.mock('@/services/helper', () => ({ syncPrismaUserWalletToRedis: jobs.to }));
vi.mock('@/cron/utils', () => ({ addSubscriptionCronJob: jobs.add, removeSubscriptionCronJob: jobs.remove }));
import * as s from '@/services/v1/subscriptions';
const plan = { id: 'pro', name: 'Pro', price: 5, ngnPrice: 5000, discount: 0, tier: [{ id: 'gold', name: 'Gold' }] };
const user = { id: 'u', userType: 'PERSONAL', accountVerified: false };
const wallet = { id: 'w', credit: 100, isLocked: false };
const item: any = { idempotencyKey: 'purchase-test-1', planId: 'pro', amount: 5, currency: 'TZX', planType: 'MONTHLY', isRecurring: true,
  gateway: 'WALLET', source: 'CREDIT', planName: 'Pro', meta: { tierId: 'gold', txnRef: 'external' } };
const existing = (overrides = {}): any => ({ id: 'sub', userId: 'u', planId: 'pro', billingCycle: 'MONTHLY', isRecurring: true,
  startDate: new Date('2026-09-01'), endDate: new Date('2026-10-01'), status: 'ACTIVE', isPrimary: true, meta: { tierId: 'gold' },
  metadata: [{ previous: true }], user, plan, transactions: [{ amount: 5, currency: 'TZX', metadata: {} }], ...overrides });
beforeEach(() => {
  resetMocks(db); resetMocks(jobs); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  db.user.findFirst.mockResolvedValue(user); db.subscriptionPlan.findUnique.mockResolvedValue(plan); db.wallet.findFirst.mockResolvedValue(wallet);
  db.subscription.findFirst.mockResolvedValue(null); db.subscription.findUnique.mockResolvedValue(existing());
  db.subscription.create.mockImplementation(async ({ data }) => ({ id: 'sub', ...data }));
  db.subscription.update.mockImplementation(async ({ data }) => ({ ...existing(), ...data }));
  db.wallet.update.mockResolvedValue(wallet);
  db.$transaction.mockImplementation((work: any) => typeof work === 'function' ? work(db) : Promise.all(work));
  setupWalletTransaction(db);
  db.wallet.findUniqueOrThrow.mockImplementation((arg) => db.wallet.findFirst(arg));
  db.subscription.findUniqueOrThrow.mockImplementation((arg) => db.subscription.findUnique(arg));
  jobs.add.mockResolvedValue(undefined); jobs.remove.mockResolvedValue(undefined);
  jobs.from.mockResolvedValue({ isError: false });
});
afterEach(() => vi.useRealTimers());
it.each([{ plans: [], status: 404 }, { plans: [plan], status: 200 }])('lists subscription plans with features', async ({ plans, status }) => {
  db.subscriptionPlan.findMany.mockResolvedValue(plans); expect((await s.getPlans()).status).toBe(status);
  expect(db.subscriptionPlan.findMany).toHaveBeenCalledWith({ include: { features: true } });
});
it('handles a catalog error', async () => { db.subscriptionPlan.findMany.mockRejectedValue(new Error('db')); expect((await s.getPlans()).status).toBe(500); });
const buy = [
  { name: 'wallet', run: (arg = item) => s.purchaseAppSubscriptionWithWallet(arg, 'u') },
  { name: 'external', run: (arg = item) => s.purchaseAppSubscription(markVerifiedPayment({...arg, currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT', meta:{...arg.meta,userId:'u'}}, 'provider-123'), 'u') },
];
it.each(buy)('$name requires a user and a plan', async ({ run }) => {
  db.user.findFirst.mockResolvedValueOnce(null); expect((await run()).status).toBe(400);
  db.subscriptionPlan.findUnique.mockResolvedValue(null); expect((await run()).status).toBe(400); expect(db.$transaction).not.toHaveBeenCalled();
});
it.each([{ value: { ...wallet, isLocked: true } }, { value: { ...wallet, credit: 4.99 } }])('rejects missing, locked or underfunded wallets', async ({ value }) => {
  db.wallet.findFirst.mockResolvedValue(value); expect((await s.purchaseAppSubscriptionWithWallet(item, 'u')).status).toBe(400); expect(db.wallet.update).not.toHaveBeenCalled();
});
for (const purchase of buy) {
  it.each(['MONTHLY', 'YEARLY'])(`${purchase.name} creates a %s subscription and its ledger record`, async cycle => {
    expect((await purchase.run({ ...item, planType: cycle })).status).toBe(200);
    expect(db.subscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u', planId: 'pro', billingCycle: cycle,
      isPrimary: true, status: 'ACTIVE', meta: expect.objectContaining({ tierId: 'gold' }), endDate: new Date(cycle === 'MONTHLY' ? '2026-11-01T12:00:00Z' : '2027-10-01T12:00:00Z') }) });
    expect(db.subscription.updateMany.mock.calls).toEqual([
      [{ where: { userId: 'u', status: 'ACTIVE' }, data: { status: 'PAUSED' } }], [{ where: { userId: 'u' }, data: { isPrimary: false } }],
    ]);
    expect(db.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: purchase.name === 'wallet' && cycle === 'YEARLY' ? 60 : 5, subscriptionId: 'sub', userId: 'u', type: 'DEBIT', status: 'COMPLETED' }) });
    if (purchase.name === 'wallet') { expect(jobs.add).toHaveBeenCalledWith('sub'); expect(jobs.to).toHaveBeenCalledWith('u', wallet); }
    else { expect(jobs.remove).toHaveBeenCalledWith({ userId: 'u', subId: 'sub' }); expect(db.wallet.update).not.toHaveBeenCalled(); }
  });
  it.each(['MONTHLY', 'YEARLY'])(`${purchase.name} archives prior metadata when reactivating a %s subscription`, async cycle => {
    db.subscription.findFirst.mockResolvedValue(existing()); await purchase.run({ ...item, planType: cycle, isRecurring: false });
    expect(db.subscription.create).not.toHaveBeenCalled();
    expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub' }, data: expect.objectContaining({ isRecurring: false,
      metadata: [{ previous: true }, expect.objectContaining({ id: 'sub', planId: 'pro', status: 'ACTIVE' })] }) });
    expect(jobs.remove).toHaveBeenCalledWith({ userId: 'u', subId: 'sub' }); expect(jobs.add).not.toHaveBeenCalled();
  });
  it.each([['GOVERNMENT', 'grey'], ['BUSINESS', 'gold'], ['PERSONAL', 'blue']])(`${purchase.name} sets %s account badge to %s`, async (userType, color) => {
    db.user.findFirst.mockResolvedValue({ ...user, userType }); await purchase.run();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { meta: { status: 'ACTIVE', type: 'PRO', color } } });
  });
  it(`${purchase.name} does not schedule jobs after a failed transaction`, async () => {
    db.$transaction.mockRejectedValue(new Error('db')); expect((await purchase.run()).status).toBe(500);
    expect(jobs.add).not.toHaveBeenCalled(); expect(jobs.remove).not.toHaveBeenCalled(); expect(jobs.to).not.toHaveBeenCalled();
  });
}
it('rejects unsupported external payment methods before querying the database', async () => {
  expect((await s.purchaseAppSubscription({ ...item, currency: 'TON' }, 'u')).status).toBe(400); expect(db.user.findFirst).not.toHaveBeenCalled();
});
it.each([{ sub: null }, { sub: existing({ transactions: [] }) }])('requires a subscription and previous payment before renewal', async ({ sub }) => {
  db.subscription.findUnique.mockResolvedValue(sub); expect((await s.renewAppSubscriptionWithWallet('sub')).status).toBe(404);
  expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([{ value: null, status: 404 }, { value: { ...wallet, credit: 4.99 }, status: 400 }])('checks renewal wallet availability and balance', async ({ value, status }) => {
  db.wallet.findFirst.mockResolvedValue(value); expect((await s.renewAppSubscriptionWithWallet('sub')).status).toBe(status); expect(db.$transaction).not.toHaveBeenCalled();
});
it.each(['MONTHLY', 'YEARLY'])('renews %s using the last settled amount and archives the previous period', async cycle => {
  db.subscription.findUnique.mockResolvedValue(existing({ billingCycle: cycle }));
  expect(await s.renewAppSubscriptionWithWallet('sub')).toMatchObject({ status: 200, isError: false });
  expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'u' }, data: { isLocked: true, credit: { decrement: 5 } } });
  expect(db.wallet.update).toHaveBeenLastCalledWith({ where: { userId: 'u' }, data: { isLocked: false } });
  expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub' }, data: expect.objectContaining({ billingCycle: cycle, isPrimary: true,
    endDate: new Date(cycle === 'MONTHLY' ? '2026-11-01T12:00:00Z' : '2027-10-01T12:00:00Z') }) });
  expect(db.transaction.create.mock.calls[0][0].data.description).toContain('Pro ~ Gold'); expect(jobs.to).toHaveBeenCalledWith('u', wallet);
});
it('uses the plan name when a renewal has no matching tier', async () => {
  db.subscription.findUnique.mockResolvedValue(existing({ meta: null })); await s.renewAppSubscriptionWithWallet('sub');
  expect(db.transaction.create.mock.calls[0][0].data.description).toContain('MONTHLY Pro subscription');
});
it('handles renewal transaction failure without publishing a cached balance', async () => {
  db.$transaction.mockRejectedValue(new Error('db')); expect((await s.renewAppSubscriptionWithWallet('sub')).isError).toBe(true); expect(jobs.to).not.toHaveBeenCalled();
});
it.each([{ sub: null }, { sub: existing({ user: null }) }])('requires an existing subscription owner for cancellation', async ({ sub }) => {
  db.subscription.findFirst.mockResolvedValue(sub); expect((await s.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED' as any })).status).toBe(404);
  expect(db.$transaction).not.toHaveBeenCalled();
});
it.each([['GOVERNMENT', true, 'grey'], ['BUSINESS', true, 'gold'], ['PERSONAL', true, 'blue'], ['BUSINESS', false, 'blue']] as const)('cancels %s verified=%s while retaining its legacy badge', async (userType, accountVerified, color) => {
  db.subscription.findFirst.mockResolvedValue(existing({ user: { ...user, userType, accountVerified } }));
  expect((await s.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED' as any })).status).toBe(200);
  expect(db.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub', userId: 'u' }, data: { status: 'CANCELLED', isRecurring: false } });
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { meta: { color, status: accountVerified ? 'ACTIVE' : 'INACTIVE', type: 'LEGACY' } } });
  expect(jobs.remove).toHaveBeenCalledWith({ userId: 'u', subId: 'sub' });
});
it('does not remove jobs when cancellation fails', async () => {
  db.subscription.findFirst.mockResolvedValue(existing()); db.$transaction.mockRejectedValue(new Error('db'));
  expect((await s.cancelAppSubscription({ subId: 'sub', status: 'CANCELLED' as any })).status).toBe(500); expect(jobs.remove).not.toHaveBeenCalled();
});
it('restricts user-requested cancellation to that user before making changes', async () => {
  db.subscription.findFirst.mockResolvedValue(null);
  expect((await s.cancelAppSubscription({ subId: 'someone-elses-sub', status: 'CANCELLED' as any, userId: 'u' })).status).toBe(404);
  expect(db.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'someone-elses-sub', userId: 'u' } }));
  expect(db.$transaction).not.toHaveBeenCalled(); expect(jobs.remove).not.toHaveBeenCalled();
});

it('uses catalog pricing instead of the client subscription amount', async () => {
 await s.purchaseAppSubscriptionWithWallet({...item,amount:0.01},'u');
 expect(db.transaction.create).toHaveBeenCalledWith({data:expect.objectContaining({amount:5})});
});
it('rejects unverified external subscription JSON', async () => {
 expect((await s.purchaseAppSubscription({...item,currency:'USD'},'u')).status).toBe(400);
 expect(db.subscription.create).not.toHaveBeenCalled();
});
it.each([{endDate:new Date('2030-01-01')},{isRecurring:false},{status:'PAUSED'},{isPrimary:false}])('does not renew an ineligible subscription %j',async override=>{
 db.subscription.findUnique.mockResolvedValue(existing(override));await s.renewAppSubscriptionWithWallet('sub');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('does not report committed payment as failed when scheduling is unavailable', async()=>{
 jobs.add.mockRejectedValue(new Error('redis down'));expect((await s.purchaseAppSubscriptionWithWallet(item,'u')).status).toBe(200);
});

it('rejects wallet subscriptions in external currencies',async()=>{
 expect((await s.purchaseAppSubscriptionWithWallet({...item,currency:'USD'},'u')).status).toBe(400);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('allows catalog plans without a tier',async()=>{
 db.subscriptionPlan.findUnique.mockResolvedValue({...plan,tier:[]});
 expect((await s.purchaseAppSubscriptionWithWallet({...item,meta:undefined},'u')).status).toBe(200);
 expect(db.transaction.create).toHaveBeenCalledWith({data:expect.objectContaining({amount:5})});
});
it.each([{isLocked:true},{credit:0}])('rechecks the renewal wallet inside the transaction %j',async override=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({...wallet,...override});
 expect((await s.renewAppSubscriptionWithWallet('sub')).isError).toBe(true);expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([{isRecurring:false},{isPrimary:false},{status:'CANCELLED'},{endDate:new Date('2026-11-01')}])('rejects a concurrent subscription change before renewal %j',async override=>{
 db.subscription.findUniqueOrThrow.mockResolvedValue(existing(override));
 expect((await s.renewAppSubscriptionWithWallet('sub')).isError).toBe(true);expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each([['GOVERNMENT','grey'],['BUSINESS','gold']])('retains %s badge on renewal',async(userType,color)=>{
 db.subscription.findUnique.mockResolvedValue(existing({user:{...user,userType}}));
 expect((await s.renewAppSubscriptionWithWallet('sub')).status).toBe(200);
 expect(db.user.update).toHaveBeenCalledWith({where:{id:'u'},data:{meta:{status:'ACTIVE',type:'PRO',color}}});
});
it('reuses a historical external subscription payment without charging again',async()=>{
 db.transaction.findFirst.mockResolvedValue({subscriptionId:'sub'});
 expect((await buy[1].run()).status).toBe(200);expect(db.transaction.create).not.toHaveBeenCalled();expect(db.subscription.create).not.toHaveBeenCalled();
});
it.each([null,'missing'])('rejects an external payment already assigned to an unavailable purchase %s',async subscriptionId=>{
 db.transaction.findFirst.mockResolvedValue({subscriptionId});db.subscription.findUnique.mockResolvedValue(null);
 expect((await buy[1].run()).status).toBe(400);expect(db.transaction.create).not.toHaveBeenCalled();
});
it.each(['wallet','external','cancel'])('does not turn committed %s operations into failures when job cleanup fails',async kind=>{
 jobs.remove.mockRejectedValue(new Error('queue unavailable'));db.subscription.findFirst.mockResolvedValue(existing());
 const result=kind==='cancel'?await s.cancelAppSubscription({subId:'sub',status:'CANCELLED' as any}):await buy[kind==='wallet'?0:1].run({...item,isRecurring:false});
 expect(result.status).toBe(200);
});
