import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
vi.mock('@/utils/webpush',()=>({default:{}}));
vi.mock('@/cron/utils',()=>({enqueuePostTopic:vi.fn(async()=>{}),removeSubscriptionCronJob:vi.fn(async()=>{})}));
import db from '@/db';
import {getAccountBenefits,assertPostLength} from '@/services/v1/subscriptions/benefits';
import {createPostTip,createPost,createPostQuote,createPostReply} from '@/services/v1/posts';
import {cancelAppSubscription} from '@/services/v1/subscriptions';
import {PostCreateSchema} from '@/schema/post';
const prefix=`level-${randomUUID()}`,users=Array.from({length:5},(_,i)=>`${prefix}-${i}`),plans:string[]=[],posts:string[]=[];
let gift:string;
beforeAll(async()=>{
 for(let i=0;i<users.length;i++) await db.user.create({data:{id:users[i],username:users[i],name:users[i],email:`${users[i]}@test.invalid`,wallet:{create:{coins:10000}}}});
 for(let level=1;level<=3;level++) {
  const plan=await db.subscriptionPlan.create({data:{name:`${prefix}-${level}`,level,accountType:'PERSONAL',price:1,ngnPrice:100,discount:0}});plans.push(plan.id);
  await db.subscription.create({data:{userId:users[level],planId:plan.id,status:'ACTIVE',isPrimary:true,startDate:new Date(Date.now()-10000),endDate:new Date(Date.now()+86400000)}});
 }
 gift=(await db.tipPackage.create({data:{name:prefix,price:100}})).id;
});
afterAll(async()=>{
 await db.post.deleteMany({where:{id:{in:posts}}});
 await db.user.deleteMany({where:{id:{in:users}}});
 await db.subscriptionPlan.deleteMany({where:{id:{in:plans}}});
 await db.tipPackage.delete({where:{id:gift}});
});
it.each([0,1,2,3])('resolves level %i, applies recipient gift shares, and records policy metadata',async level=>{
 const policy=await getAccountBenefits(users[level]);expect(policy.level).toBe(level);
 const recipient=await db.user.findUniqueOrThrow({where:{id:users[level]}});
 const post=await db.post.create({data:{userId:recipient.id,content:'Benefits post',type:'CONTENT',kind:'ROOT'}});posts.push(post.id);
 const boost=await db.postBoost.findUniqueOrThrow({where:{postId:post.id}});
 expect(boost.target).toBe([150,300,450,600][level]);expect(boost.accountLevel).toBe(level);
 expect(boost.expiresAt.getTime()-boost.startsAt.getTime()).toBe(86400000);
 const actor=await db.user.findUniqueOrThrow({where:{id:users[4]}});
 for(const isPost of [true,false]) {
  const key=`${prefix}-${level}-${isPost}`;
  const args:any={senderId:actor.id,recipientId:recipient.id,postId:isPost?post.id:undefined,tipId:gift,idempotencyKey:key,device:{},meta:null};
  const result=await createPostTip(args,actor as any);expect(result.status).toBe(200);
  const expected=(isPost?[30,40,45,50]:[35,45,48,50])[level];
  expect((result.data as any).receivedCoins).toBe(expected);
  expect((await createPostTip(args,actor as any)).data).toEqual(result.data);
  const credit=await db.transaction.findFirstOrThrow({where:{userId:recipient.id,tipPackageId:gift,type:'CREDIT',postId:isPost?post.id:null}});
  expect(credit.metadata).toMatchObject({accountLevel:level,benefitsVersion:policy.version,recipientCoins:expected,platformFeeCoins:100-expected});
 }
});
it('returns level zero after expiry, pause or losing primary status',async()=>{
 const sub=await db.subscription.findFirstOrThrow({where:{userId:users[3]}});
 for(const change of [{endDate:new Date(0)},{status:'PAUSED' as const,endDate:new Date(Date.now()+86400000)},{status:'ACTIVE' as const,isPrimary:false}]) {
  await db.subscription.update({where:{id:sub.id},data:change});expect((await getAccountBenefits(users[3])).level).toBe(0);
 }
 await db.subscription.update({where:{id:sub.id},data:{status:'ACTIVE',isPrimary:true}});
});
it('rejects over-limit root posts, quotes and replies before writing',async()=>{
 const payload=PostCreateSchema.parse({isDraft:false,thread:[{type:'CONTENT',scope:'ANYONE',content:'👍🏽'.repeat(281),media:[]}]});
 expect((await createPost(payload,users[0],`${prefix}-oversize`)).status).toBe(400);
 expect((await createPostQuote(posts[0],users[0],payload)).status).toBe(400);
 const actor=await db.user.findUniqueOrThrow({where:{id:users[0]}});
 expect((await createPostReply(posts[0],payload,actor as any)).status).toBe(400);
 const subscriber=await getAccountBenefits(users[1]);expect(()=>assertPostLength(payload.thread,subscriber.maxPostCharacters)).not.toThrow();
});

it('keeps paid benefits through cancellation of renewal, then expires by date',async()=>{
 const sub=await db.subscription.findFirstOrThrow({where:{userId:users[1],isPrimary:true}});
 expect((await cancelAppSubscription({subId:sub.id,userId:users[1],status:'CANCELLED'})).status).toBe(200);
 expect((await getAccountBenefits(users[1])).level).toBe(1);
 expect((await db.subscription.findUniqueOrThrow({where:{id:sub.id}})).isRecurring).toBe(false);
 await db.subscription.update({where:{id:sub.id},data:{endDate:new Date(0)}});
 expect((await getAccountBenefits(users[1])).level).toBe(0);
});
