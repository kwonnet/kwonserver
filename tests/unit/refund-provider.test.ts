import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {createProviderRefund,readProviderRefund,providerRefundResult,verifyRefundPayment,RefundProviderError,getRefundProvider} from '@/services/v1/wallets/refund-provider';
import {bachsRefundProvider} from '@/services/v1/wallets/refund-bachs';
import {flutterwaveRefundProvider} from '@/services/v1/wallets/refund-flutterwave';
import {safeError} from '@/logger/sanitize';
import logger from '@/logger';
const row=(gateway='BACHS'):any=>({id:'refund',gateway,paymentId:gateway==='BACHS'?'pay_test':'123',environment:gateway==='BACHS'?'https://sandbox-api.bachs.io':'flutterwave:test',amount:new Prisma.Decimal(5),currency:'USD',createdAt:new Date('2026-10-13T00:00:00Z')});
beforeEach(()=>{vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');});
it('selects the original payment provider and rejects unsupported gateways before HTTP calls',()=>{
 expect(getRefundProvider('BACHS')).toBe(bachsRefundProvider);
 expect(getRefundProvider('FLUTTERWAVE')).toBe(flutterwaveRefundProvider);
 expect(()=>getRefundProvider('WALLET')).toThrow('Unsupported refund provider');
 expect(fetch).not.toHaveBeenCalled();
});
it('reads the documented multiple-refund envelope and query filters',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',message:'Refunds fetched',meta:{page_info:{total:1,current_page:1,total_pages:1,page_size:20}},data:[{
   id:258505,amount_refunded:5,status:'completed-mpgs',flw_ref:'FLW265072855',comment:'',settlement_id:'412245',meta:{source:'ledgerbalance'},created_at:'2026-10-13T00:00:00Z',account_id:82796,transaction_id:123,
 }]}));
 const original=row('FLUTTERWAVE');
 expect(providerRefundResult(original,await readProviderRefund(original))).toEqual({id:'258505',status:'SUCCEEDED'});
 const query=new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams;
 expect(query.get('id')).toBeNull();expect(query.get('currency')).toBe('USD');expect(query.get('page')).toBe('1');
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
});
it('stops at the last page in the documented pagination metadata',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',meta:{page_info:{total_pages:1}},data:[{id:99,transaction_id:456,amount_refunded:5,status:'completed-mpgs'}]}));
 await expect(readProviderRefund(row('FLUTTERWAVE'))).rejects.toThrow('pending');expect(fetch).toHaveBeenCalledTimes(1);
});
it('reads later refund pages when pagination indicates more results',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',meta:{page_info:{total_pages:2}},data:[{id:88,transaction_id:456}]}))
  .mockResolvedValueOnce(Response.json({status:'success',meta:{page_info:{total_pages:2}},data:[{id:99,transaction_id:123,amount_refunded:5,status:'completed-mpgs'}]}));
 expect(providerRefundResult(row('FLUTTERWAVE'),await readProviderRefund(row('FLUTTERWAVE')))).toEqual({id:'99',status:'SUCCEEDED'});
 expect(new URL(String(vi.mocked(fetch).mock.calls[1][0])).searchParams.get('page')).toBe('2');
});
it('reads the documented bare single-refund response by saved refund ID',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({id:469462,amount_refunded:5,status:'completed-mpgs',flw_ref:'ZRIR3520596614954',comment:null,settlement_id:'735099',meta:{source:'ledgerbalance',uniquereference:'659725551792',provider:'GTBANK_DIRECT'},created_at:'2026-10-13T00:00:00Z',account_id:35308,transaction_id:123}));
 const original={...row('FLUTTERWAVE'),providerRefundId:'469462'};
 expect(providerRefundResult(original,await readProviderRefund(original))).toEqual({id:'469462',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/refunds/469462');
});
it('traces gateway submission and response with shared IDs and no private payload',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({refund_id:'provider-refund',status:'processing',customer:{email:'private@example.test'}},{status:201,headers:{'x-request-id':'gateway-request'}}));
 await createProviderRefund({...row(),transactionId:'purchase'});
 const entries=vi.mocked(logger.info).mock.calls.map(([entry])=>entry as any);
 expect(entries.map(entry=>entry.operation)).toEqual(['request.started','request.response','request.accepted']);
 expect(entries[0]).toMatchObject({refundId:'refund',purchaseId:'purchase',providerPaymentId:'pay_test',method:'POST',gateway:'BACHS'});
 expect(entries[1]).toMatchObject({providerHttpStatus:201,providerRequestId:'gateway-request',providerAttemptId:entries[0].providerAttemptId});
 expect(entries[2]).toMatchObject({providerRefundId:'provider-refund',providerStatus:'processing'});
 expect(JSON.stringify(entries)).not.toMatch(/sk_sandbox_test|private@example|customer/);
});
it('traces network failures with the attempt ID without resubmission',async()=>{
 vi.mocked(fetch).mockRejectedValue(new Error('Gateway timed out'));
 await expect(createProviderRefund(row())).rejects.toThrow('timed out');
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({operation:'request.failed',refundId:'refund',method:'POST',providerAttemptId:expect.any(String)}),expect.any(String));
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('posts the original Bachs payment with a stable refund reference and org fee bearer',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({refund_id:'refund-provider'}));await createProviderRefund(row());const [url,request]=vi.mocked(fetch).mock.calls[0];expect(url).toBe('https://sandbox-api.bachs.io/v1/refunds');expect(JSON.parse(request!.body as string)).toMatchObject({charge_id:'pay_test',reference:'refund',amount:'5.00',fee_bearer:'org',idempotency_key:'refund'});});
it('posts a Flutterwave refund against the verified original transaction',async()=>{vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:1234}})).mockResolvedValueOnce(Response.json({id:1234,transaction_id:123,amount_refunded:5,status:'completed-mpgs'}));await createProviderRefund(row('FLUTTERWAVE'));expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/transactions/123/refund');expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({amount:5});});
it('verifies the initiated Flutterwave refund by data.id and transaction_id',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:99,tx_id:999,amount_refunded:5,status:'completed'}}))
   .mockResolvedValueOnce(Response.json({id:99,transaction_id:123,amount_refunded:5,status:'completed-mpgs'}));
 const response=await createProviderRefund(row('FLUTTERWAVE'));
 expect(vi.mocked(fetch).mock.calls.map(([url,options])=>[url,options!.method])).toEqual([
   ['https://api.flutterwave.com/v3/transactions/123/refund','POST'],
   ['https://api.flutterwave.com/v3/refunds/99','GET'],
 ]);
 expect(providerRefundResult(row('FLUTTERWAVE'),response)).toEqual({id:'99',status:'SUCCEEDED'});
});
it('saves the accepted refund ID before verification even when the GET fails',async()=>{
 const save=vi.fn(async()=>{});
 vi.mocked(fetch).mockImplementationOnce(async()=>Response.json({status:'success',data:{id:99}}))
  .mockImplementationOnce(async()=>{expect(save).toHaveBeenCalledWith('99');throw new Error('timeout');});
 await expect(createProviderRefund(row('FLUTTERWAVE'),save)).rejects.toThrow('timeout');
 expect(vi.mocked(fetch).mock.calls.map(([,options])=>options!.method)).toEqual(['POST','GET']);
});
it('checks future status by saved refund ID without depending on comments or alternate transaction IDs',async()=>{
 const saved={...row('FLUTTERWAVE'),providerRefundId:'99'};
 vi.mocked(fetch).mockResolvedValue(Response.json({id:99,transaction_id:456,amount_refunded:5,status:'completed-bank-transfer',comment:'A changed description'}));
 expect(providerRefundResult(saved,await readProviderRefund(saved))).toEqual({id:'99',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/refunds/99');
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('reconciles old Flutterwave refunds using transaction_id with GET only',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',data:[{id:99,transaction_id:123,amount_refunded:5,status:'completed-mpgs'}]}));
 expect(providerRefundResult(row('FLUTTERWAVE'),await readProviderRefund(row('FLUTTERWAVE')))).toEqual({id:'99',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
});
it('compares the verification response ID with the initiated refund ID',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:99}}))
   .mockResolvedValueOnce(Response.json({id:88,transaction_id:123,amount_refunded:5,status:'completed-mpgs'}));
 await expect(createProviderRefund(row('FLUTTERWAVE'))).rejects.toThrow('mismatch');
});
it('retains an uncertain verification failure without sending another POST',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:99}})).mockRejectedValueOnce(new Error('timeout'));
 await expect(createProviderRefund(row('FLUTTERWAVE'))).rejects.toThrow('timeout');
 expect(vi.mocked(fetch).mock.calls.filter(([,options])=>options!.method==='POST')).toHaveLength(1);
});
it('never treats a verification HTTP 404 as rejection of an accepted refund',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:99}}))
   .mockResolvedValueOnce(Response.json({status:'error',message:'Not found'},{status:404}));
 try {await createProviderRefund(row('FLUTTERWAVE'));throw new Error('expected failure');} catch(error) {
   expect(error).toBeInstanceOf(RefundProviderError);expect((error as RefundProviderError).definitive).toBe(false);
 }
});
it.each([400,401,403,404,422,409,500])('classifies provider HTTP %s without claiming an uncertain refund failed',async status=>{vi.mocked(fetch).mockResolvedValue(new Response('{}',{status}));try {await createProviderRefund(row());throw new Error('expected rejection');} catch(error) {expect(error).toBeInstanceOf(RefundProviderError);expect((error as RefundProviderError).definitive).toBe([400,401,403,404,422].includes(status));}});
it('matches verified original payment amount, currency and ID before reserving',async()=>{vi.mocked(fetch).mockImplementation(async()=>Response.json({payment_id:'pay_test',status:'succeeded',amount:'5.00',currency:'USD'}));await verifyRefundPayment('BACHS','pay_test','USD',new Prisma.Decimal(5));await expect(verifyRefundPayment('BACHS','pay_test','NGN',new Prisma.Decimal(5))).rejects.toThrow('verified');});
it('looks up Bachs refund by original payment ID after an unknown outcome',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({refund_id:'refund-provider'}));await readProviderRefund(row());expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://sandbox-api.bachs.io/v1/refunds/by-charge/pay_test');});
it('uses the saved Bachs refund ID for later status checks',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({refund_id:'refund-provider'}));
 await readProviderRefund({...row(),providerRefundId:'refund-provider'});
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://sandbox-api.bachs.io/v1/refunds/refund-provider');
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
});
it('rejects a Bachs payment that cannot be refunded before wallet reservation',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({payment_id:'pay_test',status:'succeeded',amount:'5.00',currency:'USD',is_refundable:false}));
 await expect(verifyRefundPayment('BACHS','pay_test','USD',new Prisma.Decimal(5))).rejects.toThrow('cannot be refunded automatically');
});
it('logs the real gateway status and stable error code without the provider body',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({error_code:'FORBIDDEN',detail:'Private customer information',token:'private-secret'},{status:403}));
 try {await readProviderRefund(row());throw new Error('expected rejection');} catch(error) {
   expect(safeError(error)).toMatchObject({statusCode:503,cause:{statusCode:403,code:'FORBIDDEN',message:'BACHS find refund by payment returned HTTP 403'}});
   expect(JSON.stringify(safeError(error))).not.toMatch(/Private customer|private-secret/);
 }
});
it('retains HTTP diagnostics when the provider returns HTML instead of JSON',async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response('<html>Private information</html>',{status:502}));
 try {await readProviderRefund(row());throw new Error('expected rejection');} catch(error) {
   expect(safeError(error)).toMatchObject({cause:{statusCode:502}});
   expect((error as RefundProviderError).definitive).toBe(false);
 }
});
it('reconciles a lost Flutterwave response by original transaction without another POST',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',data:[{id:99,tx_id:123}]}));expect(await readProviderRefund(row('FLUTTERWAVE'))).toMatchObject({id:99});expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');});
it('reconciles a lost response using Flutterwave legacy TransactionId without another POST',async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',data:[{id:99,TransactionId:123,AmountRefunded:5,status:'completed'}]}));
 const response=await readProviderRefund(row('FLUTTERWAVE'));
 expect(providerRefundResult(row('FLUTTERWAVE'),response)).toEqual({id:'99',status:'PROCESSING'});
 expect(fetch).toHaveBeenCalledTimes(1);expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
});
it.each(['wrapped','bare'])('reads a %s Flutterwave refund resource with legacy fields',async shape=>{
 const data={id:99,TransactionId:123,AmountRefunded:5,status:'completed-mpgs'};
 vi.mocked(fetch).mockResolvedValue(Response.json(shape==='wrapped'?{status:'success',data}:data));
 const saved={...row('FLUTTERWAVE'),providerRefundId:'99'};
 expect(providerRefundResult(saved,await readProviderRefund(saved))).toEqual({id:'99',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/refunds/99');
});
it.each(['completed','processing','pending-momo','pending-mpgs','pending-bank-transfer'])('keeps Flutterwave %s pending',status=>{
 expect(providerRefundResult(row('FLUTTERWAVE'),{id:99,tx_id:123,amount_refunded:5,status}).status).toBe('PROCESSING');
});
it.each(['completed-bank-transfer','completed-momo','completed-preauth','completed-mpgs','completed-offline'])('recognizes Flutterwave terminal %s',status=>{
 expect(providerRefundResult(row('FLUTTERWAVE'),{id:99,TransactionId:123,AmountRefunded:5,status}).status).toBe('SUCCEEDED');
});
it.each([{TransactionId:456,AmountRefunded:5},{TransactionId:123,AmountRefunded:4}])('compares the original payment and amount %j',data=>{
 expect(()=>providerRefundResult(row('FLUTTERWAVE'),{id:99,status:'completed-mpgs',...data})).toThrow('mismatch');
});
it('compares the saved provider refund ID',()=>{
 expect(()=>providerRefundResult({...row('FLUTTERWAVE'),providerRefundId:'88'},{id:99,transaction_id:123,amount_refunded:5,status:'completed-mpgs'})).toThrow('mismatch');
});
it.each(['processing','success','failed'])('checks Bachs refund correlation and %s state',status=>{expect(providerRefundResult(row(),{refund_id:'r',charge_id:'pay_test',reference:'refund',requested_amount:'5.00',refunded_amount:'5.00',status}).status).toBe(status==='success'?'SUCCEEDED':status==='failed'?'FAILED':'PROCESSING');});
it('flags a partial Bachs refund for review',()=>{expect(providerRefundResult(row(),{refund_id:'r',charge_id:'pay_test',reference:'refund',requested_amount:'5.00',refunded_amount:'3.00',status:'success'})).toEqual({id:'r',status:'REVIEW'});});
it('compares the Bachs refund reference',()=>{expect(()=>providerRefundResult(row(),{refund_id:'r',charge_id:'pay_test',reference:'other',requested_amount:'5.00',status:'processing'})).toThrow('mismatch');});
it.each([{status:'success'},{refund_id:'r'}])('requires the properties used to update refund state %j',data=>{expect(()=>providerRefundResult(row(),data)).toThrow('ID or status is missing');});

it('accepts an opaque refund ID without regex format checks',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:'refund-opaque'}}))
  .mockResolvedValueOnce(Response.json({id:'refund-opaque',transaction_id:123,amount_refunded:5,status:'completed-mpgs'}));
 expect(providerRefundResult(row('FLUTTERWAVE'),await createProviderRefund(row('FLUTTERWAVE')))).toEqual({id:'refund-opaque',status:'SUCCEEDED'});
});

