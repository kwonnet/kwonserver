import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {createHmac} from 'node:crypto';
const deps=vi.hoisted(()=>({find:vi.fn(),upsert:vi.fn(),update:vi.fn(),updateMany:vi.fn(),coin:vi.fn(),settle:vi.fn()}));
vi.mock('@/db',()=>({default:{bachsCheckout:{findUnique:deps.find,upsert:deps.upsert,update:deps.update,updateMany:deps.updateMany},coinPackage:{findUnique:deps.coin}}}));
vi.mock('@/services/v1/coins',()=>({purchaseCoinsWithBachs:deps.settle}));
import {createBachsCoinCheckout,getBachsCheckoutStatus,reconcileBachsCheckout,processBachsWebhook} from '@/services/v1/payments';
import {verifiedPaymentId} from '@/services/walletLedger/verifiedPayment';
import {bachsApiOrigin,verifyBachsSignature,isBachsCheckoutId,bachsCheckoutUrl} from '@/utils/bachs';
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

const createArgs={packageId:'pack',currency:'USD' as const,key:'retry-key-123',origin:'https://kwonnet.test'};
async function savedOrder(overrides={}) {
 const {createHash}=await import('node:crypto');
 const row=order();row.id=createHash('sha256').update('bachs:https://sandbox-api.bachs.io:buyer:retry-key-123').digest('hex');
 row.request.success_url=`https://kwonnet.test/store?bachs_order=${row.id}`;
 return {...row,...overrides};
}
it('refuses checkout when Bachs is unconfigured',async()=>{
 vi.stubEnv('BACHS_WEBHOOK_SECRET','');await expect(createBachsCoinCheckout({id:'buyer'} as any,createArgs)).rejects.toThrow('not configured');expect(deps.find).not.toHaveBeenCalled();
});
it.each(['http://kwonnet.test','https://evil.test','https://user@kwonnet.test','https://kwonnet.test:444','https://kwonnet.test/path'])('rejects untrusted return origins %s',async origin=>{
 await expect(createBachsCoinCheckout({id:'buyer'} as any,{...createArgs,origin})).rejects.toThrow('return origin');expect(fetch).not.toHaveBeenCalled();
});
it.each([null,{isActive:false},{isActive:true,endDate:new Date('2000-01-01')}])('rejects missing, disabled or expired packages %j',async coin=>{
 deps.find.mockResolvedValue(null);deps.coin.mockResolvedValue(coin);
 await expect(createBachsCoinCheckout({id:'buyer'} as any,createArgs)).rejects.toThrow('unavailable');expect(fetch).not.toHaveBeenCalled();
});
it('creates USD checkout without buyer contact metadata and saves its validated URL',async()=>{
 deps.find.mockResolvedValue(null);deps.upsert.mockImplementation(async({create}:any)=>({...create,createdAt:new Date(),status:'PENDING'}));
 vi.mocked(fetch).mockResolvedValue(Response.json({checkout_id:'chk_new',checkout_url:'https://checkout.bachs.io/c/new'}));
 const result=await createBachsCoinCheckout({id:'buyer'} as any,createArgs);
 const stored=deps.upsert.mock.calls[0][0].create;
 expect(stored).toMatchObject({currency:'USD',amount:D(10),bonus:D(20)});expect(stored.request.customer).toBeUndefined();
 expect(deps.update).toHaveBeenCalledWith({where:{id:result.orderId},data:{checkoutId:'chk_new',checkoutUrl:'https://checkout.bachs.io/c/new'}});
});
it('rejects closed orders and old uncertain creation attempts without calling Bachs',async()=>{
 deps.find.mockResolvedValue(await savedOrder({status:'PAID'}));await expect(createBachsCoinCheckout({id:'buyer'} as any,createArgs)).rejects.toThrow('already closed');
 deps.find.mockResolvedValue(await savedOrder({checkoutId:null,checkoutUrl:null,createdAt:new Date(Date.now()-24*60*60*1000)}));
 await expect(createBachsCoinCheckout({id:'buyer'} as any,createArgs)).rejects.toThrow('reconciliation');expect(fetch).not.toHaveBeenCalled();
});
it.each([{}, {checkout_id:''}, {checkout_id:'chk_valid',checkout_url:'javascript:alert(1)'}])('rejects invalid provider creation responses %j',async response=>{
 deps.find.mockResolvedValue(await savedOrder({checkoutId:null,checkoutUrl:null}));vi.mocked(fetch).mockResolvedValue(Response.json(response));
 await expect(createBachsCoinCheckout({id:'buyer'} as any,createArgs)).rejects.toThrow(/checkout/i);expect(deps.update).not.toHaveBeenCalled();
});
it.each([null,{environment:'https://api.bachs.io'}])('rejects absent or different-environment orders %j',async value=>{
 deps.find.mockResolvedValue(value&&{...order(),...value});
 await expect(getBachsCheckoutStatus(id,'buyer')).rejects.toThrow('not found');await expect(reconcileBachsCheckout(id,'buyer')).rejects.toThrow('not found');expect(fetch).not.toHaveBeenCalled();
});
it('returns a pending receipt when checkout creation has not yet returned an ID',async()=>{
 deps.find.mockResolvedValue({...order(),checkoutId:null});expect(await reconcileBachsCheckout(id,'buyer')).toMatchObject({status:'pending'});expect(fetch).not.toHaveBeenCalled();
});
it('recovers a missing provider checkout ID from a webhook and verifies before settling',async()=>{
 deps.find.mockResolvedValue({...order(),checkoutId:null});deps.update.mockResolvedValue(order());vi.mocked(fetch).mockResolvedValue(Response.json(checkout()));
 await processBachsWebhook({type:'checkout.completed',data:{checkout_id:'chk_order',reference:id}});
 expect(deps.update).toHaveBeenCalledWith({where:{id},data:{checkoutId:'chk_order'}});expect(deps.settle).toHaveBeenCalledTimes(1);
});
it.each(['expired','cancelled'])('records provider %s status only while the order is pending',async status=>{
 deps.find.mockResolvedValueOnce(order()).mockResolvedValue({...order(),status:status.toUpperCase()});vi.mocked(fetch).mockResolvedValue(Response.json(checkout({status})));
 expect(await reconcileBachsCheckout(id,'buyer')).toMatchObject({status});
 expect(deps.updateMany).toHaveBeenCalledWith({where:{id,status:'PENDING'},data:{status:status.toUpperCase()}});expect(deps.settle).not.toHaveBeenCalled();
});
it.each([null,{status:'failed'},{currency:'NGN'},{checkout_id:'chk_other'},{payment_id:''},{amount_remaining:'1.00'}])('rejects incomplete or inconsistent charge confirmation %j',async override=>{
 const valid=checkout();vi.mocked(fetch).mockResolvedValue(Response.json({...valid,charge:override===null?null:{...valid.charge,...override}}));
 await expect(reconcileBachsCheckout(id,'buyer')).rejects.toThrow('not been fully confirmed');expect(deps.settle).not.toHaveBeenCalled();
});
it.each([10,'NaN','10.001'])('rejects malformed provider amounts %s',async amount=>{
 vi.mocked(fetch).mockResolvedValue(Response.json(checkout({amount})));await expect(reconcileBachsCheckout(id,'buyer')).rejects.toThrow('Invalid Bachs payment amount');expect(deps.settle).not.toHaveBeenCalled();
});
it('accepts an overpaid completed charge with no remaining-amount field',async()=>{
 const valid=checkout();const {amount_remaining,...charge}=valid.charge;
 vi.mocked(fetch).mockResolvedValue(Response.json({...valid,charge:{...charge,status:'overpaid',amount_paid:'11.00'}}));
 expect(await reconcileBachsCheckout(id,'buyer')).toMatchObject({status:'paid'});expect(deps.settle).toHaveBeenCalledTimes(1);
});
it.each([{type:'checkout.completed',data:{}},{type:'checkout.completed',data:{checkout_id:''}},{type:'checkout.completed',data:{checkout_id:'chk_other',reference:'foreign'}},{type:'checkout.completed',data:{checkout_id:'chk_other',reference:id}}])('ignores malformed or foreign-account-product events %j',async event=>{
 deps.find.mockResolvedValue(null);await processBachsWebhook(event);expect(fetch).not.toHaveBeenCalled();expect(deps.settle).not.toHaveBeenCalled();
});
it('finds an order by signed metadata when creation response was lost',async()=>{
 deps.find.mockResolvedValueOnce(null).mockResolvedValue(order());vi.mocked(fetch).mockResolvedValue(Response.json(checkout()));
 await processBachsWebhook({type:'collection.succeeded',data:{checkout_id:'chk_order',metadata:{order_id:id}}});expect(deps.settle).toHaveBeenCalledTimes(1);
});

