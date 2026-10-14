import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@prisma/client';
vi.mock('@/utils/webpush',()=>({default:{}}));
import {createUserGift} from '@/services/v1/users';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const sender='gift-test-sender',receiver='gift-test-receiver',gift='gift-test-package';let actor:any;
beforeAll(async()=>{
 for(const id of [sender,receiver]){const user=await db.user.create({data:{id,name:id,username:id,email:`${id}@example.test`,wallet:{create:{coins:id===sender?100:0,bonus:500}}}});if(id===sender)actor=user;}
 await db.tipPackage.create({data:{id:gift,name:'Rose',price:25,thumbnail:'/static/tips/velvet-bloom.webp'}});
});
afterAll(async()=>{await db.user.deleteMany({where:{id:{in:[sender,receiver]}}});await db.tipPackage.delete({where:{id:gift}});await db.$disconnect();});
const args={senderId:sender,recipientId:receiver,tipId:gift,device:{},meta:null,idempotencyKey:'profile-gift-once',isAnon:true}as any;
it('sends a profile gift exactly once under concurrent retries with a 50/50 coin split',async()=>{
 const results=await Promise.all(Array.from({length:8},()=>createUserGift(args,actor)));expect(results.every(r=>r.status===200)).toBe(true);
 expect((await db.wallet.findUniqueOrThrow({where:{userId:sender}})).coins.toNumber()).toBe(75);expect((await db.wallet.findUniqueOrThrow({where:{userId:receiver}})).coins.toNumber()).toBe(12.5);
 const txns=await db.transaction.findMany({where:{tipPackageId:gift}});expect(txns).toHaveLength(2);expect(txns.find(t=>t.type==='CREDIT')).toMatchObject({currency:'COINS',source:'COINS',status:'COMPLETED',senderId:null});
 expect(txns[0].metadata).toMatchObject({grossCoins:25,recipientCoins:12.5,platformFeeCoins:12.5});expect(await db.postTip.count({where:{recipientId:receiver,postId:null}})).toBe(1);
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