it('reconciles completed account refunds by exact comment when Flutterwave transaction IDs differ',async()=>{
 const original={...row('FLUTTERWAVE'),id:'c986-refund',paymentId:'10548533',amount:new Prisma.Decimal(1590),currency:'NGN'};
 vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',meta:{page_info:{total:3,total_pages:1,current_page:1}},data:[
  {id:109515,transaction_id:9791583,amount_refunded:560,status:'completed-bank-transfer',comment:'Coin purchase refund another-refund'},
  {id:109516,transaction_id:9791651,amount_refunded:1590,status:'completed-bank-transfer',comment:'Coin purchase refund c986-refund'},
  {id:109504,transaction_id:9783985,amount_refunded:5515,status:'completed-bank-transfer',comment:'Coin purchase refund third-refund'},
 ]}));
 expect(providerRefundResult(original,await readProviderRefund(original))).toEqual({id:'109516',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'refund.reference.verified',providerRefundId:'109516'}),expect.any(String));
});
it.each([
 {comment:'Coin purchase refund another',amount_refunded:5,id:99},
 {comment:'Coin purchase refund refund',amount_refunded:4,id:99},
 {comment:'Coin purchase refund refund',amount_refunded:5,id:88},
])('rejects wrong references, amounts or saved IDs even when using reference recovery %j',data=>{
 expect(()=>providerRefundResult({...row('FLUTTERWAVE'),providerRefundId:data.id===88?'99':null},{transaction_id:456,status:'completed-bank-transfer',...data})).toThrow('mismatch');
});
it('verifies a fresh refund by the returned refund ID, exact comment and amount',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:99}}))
  .mockResolvedValueOnce(Response.json({id:99,transaction_id:456,comment:'Coin purchase refund refund',amount_refunded:5,status:'completed-bank-transfer'}));
 expect(providerRefundResult(row('FLUTTERWAVE'),await createProviderRefund(row('FLUTTERWAVE')))).toEqual({id:'99',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls.map(([,options])=>options!.method)).toEqual(['POST','GET']);
});
