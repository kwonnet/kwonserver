import {beforeEach,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
const services=vi.hoisted(()=>({createBachsCoinCheckout:vi.fn(),getBachsCheckoutStatus:vi.fn(),reconcileBachsCheckout:vi.fn(),processBachsWebhook:vi.fn()}));
vi.mock('@/services/v1/payments',()=>services);
vi.mock('@/utils',()=>({validateZodInput:vi.fn()}));
vi.mock('@/services/v1/coins',()=>({purchaseCoinsWithFlutterwave:vi.fn()}));
vi.mock('@/services/v1/subscriptions',()=>({purchaseAppSubscription:vi.fn()}));
import {bachsWebhookController,createBachsCheckoutController,bachsStatusController} from '@/controllers/v1/payments';
function response(){const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res;}
beforeEach(()=>{vi.stubEnv('BACHS_WEBHOOK_SECRET','unit-secret');Object.values(services).forEach(fn=>fn.mockReset());});
it('rejects signatures before dispatching webhook processing and returns retryable 5xx for settlement failure',async()=>{
 const body=Buffer.from('{ "id":"evt_test", "type":"checkout.completed", "data":{} }'),t=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256','unit-secret').update(`${t}.`).update(body).digest('hex');
 const req:any={body,get:(key:string)=>({'X-Bachs-Timestamp':t,'X-Bachs-Signature':signature}[key])};
 const res=response();await bachsWebhookController({...req,body:Buffer.from('{}')},res);expect(res.status).toHaveBeenCalledWith(400);expect(services.processBachsWebhook).not.toHaveBeenCalled();
 services.processBachsWebhook.mockRejectedValue(new Error('DB down'));const failed=response();await bachsWebhookController(req,failed);expect(failed.status).toHaveBeenCalledWith(503);
 services.processBachsWebhook.mockResolvedValue(undefined);const success=response();await bachsWebhookController(req,success);expect(success.json).toHaveBeenCalledWith({received:true});
});
it('creation rejects client prices and passes only package, fiat currency and authenticated buyer',async()=>{
 const base:any={user:{id:'buyer'},get:(key:string)=>key==='Idempotency-Key'?'retry-key-123':'https://kwonnet.test'};
 const bad=response();await createBachsCheckoutController({...base,body:{packageId:'pack',currency:'USD',amount:1,userId:'other'}},bad);expect(bad.status).toHaveBeenCalledWith(400);expect(services.createBachsCoinCheckout).not.toHaveBeenCalled();
 await createBachsCheckoutController({...base,body:{packageId:'pack',currency:'USD'}},response());expect(services.createBachsCoinCheckout).toHaveBeenCalledWith(base.user,{packageId:'pack',currency:'USD',key:'retry-key-123',origin:'https://kwonnet.test'});
});
it('verification and receipt queries are bound to the authenticated viewer',async()=>{
 const id='a'.repeat(64);await bachsStatusController({params:{id},method:'POST',user:{id:'viewer'}} as any,response());expect(services.reconcileBachsCheckout).toHaveBeenCalledWith(id,'viewer');
 const res=response();await bachsStatusController({params:{id},method:'GET'} as any,res);expect(res.status).toHaveBeenCalledWith(401);
});
