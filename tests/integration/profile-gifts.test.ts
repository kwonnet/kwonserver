import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@prisma/client';
vi.mock('@/utils/webpush',()=>({default:{}}));
import {createUserGift,getUserReceivedGifts} from '@/services/v1/users';
import {getNotificationStreamSnapshot} from '@/services/v1/notifications';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const sender='gift-test-sender',receiver='gift-test-receiver',gift='gift-test-package';let actor:any;
beforeAll(async()=>{
 for(const id of [sender,receiver]){const user=await db.user.create({data:{id,name:id,username:id,email:`${id}@example.test`,wallet:{create:{coins:id===sender?100:0,bonus:500}}}});if(id===sender)actor=user;}
 await db.tipPackage.create({data:{id:gift,name:'Rose',price:25,thumbnail:'/static/tips/velvet-bloom.webp'}});
});
afterAll(async()=>{await db.user.deleteMany({where:{id:{in:[sender,receiver]}}});await db.tipPackage.delete({where:{id:gift}});await db.$disconnect();});
const args={senderId:sender,recipientId:receiver,tipId:gift,device:{},meta:null,idempotencyKey:'profile-gift-once',isAnon:true,message:'Private gift note'}as any;
it('sends a profile gift exactly once under concurrent retries with a 50/50 coin split',async()=>{
 const results=await Promise.all(Array.from({length:8},()=>createUserGift(args,actor)));expect(results.every(r=>r.status===200)).toBe(true);
 expect((await db.wallet.findUniqueOrThrow({where:{userId:sender}})).coins.toNumber()).toBe(75);expect((await db.wallet.findUniqueOrThrow({where:{userId:receiver}})).coins.toNumber()).toBe(12.5);
 const txns=await db.transaction.findMany({where:{tipPackageId:gift}});expect(txns).toHaveLength(2);expect(txns.find(t=>t.type==='CREDIT')).toMatchObject({currency:'COINS',source:'COINS',status:'COMPLETED',senderId:null});
 expect(txns[0].metadata).toMatchObject({grossCoins:25,recipientCoins:12.5,platformFeeCoins:12.5});expect(await db.postTip.count({where:{recipientId:receiver,postId:null}})).toBe(1);
 const inbox=await db.notification.findMany({where:{recipientId:receiver}});expect(inbox).toHaveLength(1);expect(inbox[0]).toMatchObject({senderId:null,title:'Gift received',meta:{kind:'gift',isAnon:true}});expect(JSON.stringify(inbox)).not.toContain(sender);
 expect(await getNotificationStreamSnapshot(receiver)).toMatchObject({userId:receiver,totalUnseenCount:1,latestNotificationId:inbox[0].id});expect(await getNotificationStreamSnapshot(sender)).toMatchObject({totalUnseenCount:0});

});
it('blocks self-gifts, mismatched identities, locked recipients, and insufficient coins without spending bonus',async()=>{
 expect((await createUserGift({...args,recipientId:sender,idempotencyKey:'self-gift-key'},actor)).status).toBe(400);
 expect((await createUserGift({...args,senderId:receiver,idempotencyKey:'forged-gift-key'},actor)).status).toBe(400);
 await db.wallet.update({where:{userId:receiver},data:{isLocked:true}});expect((await createUserGift({...args,idempotencyKey:'locked-gift-key'},actor)).status).toBe(400);await db.wallet.update({where:{userId:receiver},data:{isLocked:false}});
 await db.wallet.update({where:{userId:sender},data:{coins:0}});expect((await createUserGift({...args,idempotencyKey:'unfunded-gift-key'},actor)).status).toBe(400);expect((await db.wallet.findUniqueOrThrow({where:{userId:sender}})).bonus.toNumber()).toBe(500);expect(await db.transaction.count({where:{tipPackageId:gift}})).toBe(2);
});
it('rolls back both wallets and ledger entries if saving the gift record fails',async()=>{
 await db.wallet.update({where:{userId:sender},data:{coins:100}});
 await db.$executeRawUnsafe(`CREATE FUNCTION gift_failure_probe() RETURNS trigger AS $$ BEGIN IF NEW."tipId"='${gift}' THEN RAISE EXCEPTION 'gift failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
 await db.$executeRawUnsafe('CREATE TRIGGER gift_failure_probe BEFORE INSERT ON "PostTip" FOR EACH ROW EXECUTE FUNCTION gift_failure_probe()');
 try{expect((await createUserGift({...args,idempotencyKey:'rollback-gift-key'},actor)).status).toBe(500);expect((await db.wallet.findUniqueOrThrow({where:{userId:sender}})).coins.toNumber()).toBe(100);expect((await db.wallet.findUniqueOrThrow({where:{userId:receiver}})).coins.toNumber()).toBe(12.5);expect(await db.transaction.count({where:{tipPackageId:gift}})).toBe(2);}finally{await db.$executeRawUnsafe('DROP TRIGGER gift_failure_probe ON "PostTip"');await db.$executeRawUnsafe('DROP FUNCTION gift_failure_probe()');}
});


it('lists received gifts with anonymous senders redacted and messages visible only to the recipient',async()=>{
 const owner=await getUserReceivedGifts(receiver,receiver,1,1);expect(owner.status).toBe(200);expect((owner.data as any).items[0]).toMatchObject({anonymous:true,sender:null,message:'Private gift note',thumbnail:'https://media.kwonnet.com/static/tips/velvet-bloom.webp'});
 const visitor=await getUserReceivedGifts(receiver,sender);expect(visitor.status).toBe(200);expect(JSON.stringify(visitor.data)).not.toContain('Private gift note');expect(JSON.stringify(visitor.data)).not.toContain(sender);
 await db.user.update({where:{id:receiver},data:{isPrivate:true}});
 try{expect((await getUserReceivedGifts(receiver,sender)).status).toBe(403);expect((await getUserReceivedGifts(receiver,receiver)).status).toBe(200);}finally{await db.user.update({where:{id:receiver},data:{isPrivate:false}});}
 await db.blockUser.create({data:{blockerId:receiver,blockedId:sender}});
 try{expect((await getUserReceivedGifts(receiver,sender)).status).toBe(403);}finally{await db.blockUser.deleteMany({where:{blockerId:receiver,blockedId:sender}});}
});
it('retains a named sender for non-anonymous gifts and paginates deterministically',async()=>{
 expect((await createUserGift({...args,isAnon:false,idempotencyKey:'named-profile-gift'},actor)).status).toBe(200);
 const inbox=await db.notification.findMany({where:{recipientId:receiver,senderId:sender}});expect(inbox).toHaveLength(1);expect(inbox[0].message).toContain(actor.name);
 const first=(await getUserReceivedGifts(receiver,receiver,1,1)).data as any,second=(await getUserReceivedGifts(receiver,receiver,2,1)).data as any;
 expect(first.hasMore).toBe(true);expect(second.hasMore).toBe(false);expect(first.items[0].sender).toMatchObject({id:sender});expect(first.items[0].id).not.toBe(second.items[0].id);
});
