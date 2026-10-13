import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import logger from '@/logger';
const db=vi.hoisted(()=>({transaction:{findFirst:vi.fn(),findMany:vi.fn(),create:vi.fn(),update:vi.fn()},wallet:{findUniqueOrThrow:vi.fn(),update:vi.fn()},chargeRate:{findUnique:vi.fn()},purchaseRefund:{findUnique:vi.fn(),findUniqueOrThrow:vi.fn(),findMany:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn()},$transaction:vi.fn(),$queryRaw:vi.fn()}));
const provider=vi.hoisted(()=>({verify:vi.fn(),create:vi.fn(),read:vi.fn(),result:vi.fn()}));
vi.mock('@/db',()=>({default:db}));
vi.mock('@/services/v1/wallets/refund-provider',async importOriginal=>{
 const actual=await importOriginal<any>();
 return {...actual,getRefundProvider:(gateway:string)=>({...actual.getRefundProvider(gateway),verifyPayment:provider.verify,createRefund:provider.create,readRefund:provider.read,refundResult:provider.result})};
});
import {refundDeduction,getRefundQuote,requestPurchaseRefund,listPurchases,processPurchaseRefund,REFUND_WINDOW_MS} from '@/services/v1/wallets/refunds';
import {RefundProviderError} from '@/services/v1/wallets/refund-provider';
const D=(n:number)=>new Prisma.Decimal(n);
const row=()=>({id:'purchase',userId:'buyer',txnRef:'txn',exTxnRef:'chk',gateway:'BACHS',amount:D(42),status:'COMPLETED',createdAt:new Date(),metadata:{coins:30,bonus:12,providerId:'pay_test'},purchaseRefund:null,package:{name:'Pack'}});
const refund=()=>({id:'refund',userId:'buyer',transactionId:'purchase',gateway:'BACHS',environment:'https://sandbox-api.bachs.io',paymentId:'pay_test',amount:D(5),currency:'USD',coinsDebit:D(31.2),bonusDebit:D(10),status:'PROCESSING'});
beforeEach(()=>{
 Object.values(db).forEach(model=>{if(typeof model==='function')model.mockReset();else Object.values(model).forEach(fn=>fn.mockReset());});Object.values(provider).forEach(fn=>fn.mockReset());
 vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');db.transaction.findFirst.mockImplementation(async args=>args.where.type==='CREDIT'?row():{amount:D(5),currency:'USD'});
 db.wallet.findUniqueOrThrow.mockResolvedValue({id:'wallet',coins:D(50),bonus:D(10)});db.wallet.update.mockResolvedValue({id:'wallet'});db.chargeRate.findUnique.mockResolvedValue({price:D(.015),ngnPrice:D(18),bonusFee:D(.6)});
 db.purchaseRefund.findUnique.mockImplementation(async args=>args.where.id?refund():null);db.purchaseRefund.findUniqueOrThrow.mockResolvedValue(refund());db.purchaseRefund.updateMany.mockResolvedValue({count:0});db.purchaseRefund.update.mockImplementation(async({data})=>({...refund(),...data}));
 db.$queryRaw.mockResolvedValue([{id:'wallet'}]);db.$transaction.mockImplementation(async work=>await work(db));provider.result.mockReturnValue({id:'provider-refund',status:'PROCESSING'});
});
it.each([.015,18])('calculates 60 percent bonus cover using base price %s and rounds coins up to two places',price=>{
 const value=refundDeduction(D(30),D(12),D(10),D(price),D(.6));expect(value.coinsDebit.toString()).toBe('31.2');expect(value.bonusDebit.toString()).toBe('10');expect(value.shortfallValue.toNumber()).toBeCloseTo(price*.6*2);
});
it('returns all bonus when available without an extra coin charge',()=>{expect(refundDeduction(D(30),D(12),D(20),D(.015),D(.6)).coinsDebit.toString()).toBe('30');});
it.each([0,-1])('rejects invalid base price %s',price=>{expect(()=>refundDeduction(D(30),D(12),D(10),D(price),D(.6))).toThrow();});
it('quotes the original payment and original coin quantities, not current package pricing',async()=>{expect(await getRefundQuote('purchase','buyer')).toMatchObject({amount:5,currency:'USD',coinsDebit:31.2,bonusDebit:10,bonusFee:.6,baseRate:.015});});
it('requires crypto address and network confirmation before reserving wallet balances',async()=>{
 provider.verify.mockResolvedValue({isCrypto:true,paymentMethod:'CRYPTO',cryptoNetwork:'Ethereum',cryptoCurrency:'ETH'});
 await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10})).rejects.toThrow('wallet address');
 await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10,refundAddress:'0x'+'a'.repeat(40)})).rejects.toThrow('original payment network');
 expect(db.wallet.update).not.toHaveBeenCalled();expect(provider.create).not.toHaveBeenCalled();
});
it('persists the confirmed crypto refund address for background retries',async()=>{
 provider.verify.mockResolvedValue({isCrypto:true,paymentMethod:'CRYPTO'});
 await requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10,refundAddress:'0x'+'a'.repeat(40),confirmCryptoNetwork:true});
 expect(db.purchaseRefund.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({refundAddress:'0x'+'a'.repeat(40)})}));
});
it('allows a zero bonus deduction when coins cover the full bonus shortfall',async()=>{
 db.wallet.findUniqueOrThrow.mockResolvedValue({id:'wallet',coins:D(50),bonus:D(0)});
 await requestPurchaseRefund('purchase','buyer',{coinsDebit:37.2,bonusDebit:0});
 expect(db.wallet.update).toHaveBeenCalledWith({where:{id:'wallet'},data:{coins:{decrement:D(37.2)},bonus:{decrement:D(0)}}});
});
it('rejects refund addresses for fiat purchases before deduction',async()=>{
 provider.verify.mockResolvedValue({isCrypto:false,paymentMethod:'CARD'});
 await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10,refundAddress:'0x'+'a'.repeat(40),confirmCryptoNetwork:true})).rejects.toThrow('only allowed for crypto');
 expect(db.wallet.update).not.toHaveBeenCalled();
});
it('quotes crypto metadata recorded with the original purchase',async()=>{
 db.transaction.findFirst.mockImplementation(async args=>args.where.type==='CREDIT'?{...row(),metadata:{...row().metadata,isCrypto:true,paymentMethod:'CRYPTO',cryptoNetwork:'Solana',cryptoCurrency:'USDC'}}:{amount:D(5),currency:'USD'});
 expect(await getRefundQuote('purchase','buyer')).toMatchObject({requiresRefundAddress:true,cryptoNetwork:'Solana',cryptoCurrency:'USDC'});
});
it.each([{status:'REFUNDED'},{createdAt:new Date(Date.now()-REFUND_WINDOW_MS-1000)},{createdAt:new Date(Date.now()+1000)}])('rejects ineligible purchase %j',async override=>{db.transaction.findFirst.mockImplementation(async args=>args.where.type==='CREDIT'?{...row(),...override}:{amount:D(5),currency:'USD'});await expect(getRefundQuote('purchase','buyer')).rejects.toThrow('14-day');});
it('requires enough purchased coins plus bonus cover before contacting provider',async()=>{db.wallet.findUniqueOrThrow.mockResolvedValue({id:'wallet',coins:D(30),bonus:D(10)});await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10})).rejects.toThrow('Insufficient');expect(provider.verify).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();});
it('does not reserve coins or create a refund when the original payment cannot be refunded',async()=>{
 provider.verify.mockRejectedValue(new Error('Payment cannot be refunded'));
 await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10})).rejects.toThrow('cannot be refunded');
 expect(db.wallet.update).not.toHaveBeenCalled();expect(db.purchaseRefund.create).not.toHaveBeenCalled();expect(provider.create).not.toHaveBeenCalled();
});
it('binds the purchase lookup to its authenticated owner',async()=>{db.transaction.findFirst.mockResolvedValue(null);await expect(getRefundQuote('purchase','other')).rejects.toThrow('not found');expect(db.transaction.findFirst.mock.calls[0][0].where.userId).toBe('other');});
it('rejects a changed deduction instead of charging more than the confirmed preview',async()=>{await expect(requestPurchaseRefund('purchase','buyer',{coinsDebit:30,bonusDebit:12})).rejects.toThrow('balance changed');expect(db.wallet.update).not.toHaveBeenCalled();});
it('reserves wallet quantities and persists an order before initiating the provider refund',async()=>{
 db.purchaseRefund.updateMany.mockResolvedValue({count:1});provider.result.mockReturnValue({id:'provider-refund',status:'PROCESSING'});
 await requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10});
 expect(db.wallet.update.mock.calls[0][0].data).toEqual({coins:{decrement:D(31.2)},bonus:{decrement:D(10)}});expect(db.purchaseRefund.create).toHaveBeenCalledTimes(1);expect(provider.create).toHaveBeenCalledTimes(1);
});
it('persists the gateway refund receipt before verification and retains it after verification times out',async()=>{
 db.purchaseRefund.updateMany.mockResolvedValue({count:1});
 provider.create.mockImplementation(async(_row,save)=>{
   await save('accepted-refund-id');
   expect(db.purchaseRefund.update).toHaveBeenCalledWith({where:{id:'refund'},data:{providerRefundId:'accepted-refund-id'}});
   throw new Error('Verification timed out');
 });
 await processPurchaseRefund('refund','buyer');
 expect(db.wallet.update).not.toHaveBeenCalled();
 expect(provider.create).toHaveBeenCalledTimes(1);
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'refund.receipt.saved',providerRefundId:'accepted-refund-id'}),expect.any(String));
});
it('traces reservation commit before submitting and settlement after provider verification',async()=>{
 db.purchaseRefund.updateMany.mockResolvedValue({count:1});
 provider.create.mockImplementation(async()=>{
   expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'refund.reservation.committed',purchaseId:'purchase',refundId:expect.any(String)}),expect.any(String));
 });
 await requestPurchaseRefund('purchase','buyer',{coinsDebit:31.2,bonusDebit:10});
 const operations=vi.mocked(logger.info).mock.calls.map(([entry])=>(entry as any).operation);
 expect(operations.indexOf('refund.provider.verified')).toBeLessThan(operations.indexOf('refund.settlement.committed'));
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'refund.request.finished',refundStatus:'PROCESSING'}),expect.any(String));
});
it('logs a definitive gateway submission rejection before restoring the wallet',async()=>{
 db.purchaseRefund.updateMany.mockResolvedValue({count:1});provider.create.mockRejectedValue(new RefundProviderError(true));
 await processPurchaseRefund('refund','buyer');
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({operation:'processPurchaseRefund',refundId:'refund',action:'submit',definitive:true}),expect.any(String));
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'refund.settlement.committed',settlementApplied:true,coinsRestored:'31.2',bonusRestored:'10'}),expect.any(String));
});
it('does not resubmit a refund when provider confirmation is pending',async()=>{provider.read.mockRejectedValue(new Error('timeout'));expect(await processPurchaseRefund('refund','buyer')).toMatchObject({status:'PROCESSING'});expect(provider.create).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();});
it('restores exactly the reserved coins and bonus on a verified failure',async()=>{provider.result.mockReturnValue({id:'provider-refund',status:'FAILED'});await processPurchaseRefund('refund','buyer');expect(db.wallet.update).toHaveBeenCalledWith({where:{userId:'buyer'},data:{coins:{increment:D(31.2)},bonus:{increment:D(10)}}});});
it('restores a newly reserved deduction on a definite provider rejection',async()=>{db.purchaseRefund.updateMany.mockResolvedValue({count:1});provider.create.mockRejectedValue(new RefundProviderError(true));await processPurchaseRefund('refund','buyer');expect(db.wallet.update).toHaveBeenCalledTimes(1);});
it('restores a reservation when Bachs definitively rejects a same-key recovery submission',async()=>{
 const error=new RefundProviderError(true);error.submission=true;provider.read.mockRejectedValue(error);
 await processPurchaseRefund('refund','buyer');expect(db.wallet.update).toHaveBeenCalledTimes(1);
});
it('never restores a reservation merely because a status lookup returns 404',async()=>{
 provider.read.mockRejectedValue(new RefundProviderError(true,Object.assign(new Error('not found'),{statusCode:404})));
 await processPurchaseRefund('refund','buyer');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('marks the original purchase refunded only after provider success',async()=>{provider.result.mockReturnValue({id:'provider-refund',status:'SUCCEEDED'});await processPurchaseRefund('refund','buyer');expect(db.transaction.update).toHaveBeenCalledWith({where:{id:'purchase'},data:{status:'REFUNDED'}});expect(db.wallet.update).not.toHaveBeenCalled();});
it.each(['SUCCEEDED','FAILED'])('duplicate terminal %s confirmation does not change balances',async status=>{db.purchaseRefund.findUnique.mockResolvedValue({...refund(),status});await processPurchaseRefund('refund','buyer');expect(provider.read).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();});
it('never exposes another user refund status',async()=>{await expect(processPurchaseRefund('refund','other')).rejects.toThrow('not found');expect(provider.read).not.toHaveBeenCalled();});
it('lists purchases once each with deterministic pagination and the refund window',async()=>{db.transaction.findMany.mockResolvedValue([row(),{...row(),id:'next'}]);expect(await listPurchases('buyer',1,1)).toMatchObject({items:[{id:'purchase',eligible:true}],nextPage:2});expect(db.transaction.findMany.mock.calls[0][0].where.userId).toBe('buyer');});
