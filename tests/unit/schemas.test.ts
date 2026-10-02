import { expect, it } from 'vitest';
import { SignInSchema, SignUpSchema } from '@/schema/auth';
import { paymentCurrencySchema, paymentGatewaySchema, paymentSourceSchema, paymentMethodSchema, externalPaymentCurrencySchema } from '@/schema/payment';
import { PostCreateSchema } from '@/schema/post';
import { TransferCoinsZodSchema, QueryParams, CreatePostViewSchema, purchaseCoinsZodSchema, purchasePremiumZodSchema } from '@/schema';
import { FollowUserSchema, UserLocationSchema } from '@/schema/user';
import { createGameSchema, createGameCategorySchema, createGameCategoryRoomSchema, userRankQuerySchema, rewardQuerySchema } from '@/schema/gameSchema';

it('normalizes usernames without changing password case or whitespace', () => {
  expect(SignInSchema.parse({ email: '  ADA  ', password: ' Password123 ' })).toEqual({ email: 'ada', password: ' Password123 ' });
});
it.each([7, 33])('rejects passwords of length %s', length => {
  for (const schema of [SignInSchema, SignUpSchema]) expect(schema.safeParse({ name: 'Ada', email: 'ada@example.test', password: 'x'.repeat(length) }).success).toBe(false);
});
it.each([8, 32])('accepts passwords of length %s', length => {
  expect(SignUpSchema.safeParse({ name: 'Ada', email: 'ada@example.test', password: 'x'.repeat(length) }).success).toBe(true);
});
it('requires valid signup email and supports an optional referral', () => {
  const valid = { name: 'Ada', email: 'ada@example.test', password: 'password123' };
  expect(SignUpSchema.safeParse({ ...valid, email: 'not-email' }).success).toBe(false);
  for (const refId of [undefined, null, 'ref']) expect(SignUpSchema.parse({ ...valid, refId }).refId).toBe(refId);
});
it.each(['TZX', 'USDT', 'USD', 'NGN', 'FIAT', 'COINS'])('accepts supported currency %s', value => expect(paymentCurrencySchema.parse(value)).toBe(value));
it.each(['TON', 'XTR', 'usd', 'INVALID'])('rejects unsupported ledger currency %s', value => expect(paymentCurrencySchema.safeParse(value).success).toBe(false));
it.each(['WALLET', 'FLUTTERWAVE', 'PAYSTACK', 'CRYPTO', 'VIRTUAL'])('accepts gateway %s', value => expect(paymentGatewaySchema.parse(value)).toBe(value));
it.each(['COINS', 'BONUS', 'COINS_BONUS', 'CREDIT', 'FIAT', 'CRYPTO', 'VIRTUAL'])('accepts source %s', value => expect(paymentSourceSchema.parse(value)).toBe(value));
it('requires a complete supported payment method', () => {
  expect(paymentMethodSchema.safeParse({ currency: 'USD', gateway: 'FLUTTERWAVE' }).success).toBe(false);
  expect(paymentMethodSchema.safeParse({ currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT' }).success).toBe(true);
});
it.each(['TON', ' ton ', 'XTR', 'xtr'])('rejects retired external currency %s', value => expect(externalPaymentCurrencySchema.safeParse(value).success).toBe(false));
it.each(['USD', 'EUR', 'NGN'])('supports provider fiat currency %s', value => expect(externalPaymentCurrencySchema.safeParse(value).success).toBe(true));
it.each([0, -1, 99, NaN])('rejects transfer amount %s', amount => {
  expect(TransferCoinsZodSchema.safeParse({ senderId: 'u', recipientId: 'v', amount }).success).toBe(false);
});
it('accepts the minimum transfer and trims IDs', () => {
  expect(TransferCoinsZodSchema.parse({ senderId: ' u ', recipientId: ' v ', amount: 100 })).toEqual({ senderId: 'u', recipientId: 'v', amount: 100 });
});
it('applies pagination and view duration defaults and parses numeric strings', () => {
  expect(QueryParams.parse({})).toMatchObject({ page: 1, limit: 21, hidden: false, country: null });
  expect(QueryParams.parse({ page: '2', limit: '10' })).toMatchObject({ page: 2, limit: 10 });
  expect(QueryParams.safeParse({ page: 'bad' }).success).toBe(false);
  expect(CreatePostViewSchema.parse({ id: 'p', timestamp: '2026-10-01' }).duration).toBe(5);
});
it('rejects retired providers in nested purchase metadata', () => {
  expect(purchaseCoinsZodSchema.safeParse({ packageId: 'p', currency: 'USD', meta: { amount: 10, currency: 'USD', gateway: 'STARS', source: 'FIAT' } }).success).toBe(false);
  expect(purchasePremiumZodSchema.safeParse({ planId: 'p', planName: 'Pro', amount: 5, planType: 'MONTHLY',
    isRecurring: false, currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT' }).success).toBe(true);
});
const quizPost = (overrides = {}) => ({ isDraft: false, thread: [{ type: 'QUIZ', scope: 'ANYONE', content: 'Question', media: [], tags: ['NEWS'],
  quiz: { scope: 'NONE', isPaid: true, rewardAmount: 500, maxWinners: 1, duration: { days: 1, hours: 0, minutes: 0 },
    options: [{ id: 'a', text: 'A', isCorrect: true }], ...overrides } }] });
it('accepts funded quizzes and normalizes tags', () => {
  const parsed = PostCreateSchema.parse(quizPost()); expect(parsed.thread[0].tags).toEqual(['news']);
  expect(parsed.thread[0].mentions).toEqual([]);
});
it.each([{ rewardAmount: 499 }, { maxWinners: 0 }, { options: [{ id: 'a', text: 'A', isCorrect: false }] }])('rejects invalid quiz constraints %j', overrides => {
  expect(PostCreateSchema.safeParse(quizPost(overrides)).success).toBe(false);
});
it('allows free quizzes without a funded prize', () => {
  expect(PostCreateSchema.safeParse(quizPost({ isPaid: false, rewardAmount: 0, maxWinners: 0 })).success).toBe(true);
});
it('rejects unknown follow actions and nonnumeric coordinates', () => {
  expect(FollowUserSchema.safeParse({ senderId: 'u', recipientId: 'v', action: 'HACK' }).success).toBe(false);
  expect(UserLocationSchema.safeParse({ latitude: '6', longitude: 3 }).success).toBe(false);
  expect(UserLocationSchema.parse({ latitude: 6, longitude: 3 })).toEqual({ latitude: 6, longitude: 3 });
});
it.each([createGameSchema, createGameCategorySchema, createGameCategoryRoomSchema])('validates game creation fields', schema => {
  const body = { userId: 'user', gameId: 'game', catId: 'cat', name: 'Game', description: 'Description' };
  expect(schema.safeParse(body).success).toBe(true);
  expect(schema.safeParse({ ...body, name: 'ab' }).success).toBe(false);
});
it('validates ranking options and parses reward query numbers', () => {
  expect(userRankQuerySchema.safeParse({ userId: 'user', rankType: 'year', mode: 'single' }).success).toBe(false);
  expect(userRankQuerySchema.safeParse({ userId: 'user', rankType: 'week', mode: 'multi' }).success).toBe(true);
  expect(rewardQuerySchema.parse({ userId: 'user', page: '2', limit: '10', year: '2026' })).toMatchObject({ page: 2, limit: 10, year: 2026 });
  expect(() => rewardQuerySchema.parse({ userId: 'user', page: 'bad', limit: '10' })).toThrow('Invalid page format');
});
