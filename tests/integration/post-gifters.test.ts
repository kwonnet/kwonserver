import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {getPostGifters} from '@/services/v1/posts';
vi.mock('@/utils/webpush', () => ({default: {}}));
const db = new PrismaClient();
const prefix = 'gifters-fixture-';
const owner = prefix + 'owner', sender = prefix + 'sender', post = prefix + 'post', gift = prefix + 'gift';
beforeAll(async () => {
  await db.user.createMany({data: [owner, sender].map(id => ({id, name: id, username: id, email: id + '@example.invalid'}))});
  await db.post.create({data: {id: post, userId: owner, type: 'CONTENT', kind: 'ROOT', content: 'Gifted post'}});
  await db.tipPackage.create({data: {id: gift, name: 'Flower', price: '5.00'}});
  const createdAt = new Date('2026-01-01T00:00:00Z');
  await db.postTip.createMany({data: Array.from({length: 24}, (_, index) => ({
    id: prefix + String(index).padStart(2, '0'), postId: post, senderId: sender, recipientId: owner, tipId: gift,
    createdAt, coinsAmount: index === 0 ? null : '2.50', isAnon: index === 23,
  }))});
  const wallet = await db.wallet.create({data: {userId: owner}});
  const txn = await db.transaction.create({data: {userId: owner, walletId: wallet.id, amount: 1, currency: 'TZX', source: 'CREDIT', gateway: 'WALLET', type: 'CREDIT', status: 'COMPLETED', category: 'POST_TIP', description: 'Refunded gift fixture', txnRef: prefix + 'refunded'}});
  await db.postTip.create({data: {id: prefix + 'refunded', postId: post, senderId: sender, recipientId: owner, tipId: gift, coinsAmount: '100',
    rewardTip: {create: {userId: owner, walletId: wallet.id, txnId: txn.id, amount: 1, source: 'POST', status: 'REFUNDED', availableAt: new Date()}}}});
});
afterAll(async () => {
  await db.post.deleteMany({where: {id: post}});
  await db.user.deleteMany({where: {id: {in: [owner, sender]}}});
  await db.tipPackage.deleteMany({where: {id: gift}});
  await db.$disconnect();
});
it('rejects visitors even when they know the post ID', async () => {
  expect(await getPostGifters(post, sender)).toEqual({status: 403, data: 'Only the post owner can view gifters'});
});
it('paginates with stable ordering, exact totals, preserved anonymity, and legacy estimates', async () => {
  const one = await getPostGifters(post, owner, 1, 21);
  const two = await getPostGifters(post, owner, 2, 21);
  const three = await getPostGifters(post, owner, 3, 21);
  expect(one.status).toBe(200);
  const first = one.data as any, second = two.data as any, last = three.data as any;
  expect(first).toMatchObject({totalGifts: 24, totalCoins: '62.50', hasEstimatedAmounts: true, hasMore: true});
  expect(first.gifters).toHaveLength(21); expect(second.gifters).toHaveLength(3); expect(second.hasMore).toBe(false);
  expect(last.gifters).toEqual([]); expect(last.totalCoins).toBe('62.50');
  expect(new Set([...first.gifters, ...second.gifters].map(item => item.id)).size).toBe(24);
  expect(first.gifters[0]).toMatchObject({id: prefix + '23', sender: null, anonymous: true, coins: '2.5'});
  expect(JSON.stringify(first.gifters[0])).not.toContain(sender);
  expect(second.gifters[2]).toMatchObject({id: prefix + '00', coins: '5', estimated: true});
  await db.tipPackage.update({where: {id: gift}, data: {price: '10'}});
  const after = (await getPostGifters(post, owner)).data as any;
  expect(after.totalCoins).toBe('67.50'); // Only the explicitly estimated legacy row changes.
  expect(after.gifters[0].coins).toBe('2.5');
});
