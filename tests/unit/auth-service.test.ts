import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { user, resetMocks } from './fixtures';
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn(), create: vi.fn() },
  country: { findFirst: vi.fn() }, referral: { findFirst: vi.fn(), create: vi.fn() },
  wallet: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, transaction: { create: vi.fn() }, $transaction: vi.fn() }));
const passwords = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }));
vi.mock('@/db', () => ({ default: db }));
vi.mock('bcrypt', () => ({ default: passwords }));
vi.mock('@/utils', () => ({ getRandomNumber: () => 12 }));
vi.mock('@/utils/helpers', () => ({ AppError: class extends Error {} }));
import { createUser, loginUser, handleReferral } from '@/services/v1/auth';

beforeEach(() => {
  resetMocks(db); resetMocks(passwords);
  passwords.hash.mockResolvedValue('salted-hash');
  passwords.compare.mockResolvedValue(true);
  db.$transaction.mockImplementation((work: any) => typeof work === "function" ? work(db) : Promise.all(work));
  db.wallet.update.mockResolvedValue({id: "wallet"});
  db.wallet.findUniqueOrThrow.mockResolvedValue({id:"wallet"});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());
const credentials = { email: 'ada@example.test', password: 'password123' };

describe('login', () => {
  it.each([null, user({ password: null }), user({ password: '' })])('rejects missing credentials without password comparison', async row => {
    db.user.findFirst.mockResolvedValue(row);
    expect((await loginUser(credentials)).status).toBe(401);
    expect(passwords.compare).not.toHaveBeenCalled();
  });
  it('rejects a wrong password without returning account data', async () => {
    db.user.findFirst.mockResolvedValue(user()); passwords.compare.mockResolvedValue(false);
    expect(await loginUser(credentials)).toEqual({ status: 401, data: 'Wrong auth credentials provided' });
  });
  it.each(['BANNED', 'SUSPENDED'])('rejects %s accounts', async status => {
    db.user.findFirst.mockResolvedValue(user({ status }));
    expect((await loginUser(credentials)).status).toBe(401);
  });
  it.each(['ACTIVE', 'PRIVATE'])('accepts %s accounts and omits the password', async status => {
    db.user.findFirst.mockResolvedValue(user({ status }));
    const result = await loginUser(credentials);
    expect(result).toMatchObject({ status: 200, data: { id: 'user-1', email: credentials.email } });
    expect(result.data).not.toHaveProperty('password');
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [
      { email: { equals: credentials.email, mode: 'insensitive' } },
      { username: { equals: credentials.email, mode: 'insensitive' } },
    ] } }));
  });
  it('returns a generic error on database failure', async () => {
    db.user.findFirst.mockRejectedValue(new Error('database secret'));
    expect(await loginUser(credentials)).toEqual({ status: 500, data: 'Error occurred, please try again' });
  });
});

describe('registration', () => {
  it('does not hash or insert duplicate emails', async () => {
    db.user.findFirst.mockResolvedValue(user());
    expect((await createUser({ ...credentials, name: 'Ada' })).status).toBe(422);
    expect(passwords.hash).not.toHaveBeenCalled(); expect(db.user.create).not.toHaveBeenCalled();
  });
  it('hashes the password and initializes the wallet and location', async () => {
    db.user.findFirst.mockResolvedValue(null); db.user.create.mockResolvedValue(user());
    const result = await createUser({ ...credentials, name: 'Ada' });
    expect(result.status).toBe(200);
    expect(passwords.hash).toHaveBeenCalledWith(credentials.password, 10);
    expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      username: 'ada', password: 'salted-hash', wallet: { create: { bonus: 12 } },
      location: { create: { latitude: 0, longitude: 0, meta: undefined } },
    }) }));
    expect(result.data).not.toHaveProperty('password');
  });
  it('disambiguates a taken username and connects the resolved country', async () => {
    db.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(user());
    db.country.findFirst.mockResolvedValue({ id: 'NG' }); db.user.create.mockResolvedValue(user());
    await createUser({ ...credentials, name: 'Ada' }, { country: 'NG', latitude: 6, longitude: 3 } as any);
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({ username: expect.stringMatching(/^ada.{5}$/),
      country: { connect: { id: 'NG' } }, location: { create: { latitude: 6, longitude: 3 } } });
  });
  it('does not create a user when hashing fails', async () => {
    db.user.findFirst.mockResolvedValue(null); passwords.hash.mockRejectedValue(new Error('hash failure'));
    expect((await createUser({ ...credentials, name: 'Ada' })).status).toBe(500);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe('referral rewards', () => {
  const args = { referrerId: 'ref', refereeId: 'new-user' };
  it.each([[{}, user(), 'User is already referred'], [null, null, 'Referrer not found']])(
    'does not reward ineligible referrals', async (existing, referrer, message) => {
      db.referral.findFirst.mockResolvedValue(existing); db.user.findFirst.mockResolvedValue(referrer);
      expect(await handleReferral(args)).toBe(message);
      expect(db.wallet.update).not.toHaveBeenCalled(); expect(db.referral.create).not.toHaveBeenCalled();
    });
  it.each(['BANNED', 'SUSPENDED'])('does not reward a %s referrer', async status => {
    db.user.findFirst.mockResolvedValue(user({ status }));
    await handleReferral(args); expect(db.wallet.update).not.toHaveBeenCalled();
  });
  it('rewards an established account transactionally', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    db.user.findFirst.mockResolvedValue(user({ _count: { likedPosts: 0, posts: 0 } }));
    db.referral.create.mockResolvedValue({ id: 'referral' });
    expect(await handleReferral(args)).toEqual({ id: 'referral' });
    expect(db.referral.create).toHaveBeenCalledWith({ data: { referrerId: 'user-1', refereeId: 'new-user', amount: 12, isRewarded: true } });
    expect(db.wallet.update).toHaveBeenCalledWith({ where: { userId: 'user-1' }, data: { bonus: { increment: 12 } } });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('defers rewards for a new account without qualifying activity', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    db.user.findFirst.mockResolvedValue(user({ createdAt: new Date(), _count: { likedPosts: 0, posts: 0 } }));
    await handleReferral(args);
    expect(db.wallet.update).not.toHaveBeenCalled();
    expect(db.referral.create).toHaveBeenCalledWith({ data: { referrerId: 'user-1', refereeId: 'new-user', amount: 12 } });
  });
  it('handles transaction errors without exposing details', async () => {
    db.$transaction.mockRejectedValue(new Error('private db detail'));
    expect(await handleReferral(args)).toBe('Sorry an error ocurred, try again');
  });
  it.each([[10 * 86400000 - 1, 0, false], [10 * 86400000, 0, true], [0, 5, true]])(
    'referral age %s and activity %s yields reward=%s', async (age, activity, rewarded) => {
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
      db.user.findFirst.mockResolvedValue(user({ createdAt: new Date(Date.now() - Number(age)), _count: { likedPosts: activity, posts: 0 } }));
      await handleReferral(args);
      expect(db.wallet.update.mock.calls.length).toBe(rewarded ? 1 : 0);
    });
});
