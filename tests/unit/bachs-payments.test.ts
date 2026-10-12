import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {createHmac} from 'node:crypto';
const deps=vi.hoisted(()=>({find:vi.fn(),upsert:vi.fn(),update:vi.fn(),updateMany:vi.fn(),coin:vi.fn(),settle:vi.fn()}));
vi.mock('@/db',()=>({default:{bachsCheckout:{findUnique:deps.find,upsert:deps.upsert,update:deps.update,updateMany:deps.updateMany},coinPackage:{findUnique:deps.coin}}}));
vi.mock('@/services/v1/coins',()=>({purchaseCoinsWithBachs:deps.settle}));
import {createBachsCoinCheckout,getBachsCheckoutStatus,reconcileBachsCheckout,processBachsWebhook} from '@/services/v1/payments';
import {verifiedPaymentId} from '@/services/walletLedger/verifiedPayment';
import {bachsApiOrigin,verifyBachsSignature} from '@/utils/bachs';
const D=(n:number)=>new Prisma.Decimal(n),id='a'.repeat(64);
const order=()=>({id,userId:'buyer',packageId:'pack',environment:'https://sandbox-api.bachs.io',currency:'USD',amount:D(10),coins:D(1000),bonus:D(20),request:{success_url:`https://kwonnet.test/store?bachs_order=${id}`},status:'PENDING',createdAt:new Date(),checkoutId:'chk_order',checkoutUrl:'https://checkout.bachs.io/c/abc'});
const checkout=(overrides={})=>({checkout_id:'chk_order',reference:id,currency:'USD',amount:'10.00',status:'completed',charge:{payment_id:'pay_test',checkout_id:'chk_order',status:'succeeded',currency:'USD',amount_paid:'10.00',amount_remaining:'0.00'},...overrides});
beforeEach(()=>{Object.values(deps).forEach(fn=>fn.mockReset());vi.stubEnv('BACHS_API_KEY','sk_sandbox_unit_test');vi.stubEnv('BACHS_WEBHOOK_SECRET','unit-secret');deps.find.mockResolvedValue(order());deps.settle.mockResolvedValue({status:'paid'});deps.coin.mockResolvedValue({id:'pack',isActive:true,price:D(10),ngnPrice:D(15000),amount:D(1000),bonus:D(20),ngnBonus:D(30)});});
it('validates raw bytes, timestamp, both signature formats and rotated signatures',()=>{
 const raw=Buffer.from('{ "type": "checkout.completed" }'),t=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256','unit-secret').update(`${t}.`).update(raw).digest('hex');
 expect(verifyBachsSignature(raw,signature,t)).toBe(true);
 expect(verifyBachsSignature(raw,undefined,undefined,`t=${t},v1=${'0'.repeat(64)},v1=${signature}`)).toBe(true);
 expect(verifyBachsSignature(Buffer.from('{}'),signature,t)).toBe(false);
 expect(verifyBachsSignature(raw,signature,String(Number(t)-301))).toBe(false);
 expect(verifyBachsSignature(raw,'bad',t)).toBe(false);
 expect(verifyBachsSignature(raw,signature,t,`t=${t},t=${t},v1=${signature}`)).toBe(false);
});
it('selects the API environment from the secret key',()=>{expect(bachsApiOrigin()).toBe('https://sandbox-api.bachs.io');vi.stubEnv('BACHS_API_KEY','sk_live_unit');expect(bachsApiOrigin()).toBe('https://api.bachs.io');vi.stubEnv('BACHS_API_KEY','wrong');expect(()=>bachsApiOrigin()).toThrow();});
it('builds a server-priced snapshot and stable authenticated checkout, without trusting client metadata',async()=>{
 deps.find.mockResolvedValue(null);deps.upsert.mockImplementation(async({create}:any)=>({...create,createdAt:new Date(),status:'PENDING'}));
 vi.mocked(fetch).mockResolvedValue(Response.json({checkout_id:'chk_new',checkout_url:'https://checkout.bachs.io/c/new'}));
 const result=await createBachsCoinCheckout({id:'buyer',email:'buyer@example.test',name:'Buyer'} as any,{packageId:'pack',currency:'NGN',key:'retry-key-123',origin:'https://kwonnet.test'});
 const [url,options]=vi.mocked(fetch).mock.calls[0];expect(url).toBe('https://sandbox-api.bachs.io/v1/checkout-sessions');
 const body=JSON.parse(options!.body as string);expect(body.pricing).toEqual({currency:'NGN',amount:'15000.00'});expect(body.billing_currency).toBe('NGN');expect(body.metadata).toEqual({order_id:result.orderId,purpose:'COIN_PACKAGE'});
 expect(options!.headers).toMatchObject({'Idempotency-Key':result.orderId,Authorization:'Bearer sk_sandbox_unit_test'});
 expect(deps.upsert.mock.calls[0][0].create).toMatchObject({userId:'buyer',coins:D(1000),bonus:D(30)});
});
it('reuses successful checkout responses without creating another provider session',async()=>{
 const row=order();const args={packageId:'pack',currency:'USD' as const,key:'retry-key-123',origin:'https://kwonnet.test'};
 // The stored return URL is bound to the deterministic ID created for this key.
 const {createHash}=await import('node:crypto');row.id=createHash('sha256').update('bachs:https://sandbox-api.bachs.io:buyer:retry-key-123').digest('hex');row.request.success_url=`https://kwonnet.test/store?bachs_order=${row.id}`;deps.find.mockResolvedValue(row);
 expect((await createBachsCoinCheckout({id:'buyer'} as any,args)).checkoutId).toBe('chk_order');expect(fetch).not.toHaveBeenCalled();
 await expect(createBachsCoinCheckout({id:'buyer'} as any,{...args,packageId:'other'})).rejects.toThrow('Idempotency');
});
it.each([{reference:'wrong'},{amount:'0.01'},{currency:'NGN'},{checkout_id:'other'},{charge:{payment_id:'pay',checkout_id:'chk_order',currency:'USD',status:'succeeded',amount_paid:'0.01'}}])('rejects payment tampering or underpayment %j',async override=>{
 vi.mocked(fetch).mockResolvedValue(Response.json(checkout(override)));await expect(reconcileBachsCheckout(id,'buyer')).rejects.toThrow();expect(deps.settle).not.toHaveBeenCalled();
});
it('marks only provider-verified successful payments as settleable',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json(checkout()));expect(await reconcileBachsCheckout(id,'buyer')).toMatchObject({status:'paid'});
 const payload=deps.settle.mock.calls[0][0];expect(verifiedPaymentId(payload)).toBe('pay_test');expect(payload).toMatchObject({orderId:id,userId:'buyer',checkoutId:'chk_order'});
});
it('preserves pending payments and never trusts the redirect as success',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json(checkout({status:'open',charge:null})));expect(await reconcileBachsCheckout(id,'buyer')).toMatchObject({status:'pending'});expect(deps.settle).not.toHaveBeenCalled();
});
it('rejects the wrong buyer before making a provider request',async()=>{await expect(reconcileBachsCheckout(id,'other')).rejects.toThrow('not found');await expect(getBachsCheckoutStatus(id,'other')).rejects.toThrow('not found');expect(fetch).not.toHaveBeenCalled();});
it('paid receipts and duplicate success events do not settle again',async()=>{
 deps.find.mockResolvedValue({...order(),status:'PAID'});await processBachsWebhook({type:'collection.succeeded',data:{checkout_id:'chk_order'}});expect(deps.settle).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('ignores unrelated webhook events and returns retriable failures for processing lag',async()=>{
 await processBachsWebhook({type:'customer.updated'});expect(fetch).not.toHaveBeenCalled();
 vi.mocked(fetch).mockResolvedValue(Response.json(checkout({status:'open'})));await expect(processBachsWebhook({type:'checkout.completed',data:{checkout_id:'chk_order'}})).rejects.toThrow('pending');
});
