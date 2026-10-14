import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
vi.mock('@/db',()=>({default:{}}));
import {withdrawalConversion} from '@/services/v1/wallets';
import {payoutRequest,availableBalance,requireProviderBalance,validateWithdrawalDestination,WithdrawalProviderError,resolveWithdrawalBank} from '@/services/v1/wallets/withdrawal-provider';
import {prepareFlutterwaveWithdrawal,runFlutterwaveWithdrawal,flutterwaveWithdrawalOutcome} from '@/services/v1/wallets/withdrawal-flutterwave';
import {bachsWithdrawalOutcome,runBachsWithdrawal} from '@/services/v1/wallets/withdrawal-bachs';
const d=(n:number|string)=>new Prisma.Decimal(n);
const rates={price:d('.015'),ngnPrice:d(18),fee:d('.25'),ngnFee:d('.2'),minWithdrawal:d(5),minNgnWithdrawal:d(1000)};
beforeEach(()=>{vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');});
it('applies the global and Nigerian formulas without withdrawing bonuses or adding coin fees',()=>{
 expect(withdrawalConversion(5000,rates,false).amount.toString()).toBe('56.25');
 expect(withdrawalConversion(5000,rates,true).amount.toString()).toBe('72000');
 expect(withdrawalConversion(5000,rates,true).coins.toString()).toBe('5000');
});
it('checks the minimum on the rounded net amount, including the exact boundary',()=>{
 expect(()=>withdrawalConversion(444.44,rates,false)).toThrow('Minimum withdrawal');
 expect(withdrawalConversion(444.45,rates,false).amount.toString()).toBe('5');
 expect(()=>withdrawalConversion(69.44,rates,true)).toThrow('Minimum withdrawal');
 expect(withdrawalConversion(69.45,rates,true).amount.toString()).toBe('1000.08');
});
it.each([0,-1,NaN,Infinity,1.001])('rejects invalid coin amounts %s',coins=>expect(()=>withdrawalConversion(coins,rates,false)).toThrow());
it('rejects invalid server exchange rates',()=>{
 for(const bad of [{fee:d(1)},{fee:d(-.1)},{price:d(0)},{minWithdrawal:d(-1)}])expect(()=>withdrawalConversion(5000,{...rates,...bad},false)).toThrow();
});
it('restricts bank and crypto routes by the authoritative region',()=>{
 expect(()=>validateWithdrawalDestination({type:'bank',bankCode:'058',accountNumber:'0123456789'},'BACHS',false)).toThrow();
 expect(()=>validateWithdrawalDestination({type:'crypto',asset:'USDT_BEP20',address:'0x'+'a'.repeat(40),confirmed:true},'BACHS',true)).toThrow();
 expect(()=>validateWithdrawalDestination({type:'crypto',asset:'USDT_BEP20',address:'0x'+'a'.repeat(40),confirmed:true},'FLUTTERWAVE',false)).toThrow();
});
it('uses available balance, not ledger or pending balance',async()=>{
 vi.mocked(fetch).mockImplementation(async()=>Response.json({balances:[{currency:'USD',available_balance:'0',pending_balance:'1000',ledger_balance:'1000'}]}));
 expect((await availableBalance('BACHS','USD')).toString()).toBe('0');
 await expect(requireProviderBalance('BACHS','USD',d(5))).rejects.toThrow('insufficient provider funds');
 expect(vi.mocked(fetch).mock.calls.every(([,o])=>o!.method==='GET')).toBe(true);
});
it('does not trust an unresolved Bachs bank response',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({banks:[{code:'058',name:'Bank'}]})).mockResolvedValueOnce(Response.json({resolved:false,account_name:'Someone',account_number:'0123456789'}));
 await expect(resolveWithdrawalBank('BACHS','058','0123456789')).rejects.toThrow('verify');
});
it('classifies 5xx, non-JSON and duplicate reference errors as uncertain',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({error_code:'INTERNAL_ERROR'},{status:500}));
 await expect(payoutRequest('BACHS','/payouts',{},'key')).rejects.toMatchObject({definitive:false});
 vi.mocked(fetch).mockResolvedValueOnce(new Response('bad gateway',{status:502}));
 await expect(payoutRequest('BACHS','/payouts',{},'key')).rejects.toMatchObject({definitive:false});
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'error',message:'Transfer reference already exists'},{status:400}));
 await expect(payoutRequest('FLUTTERWAVE','/transfers',{},'key')).rejects.toMatchObject({definitive:false});
});
it('treats an explicit first-request validation rejection as definitive',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({error_code:'VALIDATION_ERROR'},{status:422}));
 await expect(payoutRequest('BACHS','/payouts',{},'key')).rejects.toBeInstanceOf(WithdrawalProviderError);
});
const flwRow=()=>({id:'wd-fixture',providerId:null,stage:'PAYOUT_SUBMITTING',expiresAt:new Date(Date.now()+60000),providerData:{request:{account_number:'0123456789',account_bank:'058',amount:72000,currency:'NGN',debit_currency:'NGN'},sourceRequired:'72100'}} as any);
const response=()=>({id:42,reference:'wd-fixture',account_number:'0123456789',bank_code:'058',amount:72000,currency:'NGN',debit_currency:'NGN',status:'SUCCESSFUL'});
it('matches payout reference, ID, amount, currency and destination before completion',()=>{
 expect(flutterwaveWithdrawalOutcome(flwRow(),response()).status).toBe('SUCCEEDED');
 for(const bad of [{reference:'another'},{account_number:'1111111111'},{currency:'USD'},{amount:1},{bank_code:'999'}])expect(()=>flutterwaveWithdrawalOutcome(flwRow(),{...response(),...bad})).toThrow('match');
 expect(()=>flutterwaveWithdrawalOutcome({...flwRow(),providerId:'99'},response())).toThrow('match');
});
it('reconciles a lost Flutterwave POST response by reference without sending again',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[response()]}));
 const save=vi.fn();expect(await runFlutterwaveWithdrawal(flwRow(),save)).toEqual({id:'42',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');expect(save).toHaveBeenCalledWith({providerId:'42',stage:'PAYOUT_ACCEPTED'});
});
it('keeps an uncertain missing payout pending and does not restore automatically',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[]}));
 expect(await runFlutterwaveWithdrawal(flwRow(),vi.fn())).toEqual({status:'PROCESSING'});
 expect(fetch).toHaveBeenCalledTimes(1);
});
it('checks provider balance before any Flutterwave submission',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[{currency:'NGN',available_balance:1,ledger_balance:1000000}]}));
 await expect(runFlutterwaveWithdrawal({...flwRow(),stage:'PREPARED'},vi.fn())).rejects.toThrow('insufficient provider funds');
 expect(fetch).toHaveBeenCalledTimes(1);expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
});
it('grosses up crypto fees so the user receives the full exchange value',async()=>{
 vi.mocked(fetch).mockImplementation(async(url:any)=>{
  if(String(url).includes('/transfers/rates')){const amount=new URL(url).searchParams.get('amount')!;return Response.json({status:'success',data:{rate:1,source:{currency:'USD',amount},destination:{currency:'USDC',amount}}});}
  if(String(url).includes('/transfers/fee')) return Response.json({status:'success',data:[{currency:'USDC',fee_type:'value',fee:1.5}]});
  return Response.json({status:'success',data:[{currency:'USD',available_balance:1000}]});
 });
 const plan=await prepareFlutterwaveWithdrawal(d('56.25'),{type:'crypto',asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true});
 expect(plan.receiveAmount).toBe('56.25');expect(plan.data.request.amount).toBe(57.75);expect(plan.data.sourceRequired).toBe('59.25');
});
const bachsRow=()=>({id:'wd-fixture',providerId:'pay-1',stage:'PAYOUT_ACCEPTED',currency:'USD',receiveAmount:'56.25',receiveCurrency:'USDC_BASE',providerData:{accountId:'acct-1',destinationId:'pd-1',fundingAmount:'75.00',sourceAmount:'56.25'}} as any);
it('validates Bachs payout details and only treats delivered status as success',()=>{
 const body={id:'pay-1',reference:'wd-fixture',destination:'pd-1',source_currency:'USD',currency:'USDC_BASE',amount:'56.25',status:'pending'};
 expect(bachsWithdrawalOutcome(bachsRow(),body).status).toBe('PROCESSING');
 expect(bachsWithdrawalOutcome(bachsRow(),{...body,status:'completed'}).status).toBe('SUCCEEDED');
 for(const bad of [{destination:'pd-2'},{reference:'other'},{source_currency:'NGN'},{amount:'1'}])expect(()=>bachsWithdrawalOutcome(bachsRow(),{...body,...bad})).toThrow('match');
});
it('does not claim failure or create another Bachs payout when an uncertain response has no ID',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({items:[]}));
 expect(await runBachsWithdrawal({...bachsRow(),providerId:null,stage:'PAYOUT_SUBMITTING'},vi.fn())).toEqual({status:'PROCESSING'});
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
 expect(vi.mocked(fetch).mock.calls[0][1]!.headers).toMatchObject({'X-Account-Id':'acct-1'});
});
it('rechecks changing crypto fees before submission so the user is never underpaid',async()=>{
 const original=flwRow();original.stage='PREPARED';original.receiveAmount='56.25';original.providerData={request:{account_number:'0x'+'a'.repeat(40),account_bank:'BASE',amount:57.75,currency:'USDC',debit_currency:'USD'},sourceRequired:'59.25'};
 vi.mocked(fetch).mockImplementation(async(url:any)=>Response.json({status:'success',data:String(url).includes('/transfers/fee')?[{currency:'USDC',fee_type:'value',fee:2.5,amount_minus_fee:55.25}]:[{currency:'USD',available_balance:1000}]}));
 const save=vi.fn();await expect(runFlutterwaveWithdrawal(original,save)).rejects.toThrow('fees changed');expect(save).not.toHaveBeenCalled();expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
});
it('quotes and submits the exact NGN net payout after resolving the bank account',async()=>{
 let submitted=0;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
  const path=new URL(url).pathname;
  let data:any;
  if(path==='/v3/banks/NG')data=[{code:'058',name:'Test bank',has_branches:false}];
  else if(path==='/v3/accounts/resolve')data={account_name:'TEST USER',account_number:'0123456789'};
  else if(path==='/v3/transfers/fee')data=[{currency:'NGN',fee_type:'value',fee:100}];
  else if(path==='/v3/balances')data=[{currency:'NGN',available_balance:72100}];
  else {const body=JSON.parse(options.body);submitted++;data={...response(),reference:body.reference};}
  return Response.json({status:'success',data});
 });
 const plan=await prepareFlutterwaveWithdrawal(d(72000),{type:'bank',bankCode:'058',accountNumber:'0123456789'});
 expect(plan.receiveAmount).toBe('72000');expect(plan.data.sourceRequired).toBe('72100');expect(plan.data.request.beneficiary_name).toBe('TEST USER');
 const state={...flwRow(),stage:'PREPARED',providerData:plan.data,receiveAmount:plan.receiveAmount},save=async(data:any)=>Object.assign(state,data);
 expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'42',status:'SUCCEEDED'});expect(submitted).toBe(1);
});
