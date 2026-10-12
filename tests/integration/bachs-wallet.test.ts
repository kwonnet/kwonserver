import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient,Prisma} from '@prisma/client';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})})};});
import db from '@/db';
import {purchaseCoinsWithBachs} from '@/services/v1/coins';
import {markVerifiedPayment} from '@/services/walletLedger/verifiedPayment';
const buyer='bachs-fixture-buyer',orderId='b'.repeat(64);let packageId:string;
beforeAll(async()=>{
 await db.user.create({data:{id:buyer,name:'Buyer',username:buyer,email:'bachs-buyer@example.test',wallet:{create:{coins:0,bonus:0}}}});
 packageId=(await db.coinPackage.create({data:{name:'Bachs fixture',amount:1000,price:10,bonus:20,ngnPrice:15000,ngnBonus:30}})).id;
 await db.bachsCheckout.create({data:{id:orderId,userId:buyer,packageId,currency:'USD',environment:'https://sandbox-api.bachs.io',amount:10,coins:1000,bonus:20,request:{},checkoutId:'chk_fixture'}});
});
afterAll(async()=>{await db.walletOperation.deleteMany({where:{scope:'bachs'}});await db.transaction.deleteMany({where:{userId:buyer}});await db.bachsCheckout.deleteMany({where:{userId:buyer}});await db.wallet.deleteMany({where:{userId:buyer}});await db.user.delete({where:{id:buyer}});await db.coinPackage.delete({where:{id:packageId}});await db.$disconnect();});
it('concurrent webhook and return-page settlement credit once from the checkout snapshot',async()=>{
 await db.coinPackage.update({where:{id:packageId},data:{amount:9999,bonus:9999}});
 const payload=()=>markVerifiedPayment({orderId,userId:buyer,checkoutId:'chk_fixture',paymentId:'pay_fixture'},'pay_fixture');
 await expect(purchaseCoinsWithBachs({orderId,userId:buyer,checkoutId:'chk_fixture',paymentId:'pay_fixture'})).rejects.toThrow('not been verified');
 await Promise.all(Array.from({length:8},()=>purchaseCoinsWithBachs(payload())));
 const wallet=await db.wallet.findUniqueOrThrow({where:{userId:buyer}});expect(wallet.coins.toString()).toBe('1000');expect(wallet.bonus.toString()).toBe('20');
 expect(await db.transaction.count({where:{userId:buyer,gateway:'BACHS'}})).toBe(2);expect((await db.bachsCheckout.findUniqueOrThrow({where:{id:orderId}})).status).toBe('PAID');
});
