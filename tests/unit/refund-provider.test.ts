import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {createProviderRefund,readProviderRefund,providerRefundResult,verifyRefundPayment,RefundProviderError} from '@/services/v1/wallets/refund-provider';
import {safeError} from '@/logger/sanitize';
import logger from '@/logger';
const row=(gateway='BACHS'):any=>({id:'refund',gateway,paymentId:gateway==='BACHS'?'pay_test':'123',environment:gateway==='BACHS'?'https://sandbox-api.bachs.io':'flutterwave:test',amount:new Prisma.Decimal(5),currency:'USD',createdAt:new Date('2026-10-13T00:00:00Z')});
beforeEach(()=>{vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');});
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
it('posts a Flutterwave refund against the verified original transaction',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({status:'success',data:{id:1234}}));await createProviderRefund(row('FLUTTERWAVE'));expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/transactions/123/refund');expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({amount:5});});
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
it.each(['processing','success','failed'])('checks Bachs refund correlation and %s state',status=>{expect(providerRefundResult(row(),{refund_id:'r',charge_id:'pay_test',reference:'refund',requested_amount:'5.00',refunded_amount:'5.00',status}).status).toBe(status==='success'?'SUCCEEDED':status==='failed'?'FAILED':'PROCESSING');});
it('never claims a partial Bachs refund completed',()=>{expect(providerRefundResult(row(),{refund_id:'r',charge_id:'pay_test',reference:'refund',requested_amount:'5.00',refunded_amount:'3.00',status:'success'}).status).toBe('REVIEW');});
it('rejects mismatched refund amounts or unrelated payment references',()=>{expect(()=>providerRefundResult(row(),{refund_id:'r',charge_id:'another',requested_amount:'5',status:'processing'})).toThrow('mismatch');});
