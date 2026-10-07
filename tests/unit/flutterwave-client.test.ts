import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({get:vi.fn(),create:vi.fn(),options:undefined as unknown}));
vi.mock('axios',()=>({default:{create:deps.create.mockImplementation(options=>{deps.options=options;return {get:deps.get};})}}));
import {flwAPI,verifyFlutterwaveTxn} from '@/utils/flutterwave';
beforeEach(()=>{vi.stubEnv('FLUTTERWAVE_SECK','test-only-key');deps.get.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('uses the fixed read-only verification URL and bearer auth with bounded requests',async()=>{
 const payload={status:'success',data:{id:123,tx_ref:'ref',status:'successful',amount:10,currency:'USD',meta:{}}};
 deps.get.mockResolvedValue({data:payload});
 expect(await flwAPI.Transaction.verify({id:123})).toEqual(payload);
 expect(deps.options).toEqual({baseURL:'https://api.flutterwave.com/v3',timeout:15000,maxRedirects:0});
 expect(deps.get).toHaveBeenCalledWith('/transactions/123/verify',{headers:{Authorization:'Bearer test-only-key'}});
});
it.each(['../accounts','https://evil.invalid','0','-1','1?secret',''])('rejects unsafe transaction ID %s without a request',async id=>{
 await expect(flwAPI.Transaction.verify({id})).rejects.toThrow('Invalid Flutterwave transaction ID');expect(deps.get).not.toHaveBeenCalled();
});
it('fails closed on missing configuration, failed responses and network errors',async()=>{
 vi.stubEnv('FLUTTERWAVE_SECK','');await expect(flwAPI.Transaction.verify({id:1})).rejects.toThrow('not configured');
 vi.stubEnv('FLUTTERWAVE_SECK','test-only-key');deps.get.mockResolvedValue({data:{status:'error'}});
 await expect(flwAPI.Transaction.verify({id:1})).rejects.toThrow('verification failed');
 deps.get.mockRejectedValue(Error('timeout'));expect(await verifyFlutterwaveTxn({id:'1',amount:10,currency:'USD'})).toBe(false);
});
it('preserves status, exact amount and currency verification',async()=>{
 deps.get.mockResolvedValue({data:{status:'success',data:{status:'successful',amount:10,currency:'USD'}}});
 expect(await verifyFlutterwaveTxn({id:'1',amount:10,currency:'USD'})).toBe(true);
 expect(await verifyFlutterwaveTxn({id:'1',amount:9,currency:'USD'})).toBe(false);
 expect(await verifyFlutterwaveTxn({id:'1',amount:10,currency:'NGN'})).toBe(false);
});