it.each(['chk_01234567-89ab-cdef','550e8400-e29b-41d4-a716-446655440000'])('accepts opaque checkout IDs through creation and payment verification: %s',async checkoutId=>{
 deps.find.mockResolvedValue(await savedOrder({checkoutId:null,checkoutUrl:null}));
 vi.mocked(fetch).mockResolvedValue(Response.json({checkout_id:checkoutId,checkout_url:'https://checkout.bachs.io/c/opaque'}));
 expect(await createBachsCoinCheckout({id:'buyer'} as any,createArgs)).toMatchObject({checkoutId});
 deps.find.mockResolvedValue({...order(),checkoutId});
 const payment=checkout({checkout_id:checkoutId});payment.charge.checkout_id=checkoutId;
 vi.mocked(fetch).mockResolvedValue(Response.json(payment));
 await processBachsWebhook({type:'checkout.completed',data:{checkout_id:checkoutId}});
 expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({checkoutId}));
});

it.each([undefined,null,42,'',' ','..','.','id\nother'])('rejects unsafe or empty opaque identifiers %j',value=>{
 expect(isBachsCheckoutId(value)).toBe(false);
});
it.each([undefined,'not a URL','http://checkout.bachs.io/c/order','https://buyer@checkout.bachs.io/c/order'])('reports invalid checkout URLs clearly without accepting them: %s',value=>{
 expect(()=>bachsCheckoutUrl(value)).toThrow('checkout URL');
});

it.each(['https://sandbox-checkout.bachs.io/c/test','https://pay.bachs.io/c/test','https://checkout.bachs.io:444/c/test'])('uses the hosted HTTPS URL supplied by Bachs without enforcing an example hostname: %s',async checkoutUrl=>{
 deps.find.mockResolvedValue(await savedOrder({checkoutId:null,checkoutUrl:null}));
 vi.mocked(fetch).mockResolvedValue(Response.json({checkout_id:'opaque-id',checkout_url:checkoutUrl}));
 expect(await createBachsCoinCheckout({id:'buyer'} as any,createArgs)).toMatchObject({checkoutUrl});
 expect(deps.update).toHaveBeenCalledWith(expect.objectContaining({data:{checkoutId:'opaque-id',checkoutUrl}}));
});
