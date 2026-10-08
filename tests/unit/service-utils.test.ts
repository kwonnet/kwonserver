import {Prisma} from '@prisma/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { post, user } from './fixtures';
const find = vi.hoisted(() => vi.fn());
vi.mock('@/db', () => ({ default: { user: { findFirst: find } } }));
vi.mock('@/utils/helpers', () => ({ AppError: class extends Error {
  constructor(message: string, public statusCode: number) { super(message); }
} }));
import * as u from '@/services/v1/utils';
beforeEach(() => { find.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

it.each([['BANNED', 'banned permanently'], ['SUSPENDED', 'temporarily suspended'], ['PRIVATE', 'private'],
  ['DEACTIVATED', 'deactivated'], ['ACTIVE', '']])('formats %s account status', (status, text) => {
  expect(u.getUserStatusMessage(user({ status }))).toContain(text);
});
it('includes latest moderation reason, and support guidance when no reason exists', () => {
  expect(u.getUserStatusMessage(user({ status: 'BANNED', metadata: [{ reason: 'old' }, { reason: 'spam' }] }), true)).toContain('for spam');
  expect(u.getUserStatusMessage(user({ status: 'SUSPENDED' }), true)).toContain('contact support');
});
it('builds a safe public user without credentials or email by default', () => {
  const result = u.composeAuthUser(user({ subscriptions: [{ id: 'sub' }], accountVerifiedAt: new Date() }));
  expect(result).not.toHaveProperty('email'); expect(result).not.toHaveProperty('password');
  expect(result.meta).toMatchObject({ isPro: true, isLegacy: true, isActive: true, isPrivate: false });
  expect(u.composeAuthUser(user({ status: 'PRIVATE' }), true)).toMatchObject({ email: 'ada@example.test', meta: { isPrivate: true } });
});
it('composes follower counts and relationship states', () => {
  expect(u.composeUserConnection(user({ followerCount: 5, isFollowingUser: true }))).toMatchObject({
    conn: { followerCount: 5, followingCount: 0, mutualCount: 0, isFollowingUser: true }, mutualFollowers: [],
  });
  expect(u.composePostAuthor(user({ followers: [{ status: 'ACCEPTED' }], following: [] }))).toMatchObject({
    conn: { isFollowedByUser: true, isFollowingUser: false, followedStatus: 'ACCEPTED' },
  });
});
it.each([null, undefined, false, 0, 'value'])('preserves scalar %s during BigInt serialization', value => {
  expect(u.serializeBigInts(value)).toBe(value);
});
it('serializes BigInts recursively without mutating the source', () => {
  const date = new Date(); const source = { n: 4n, nested: [{ n: 3n, date }] };
  expect(u.serializeBigInts(source)).toEqual({ n: 4, nested: [{ n: 3, date }] });
  expect(source.n).toBe(4n);
});
it.each([[-1, true], [0, true], [1, false]])('expiry offset %s is expired=%s', (offset, expired) => {
  expect(u.checkExpiryTime(new Date(Date.now() + Number(offset)))).toBe(expired);
});
it.each(['poll', 'quiz'])('checks %s expiry, voting and region eligibility recursively', kind => {
  const check = kind === 'poll' ? u.checkPollPermissions : u.checkQuizPermissions;
  const field = kind === 'poll' ? 'voters' : 'participants';
  const child = post({ type: kind.toUpperCase(), [kind]: { scope: 'COUNTRY', countries: [{ countryId: 'NG' }],
    continents: [], expireAt: new Date(Date.now() - 1), options: [{ [field]: [{ createdAt: new Date() }] }] } });
  const result: any = check(post({ parent: child, replies: [child], thread: [child] }), user());
  for (const entry of [result.parent, result.replies[0], result.thread[0]]) {
    expect(entry[kind]).toMatchObject({ hasVoted: true, isExpired: true, canVote: true });
  }
  expect((check(child, user({ country: null })) as any)[kind].canVote).toBe(false);
  expect(child[kind]).not.toHaveProperty('canVote');
});
it.each(['poll', 'quiz'])('allows unrestricted %s and matching continent', kind => {
  const check = kind === 'poll' ? u.checkPollPermissions : u.checkQuizPermissions;
  for (const scope of ['NONE', 'CONTINENT']) {
    const result: any = check(post({ type: kind.toUpperCase(), [kind]: { scope, countries: [],
      continents: [{ continentId: 'AF' }], expireAt: new Date(Date.now() + 1000), options: [] } }), user());
    expect(result[kind]).toMatchObject({ hasVoted: false, isExpired: false, canVote: true });
  }
});
it('uses the latest multi-vote timestamp for the ten-second window', () => {
  const make = (age: number) => post({ type: 'POLL', poll: { scope: 'NONE', isMultiVote: true,
    expireAt: new Date(Date.now() + 60000), options: [{ voters: [
      { createdAt: new Date(Date.now() - 60000) }, { createdAt: new Date(Date.now() - age) },
    ] }] } });
  expect(u.checkPollPermissions(make(10000)).poll?.hasVoted).toBe(false);
  expect(u.checkPollPermissions(make(10001)).poll?.hasVoted).toBe(true);
});
it.each([
  ['ANYONE', {}, {}, true], ['VERIFIED', {}, { meta: { isPro: true } }, true],
  ['VERIFIED', {}, {}, false], ['FOLLOWED', { author: { conn: { isFollowingUser: true } } }, {}, true],
  ['MENTIONS', { mentions: [{ id: 'user-1' }] }, {}, true], ['MENTIONS', {}, {}, false],
  ['COUNTRY', { replyCountries: [{ countryId: 'NG' }] }, {}, true], ['COUNTRY', {}, {}, false],
  ['CONTINENT', { replyContinents: [{ continentId: 'AF' }] }, {}, true], ['CONTINENT', {}, {}, false],
])('reply permissions for %s', (scope, overrides, viewer, allowed) => {
  expect(u.checkReplyPermissions(post({ scope, ...overrides }), user(viewer)).actions.canReply).toBe(allowed);
});
it('allows the author but respects blocking even for otherwise allowed replies', () => {
  expect(u.checkReplyPermissions(post({ userId: 'user-1', scope: 'MENTIONS' }), user()).actions).toMatchObject({ canReply: true, canHideReply: true });
  for (const flag of ['hasBlockedByRootUser', 'isRootBlockedByUser', 'hasBlockedUser', 'isBlockedByUser']) {
    expect(u.checkReplyPermissions(post({ actions: { [flag]: true } }), user()).actions.canReply).toBe(false);
  }
});
it('inherits root scope and moderation owner and handles nested replies', () => {
  const child = post({ root: { userId: 'user-1', scope: 'VERIFIED' } });
  const result = u.checkReplyPermissions(post({ parent: child, replies: [child], thread: [child] }), user());
  for (const entry of [result.parent, result.replies[0], result.thread[0]]) {
    expect(entry).toMatchObject({ scope: 'VERIFIED', actions: { canReply: false, canHideReply: true } });
  }
});
it('hydrates post actions and nested authors without exposing credentials', () => {
  const child = { ...post(), user: user() };
  const result = u.transformPost({ ...child, likes: [{}], bookmarks: [{}], pins: [{}], highlights: [{}],
    reposts: [{}], parent: child, parentChain: [child], thread: [child], replies: [child], _count: { replies: 2 } }, user());
  expect(result.actions).toMatchObject({ hasLiked: true, hasSaved: true, hasReposted: true, hasPinned: true, hasHighlighted: true });
  expect(result.totalHiddenReplies).toBe(2);
  for (const item of [result, result.parent, result.replies[0], result.thread[0]]) expect(item?.author).not.toHaveProperty('password');
});
it('flattens tag/mention join rows and their nested posts', () => {
  const tagged = { user: { id: 'u', _count: { followers: 2, following: 3 } } };
  const leaf = { id: 'p', tagUsers: [tagged], mentions: [tagged] };
  const result = u.transformPrismaTagMentions({ ...leaf, parent: leaf, parentChain: [leaf], replies: [leaf], thread: [leaf] });
  expect(result.tagUsers[0]).toMatchObject({ id: 'u', followerCount: 2, followingCount: 3 });
  expect(result.parent.mentions[0].id).toBe('u');
});
it('defaults absent tag relations and preserves repost state for post hydration', () => {
  expect(u.transformPrismaTagMentions({ id: 'p', reposts: [{ id: 'r' }] })).toEqual({
    id: 'p', tagUsers: [], mentions: [], reposts: [{ id: 'r' }],
  });
});
it('returns 404 for a missing auth user and throws for missing public user', async () => {
  find.mockResolvedValue(null); expect((await u.getAuthUser('u')).status).toBe(404);
  await expect(u.getPublicUser('u')).rejects.toMatchObject({ statusCode: 404 });
});
it.each(['BANNED', 'SUSPENDED'])('rejects %s unless explicitly including all statuses', async status => {
  find.mockResolvedValue(user({ status }));
  expect((await u.getAuthUser('u')).status).toBe(401);
  expect((await u.getAuthUser('u', { includeAny: true, includeEmail: true })).status).toBe(200);
});
it('returns safe public data and handles database errors', async () => {
  find.mockResolvedValue(user()); expect(await u.getPublicUser('u')).not.toHaveProperty('email');
  find.mockRejectedValue(new Error('db failure'));
  expect((await u.getAuthUser('u')).status).toBe(500); await expect(u.getPublicUser('u')).rejects.toThrow('db failure');
});
it.each([['3h', 3], ['6h', 6], ['12h', 12], ['24h', 24], ['1d', 24], ['3d', 72], ['7d', 168], ['14d', 336], ['21d', 504]])(
  'analytics range %s covers %s hours', (range, hours) => {
    expect(u.getAnalyticsDuration(range).getTime()).toBe(Date.now() - Number(hours) * 3600000);
  });
it.each([['30d', 1], ['1M', 1], ['3M', 3], ['6M', 6], ['9M', 9], ['12M', 12], ['1y', 12], ['2y', 24]])('analytics calendar range %s', (range, months) => {
  const expected = new Date(); expected.setMonth(expected.getMonth() - Number(months));
  expect(u.getAnalyticsDuration(range)).toEqual(expected);
});
it('unknown analytics duration uses now', () => expect(u.getAnalyticsDuration()).toEqual(new Date()));
it.each([[10, 0, '+100%'], [0, 0, '0%'], [15, 10, '+50.0%'], [5, 10, '-50.0%'], [10, 10, '+0.0%']])(
  'percentage change %s versus %s', (now, before, output) => expect(u.analyticsPercentageChange(Number(now), Number(before))).toBe(output));

it('serializes nested Decimal amounts as the existing numeric API shape',()=>{
 expect(u.serializeBigInts({wallet:{coins:new Prisma.Decimal('0.30')},ledger:[{amount:new Prisma.Decimal('13.64')}]}))
 .toEqual({wallet:{coins:0.3},ledger:[{amount:13.64}]});
});
