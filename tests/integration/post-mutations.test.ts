import {moneyJson} from '@/services/walletLedger';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('@/utils/webpush', () => ({ default: {} }));
import prisma from '@/db';
import { updatePostReactions, updatePostBookmarks, deletePost, restorePost, createPostTip } from '@/services/v1/posts';
let author: any;
let reader: any;
beforeAll(async () => {
  author = await prisma.user.create({ data: { id: 'post-author', name: 'Author', username: 'post_author', email: 'post_author@test.invalid' } });
  reader = await prisma.user.create({ data: { id: 'post-reader', name: 'Reader', username: 'post_reader', email: 'post_reader@test.invalid' } });
  await prisma.post.create({ data: { id: 'integration-post', userId: author.id, content: 'Hello', type: 'CONTENT', kind: 'ROOT' } });
});
afterAll(async () => prisma.$disconnect());
it('toggles likes and bookmarks with persisted counters and deduplicated notifications', async () => {
  for (const run of [() => updatePostReactions('integration-post', reader), () => updatePostBookmarks('integration-post', reader.id)]) {
    expect((await run()).status).toBe(200); expect((await run()).status).toBe(200);
  }
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ totalLikes: 0n, totalBookmarks: 0n });
  expect(await prisma.likedPost.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect(await prisma.bookmark.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect(await prisma.notification.count({ where: { postId: 'integration-post', action: 'LIKE' } })).toBe(1);
});
it('denies another user deletion, then persists owner deletion/restoration with audit history', async () => {
  expect((await deletePost('integration-post', reader)).status).toBe(500);
  expect(await prisma.postHistory.count({ where: { postId: 'integration-post' } })).toBe(0);
  expect((await deletePost('integration-post', author)).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ status: 'DELETED', deletedAt: expect.any(Date) });
  expect((await restorePost('integration-post', author)).status).toBe(200);
  expect(await prisma.post.findUnique({ where: { id: 'integration-post' } })).toMatchObject({ status: 'PUBLISHED', deletedAt: null });
  expect(await prisma.postHistory.count({ where: { postId: 'integration-post' } })).toBe(2);
});
it('rolls back a new like if its counter update fails', async () => {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_post_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test post failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_post_update BEFORE UPDATE ON "Post" FOR EACH ROW EXECUTE FUNCTION test_reject_post_update()`);
  try {
    expect((await updatePostReactions('integration-post', reader)).status).toBe(500);
    expect(await prisma.likedPost.count({ where: { postId: 'integration-post' } })).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER test_reject_post_update ON "Post"');
    await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_post_update()');
  }
});

it('charges concurrent tip retries once and creates linked pending credit without immediately paying it',async()=>{
 await prisma.wallet.create({data:{userId:reader.id,coins:60,credit:20}});
 await prisma.wallet.create({data:{userId:author.id,coins:0,credit:0}});
 const pack=await prisma.tipPackage.create({data:{name:'Integrity tip',price:30}});
 const args={senderId:reader.id,recipientId:author.id,postId:'integration-post',tipId:pack.id,device:{},meta:null,idempotencyKey:'post-tip-retry'} as any;
 const results=await Promise.all(Array.from({length:5},()=>createPostTip(args,reader)));
 expect(results.map(r=>r.status)).toEqual([200,200,200,200,200]);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:reader.id}})).coins)).toBe(30);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:author.id}})).credit)).toBe(0);
 const entries=await prisma.transaction.findMany({where:{postId:'integration-post',category:'POST_TIP'}});
 expect(moneyJson(entries)).toHaveLength(2);expect(moneyJson(entries[0].txnRef)).toBe(entries[1].txnRef);
 expect(moneyJson(entries.find(e=>e.type==='DEBIT'))).toMatchObject({userId:reader.id,amount:30,status:'COMPLETED'});
 expect(moneyJson(entries.find(e=>e.type==='CREDIT'))).toMatchObject({userId:author.id,amount:5.5,status:'PENDING'});
 expect(await prisma.rewardTip.count({where:{userId:author.id,status:'PENDING'}})).toBe(1);
 expect((await prisma.postTip.findFirstOrThrow({where:{postId:'integration-post'}})).coinsAmount?.toString()).toBe('30');
 expect((await createPostTip({...args,senderId:author.id},reader)).status).toBe(400);
 expect((await createPostTip({...args,senderId:author.id,recipientId:reader.id,idempotencyKey:'wrong-post-owner'},author)).status).toBe(400);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:reader.id}})).coins)).toBe(30);
});
it('rounds a credit-funded tip debit upward and keeps the remaining balance nonnegative',async()=>{
 await prisma.wallet.update({where:{userId:reader.id},data:{coins:0,credit:13.64}});
 const pack=await prisma.tipPackage.findFirstOrThrow({where:{name:'Integrity tip'}});
 expect((await createPostTip({senderId:reader.id,recipientId:author.id,postId:'integration-post',tipId:pack.id,device:{},meta:null,idempotencyKey:'credit-funded-tip'} as any,reader)).status).toBe(200);
 expect(moneyJson((await prisma.wallet.findUniqueOrThrow({where:{userId:reader.id}})).credit)).toBeCloseTo(0);
 expect(moneyJson(await prisma.transaction.findFirst({where:{userId:reader.id,category:'POST_TIP',currency:'TZX',type:'DEBIT'}}))).toMatchObject({amount:13.64});
 expect((await prisma.postTip.findMany({where:{postId:'integration-post'}})).every(tip=>tip.coinsAmount?.toString()==='30')).toBe(true);
});
