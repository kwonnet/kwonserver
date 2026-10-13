import {PrismaPg} from '@prisma/adapter-pg';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})})};});
const provider=vi.hoisted(()=>({verify:vi.fn(),create:vi.fn(),read:vi.fn(),result:vi.fn()}));
vi.mock('@/services/v1/wallets/refund-provider',async importOriginal=>{
 const actual=await importOriginal<any>();
 return {...actual,getRefundProvider:(gateway:string)=>({...actual.getRefundProvider(gateway),verifyPayment:provider.verify,createRefund:provider.create,readRefund:provider.read,refundResult:provider.result})};
});
import db from '@/db';
import {requestPurchaseRefund,processPurchaseRefund,getRefundQuote} from '@/services/v1/wallets/refunds';
const buyer='refund-fixture-buyer';let id:string;
beforeAll(async()=>{
 vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');provider.result.mockReturnValue({id:'provider-refund',status:'PROCESSING'});
 provider.create.mockImplementation(async(_row,save)=>{await save('provider-refund');return {refund_id:'provider-refund'};});
 await db.user.create({data:{id:buyer,name:'Refund Buyer',username:buyer,email:'refund-buyer@example.test',wallet:{create:{coins:50,bonus:10}}}});
 const pkg=await db.coinPackage.create({data:{name:'Refund fixture',amount:30,price:5,bonus:12}});
 const common={userId:buyer,txnRef:'refund-fixture-ref',exTxnRef:'chk_refund',category:'COIN_PURCHASE' as const,gateway:'BACHS' as const,status:'COMPLETED' as const,coinPackageId:pkg.id,metadata:{providerId:'pay_refund',coins:30,bonus:12}};
 await db.transaction.create({data:{...common,type:'DEBIT',currency:'USD',source:'FIAT',amount:5,description:'Verified payment'}});
 id=(await db.transaction.create({data:{...common,type:'CREDIT',currency:'COINS',source:'COINS_BONUS',amount:42,description:'Coins credited'}})).id;
});
afterAll(async()=>{await db.purchaseRefund.deleteMany({where:{userId:buyer}});await db.transaction.deleteMany({where:{userId:buyer}});await db.wallet.deleteMany({where:{userId:buyer}});await db.user.delete({where:{id:buyer}});await db.coinPackage.deleteMany({where:{name:'Refund fixture'}});await db.$disconnect();});
it('concurrent requests reserve one deduction and submit one provider refund',async()=>{
 expect(await getRefundQuote(id,buyer)).toMatchObject({coinsDebit:31.2,bonusDebit:10,bonusFee:.6});
 await Promise.all(Array.from({length:8},()=>requestPurchaseRefund(id,buyer,{coinsDebit:31.2,bonusDebit:10})));
 const wallet=await db.wallet.findUniqueOrThrow({where:{userId:buyer}});expect(wallet.coins.toString()).toBe('18.8');expect(wallet.bonus.toString()).toBe('0');expect(await db.purchaseRefund.count({where:{transactionId:id}})).toBe(1);expect(provider.create).toHaveBeenCalledTimes(1);expect((await db.purchaseRefund.findUniqueOrThrow({where:{transactionId:id}})).providerRefundId).toBe('provider-refund');
});
it('confirmed failure restores once even when confirmations race',async()=>{
 const refund=await db.purchaseRefund.findUniqueOrThrow({where:{transactionId:id}});provider.result.mockReturnValue({id:'provider-refund',status:'FAILED'});
 await Promise.all(Array.from({length:8},()=>processPurchaseRefund(refund.id,buyer)));
 const wallet=await db.wallet.findUniqueOrThrow({where:{userId:buyer}});expect(wallet.coins.toString()).toBe('50');expect(wallet.bonus.toString()).toBe('10');expect(await db.transaction.count({where:{userId:buyer,category:'COIN_REFUND',type:'CREDIT'}})).toBe(1);
});
it('persists the confirmed crypto destination for later processing',async()=>{
 provider.verify.mockResolvedValue({isCrypto:true,paymentMethod:'CRYPTO'});provider.result.mockReturnValue({id:'provider-crypto-refund',status:'PROCESSING'});
 const common={description:'Crypto refund fixture purchase',userId:buyer,txnRef:'crypto-refund-fixture-ref',exTxnRef:'chk_crypto_refund',category:'COIN_PURCHASE' as const,gateway:'BACHS' as const,status:'COMPLETED' as const,metadata:{providerId:'pay_crypto_refund',coins:1,bonus:0}};
 await db.transaction.create({data:{...common,type:'DEBIT',currency:'USD',source:'FIAT',amount:1}});
 const purchase=await db.transaction.create({data:{...common,type:'CREDIT',currency:'COINS',source:'COINS',amount:1}});
 const address='0x'+'a'.repeat(40);
 await requestPurchaseRefund(purchase.id,buyer,{coinsDebit:1,bonusDebit:0,refundAddress:address,confirmCryptoNetwork:true});
 expect((await db.purchaseRefund.findUniqueOrThrow({where:{transactionId:purchase.id}})).refundAddress).toBe(address);
});
