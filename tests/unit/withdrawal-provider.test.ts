import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import logger from '@/logger';
vi.mock('@/db',()=>({default:{}}));
import {withdrawalConversion} from '@/services/v1/wallets';
import {withdrawalStep,withdrawalDiagnostic,payoutRequest,availableBalance,requireProviderBalance,validateWithdrawalDestination,cryptoRoutes,WithdrawalProviderError,resolveWithdrawalBank} from '@/services/v1/wallets/withdrawal-provider';
import {prepareFlutterwaveWithdrawal,runFlutterwaveWithdrawal,flutterwaveWithdrawalOutcome} from '@/services/v1/wallets/withdrawal-flutterwave';
import {bachsWithdrawalOutcome,runBachsWithdrawal} from '@/services/v1/wallets/withdrawal-bachs';
const d=(n:number|string)=>new Prisma.Decimal(n);
const rates={price:d('.015'),ngnPrice:d(18),fee:d('.25'),ngnFee:d('.2'),minWithdrawal:d(10),minNgnWithdrawal:d(1000)};
beforeEach(()=>{vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');});
it('applies the global and Nigerian formulas without withdrawing bonuses or adding coin fees',()=>{
 expect(withdrawalConversion(5000,rates,false).amount.toString()).toBe('56.25');
 expect(withdrawalConversion(5000,rates,true).amount.toString()).toBe('72000');
 expect(withdrawalConversion(5000,rates,true).coins.toString()).toBe('5000');
});
it('checks the minimum on the rounded net amount, including the exact boundary',()=>{
 expect(()=>withdrawalConversion(888.88,rates,false)).toThrow('Minimum withdrawal');
 expect(withdrawalConversion(888.89,rates,false).amount.toString()).toBe('10');
 expect(()=>withdrawalConversion(69.44,rates,true)).toThrow('Minimum withdrawal');
 expect(withdrawalConversion(69.45,rates,true).amount.toString()).toBe('1000.08');
});
it.each([0,-1,NaN,Infinity,1.001])('rejects invalid coin amounts %s',coins=>expect(()=>withdrawalConversion(coins,rates,false)).toThrow());
it('rejects invalid server exchange rates',()=>{
 for(const bad of [{fee:d(1)},{fee:d(-.1)},{price:d(0)},{minWithdrawal:d(-1)}])expect(()=>withdrawalConversion(5000,{...rates,...bad},false)).toThrow();
});
it('restricts bank and crypto routes by the authoritative region',()=>{
 expect(()=>validateWithdrawalDestination({type:'bank',bankCode:'058',accountNumber:'0123456789'},'BACHS',false)).toThrow();
 expect(()=>validateWithdrawalDestination({type:'crypto',asset:'USDT_BEP20',address:'0x'+'a'.repeat(40),confirmed:true},'BACHS',true)).not.toThrow();
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
it('reconciles successful Solana mainnet responses without relaxing address or money checks',async()=>{
 const address='8UT6Ca19SKgFMCqpzqYxUL4nXYv9qnqTHbCDQR5uxeWZ';
 const row={...flwRow(),status:'REVIEW',receiveAmount:'11.25',providerData:{request:{account_number:address,account_bank:'SOLANA',amount:12.75,currency:'USDT',debit_currency:'USDT'}}};
 const transfer={id:43,reference:row.id,account_number:address,bank_code:'SOLANA_MAINNET',amount:12.75,fee:1.5,currency:'USDT',debit_currency:'USDT',status:'SUCCESSFUL'};
 expect(flutterwaveWithdrawalOutcome(row,transfer)).toEqual({id:'43',status:'SUCCEEDED'});
 for(const bad of [{account_number:address.toLowerCase()},{bank_code:'ETHEREUM'},{bank_code:'SOLANA_DEVNET'},{amount:11.25},{currency:'USDC'},{debit_currency:'USD'},{reference:'other'}])expect(()=>flutterwaveWithdrawalOutcome(row,{...transfer,...bad})).toThrow('match');
 expect(()=>flutterwaveWithdrawalOutcome({...row,providerId:'different'},transfer)).toThrow('match');
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[transfer]}));
 const save=vi.fn();expect(await runFlutterwaveWithdrawal(row,save)).toEqual({id:'43',status:'SUCCEEDED'});
 expect(save).toHaveBeenCalledWith({providerId:'43',stage:'PAYOUT_ACCEPTED'});
 expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
 const diagnostics=vi.mocked(logger.info).mock.calls.map(([entry])=>entry as any).filter(entry=>entry.operation==='provider.response_mismatch');
 expect(diagnostics.some(entry=>entry.outcome==='network')).toBe(true);
 expect(JSON.stringify(diagnostics)).not.toContain(address);
});
it('reconciles the accepted USDC Ethereum transfer by ID even after its quote expires',async()=>{
 const address='0x4DEfEF6c9CB007C7cCd9F60bAd076270AB117f65';
 const row={...flwRow(),id:'08e92ce0-e80f-4ad0-9519-b18e7da6fdb6',providerId:'2247362',stage:'PAYOUT_ACCEPTED',status:'REVIEW',expiresAt:new Date(0),receiveAmount:d('14.62'),providerData:{request:{account_number:address,account_bank:'ETHEREUM',amount:16.12,currency:'USDC',debit_currency:'USDC'}}};
 const transfer={id:2247362,reference:row.id,account_number:address,bank_code:'ETH_MAINNET',bank_name:'ETH_MAINNET',amount:16.12,fee:1.5,currency:'USDC',debit_currency:'USDC',status:'SUCCESSFUL',meta:[{meta_name:'fee currency conversion',from_currency:'USD',from_amount:1.5,to_currency:'USDC',to_amount:1.5,rate:1}]};
 for(const bad of [{account_number:address.toLowerCase()},{bank_code:'ETH_TESTNET'},{bank_code:'SOLANA_MAINNET'},{amount:14.62},{currency:'USDT'},{debit_currency:'USD'},{reference:'other'},{id:2247363}])expect(()=>flutterwaveWithdrawalOutcome(row,{...transfer,...bad})).toThrow('match');
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',message:'Transfer fetched',data:transfer}));
 const save=vi.fn();expect(await runFlutterwaveWithdrawal(row,save)).toEqual({id:'2247362',status:'SUCCEEDED'});
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/transfers/2247362');
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
 expect(save).toHaveBeenCalledWith(expect.objectContaining({providerFee:'1.5',providerFeeCurrency:'USDC',providerFeeSource:'PROVIDER'}));
});
it('reconciles the reported successful Base payout by its saved ID without submitting again',async()=>{
 const address='0x4DEfEF6c9CB007C7cCd9F60bAd076270AB117f65';
 const row={...flwRow(),id:'245cdd9d-4f46-4034-af46-908370e22eea',providerId:'2247392',stage:'PAYOUT_ACCEPTED',status:'REVIEW',expiresAt:new Date(0),receiveAmount:d('12.37'),providerData:{request:{account_number:address,account_bank:'BASE',amount:13.87,currency:'USDC',debit_currency:'USDC'}}};
 const transfer={id:2247392,reference:row.id,account_number:address,bank_code:'BASE_MAINNET',bank_name:'BASE_MAINNET',full_name:`BASE${address}`,created_at:'2026-10-23T14:37:32.000Z',currency:'USDC',debit_currency:'USDC',amount:13.87,fee:1.5,status:'SUCCESSFUL',meta:[{meta_name:'fee currency conversion',from_currency:'USD',from_amount:1.5,to_currency:'USDC',to_amount:1.5,rate:1}],narration:'Kwonnet coin withdrawal',complete_message:'Successful',requires_approval:0,is_approved:1,approver:null};
 for(const bad of [{account_number:address.toLowerCase()},{bank_code:'BASE_SEPOLIA'},{bank_code:'ETH_MAINNET'},{amount:12.37},{currency:'USDT'},{debit_currency:'USD'},{reference:'other'},{id:2247393}])expect(()=>flutterwaveWithdrawalOutcome(row,{...transfer,...bad})).toThrow('match');
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',message:'Transfer fetched',data:transfer}));
 const save=vi.fn();expect(await runFlutterwaveWithdrawal(row,save)).toEqual({id:'2247392',status:'SUCCEEDED'});
 expect(fetch).toHaveBeenCalledTimes(1);expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/transfers/2247392');expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
 expect(save).toHaveBeenCalledWith(expect.objectContaining({providerFee:'1.5',providerFeeCurrency:'USDC',providerFeeSource:'PROVIDER'}));
});
it.each(['USDT','USDC','RLUSD'])('accepts the exact Ethereum mainnet alias for supported %s routes',currency=>{
 const row={...flwRow(),providerData:{request:{...flwRow().providerData.request,currency,account_bank:'ETHEREUM'}}};
 expect(flutterwaveWithdrawalOutcome(row,{...response(),currency,bank_code:'ETH_MAINNET'}).status).toBe('SUCCEEDED');
 expect(()=>flutterwaveWithdrawalOutcome(flwRow(),{...response(),bank_code:'ETH_MAINNET'})).toThrow('match');
});
it.each(cryptoRoutes.FLUTTERWAVE)('reconciles $id by transfer ID with its supported network response',async(route)=>{
 const address=route.network==='SOLANA'?'8UT6Ca19SKgFMCqpzqYxUL4nXYv9qnqTHbCDQR5uxeWZ':'0x'+'a'.repeat(40);
 const row={...flwRow(),providerId:'42',stage:'PAYOUT_ACCEPTED',status:'REVIEW',providerData:{request:{account_number:address,account_bank:route.network,amount:16.12,currency:route.asset,debit_currency:route.asset}}};
 const aliases:Record<string,string>={SOLANA:'SOLANA_MAINNET',ETHEREUM:'ETH_MAINNET',BASE:'BASE_MAINNET',POLYGON:'POLYGON_MAINNET'};
 const transfer={id:42,reference:row.id,account_number:address,bank_code:route.network,amount:16.12,currency:route.asset,debit_currency:route.asset,status:'SUCCESSFUL'};
 for(const bank_code of ['BASE_SEPOLIA','POLYGON_AMOY','SOLANA_DEVNET','ETH_TESTNET','UNKNOWN_MAINNET',...Object.values(aliases).filter(alias=>alias!==aliases[route.network])])expect(()=>flutterwaveWithdrawalOutcome(row,{...transfer,bank_code})).toThrow('match');
 for(const bank_code of new Set([route.network,aliases[route.network]??route.network])){
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:42,reference:row.id,account_number:address,bank_code,amount:16.12,currency:route.asset,debit_currency:route.asset,status:'SUCCESSFUL'}}));
  expect(await runFlutterwaveWithdrawal(row,vi.fn())).toEqual({id:'42',status:'SUCCEEDED'});
  expect(fetch).toHaveBeenCalledTimes(1);expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/transfers/42');
  expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');
 }
});
it('reconciles a lost Flutterwave POST response by reference without sending again',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[response()]}));
 const save=vi.fn();expect(await runFlutterwaveWithdrawal(flwRow(),save)).toEqual({id:'42',status:'SUCCEEDED'});
 expect(vi.mocked(fetch).mock.calls[0][1]!.method).toBe('GET');expect(save).toHaveBeenCalledWith({providerId:'42',stage:'PAYOUT_ACCEPTED'});
});
it('persists the initiation ID before full validation and later verifies that ID without resending',async()=>{
 const state={...flwRow(),stage:'PREPARED'};
 let posts=0,valid=false;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
  const path=new URL(url).pathname;
  if(path==='/v3/balances')return Response.json({status:'success',data:[{currency:'NGN',available_balance:100000}]});
  if(path==='/v3/transfers/fee')return Response.json({status:'success',data:[{currency:'NGN',fee_type:'value',fee:100}]});
  if(options.method==='POST')posts++;
  return Response.json({status:'success',data:{...response(),bank_code:valid?'058':'unexpected-provider-code'}});
 });
 const save=vi.fn(async(data:any)=>Object.assign(state,data));
 await expect(runFlutterwaveWithdrawal(state,save)).rejects.toThrow('match');
 expect(state.providerId).toBe('42');expect(state.stage).toBe('PAYOUT_ACCEPTED');expect(posts).toBe(1);
 expect(save).toHaveBeenCalledWith({providerId:'42',stage:'PAYOUT_ACCEPTED'});
 valid=true;expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'42',status:'SUCCEEDED'});
 expect(String(vi.mocked(fetch).mock.calls.at(-1)![0])).toContain('/transfers/42');expect(posts).toBe(1);
});
it('does not attach a transfer ID for another reference or replace an existing ID',async()=>{
 const state={...flwRow(),providerId:'42',stage:'PAYOUT_ACCEPTED'},save=vi.fn();
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{...response(),reference:'other',id:99}}));
 await expect(runFlutterwaveWithdrawal(state,save)).rejects.toThrow('match');expect(save).not.toHaveBeenCalled();expect(state.providerId).toBe('42');
});
it('recovers a missing ID from a reference lookup even when the transfer still needs review',async()=>{
 const state=flwRow(),save=vi.fn(async(data:any)=>Object.assign(state,data));
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[{...response(),amount:1}]}));
 await expect(runFlutterwaveWithdrawal(state,save)).rejects.toThrow('match');
 expect(state.providerId).toBe('42');expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
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
  return Response.json({status:'success',data:[{currency:'USD',available_balance:0,ledger_balance:376.49},{currency:'USDC',available_balance:1234.56,ledger_balance:0}]});
 });
 const plan=await prepareFlutterwaveWithdrawal(d('56.25'),{type:'crypto',asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true});
 expect(plan.data.request.debit_currency).toBe('USDC');expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('debit_currency=USD'))).toBe(false);
 expect(plan.receiveAmount).toBe('56.25');expect(plan.data.request.amount).toBe(57.75);expect(plan.data.sourceRequired).toBe('57.75');expect(plan.data.feeEstimate).toEqual({amount:'1.5',currency:'USDC',includesConversion:false});
});
it('quotes and sends USDT from its available stablecoin balance when fiat is unavailable',async()=>{
 let submitted:any;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
  const path=new URL(url).pathname;
  if(path==='/v3/transfers/rates')return Response.json({status:'success',data:{rate:1,source:{currency:'USD',amount:1},destination:{currency:'USDT',amount:1}}});
  if(path==='/v3/transfers/fee')return Response.json({status:'success',data:[{currency:'USDT',fee_type:'value',fee:1.5}]});
  if(path==='/v3/balances')return Response.json({status:'success',data:[{currency:'USD',available_balance:0,ledger_balance:376.49},{currency:'USDC',available_balance:1234.56},{currency:'USDT',available_balance:789.01,ledger_balance:0}]});
  submitted=JSON.parse(options.body);
  return Response.json({status:'success',data:{...submitted,id:43,bank_code:submitted.account_bank,status:'SUCCESSFUL'}});
 });
 const plan=await prepareFlutterwaveWithdrawal(d('6.75'),{type:'crypto',asset:'USDT_SOLANA',address:'test-solana-wallet',confirmed:true});
 expect(plan.receiveAmount).toBe('6.75');expect(plan.data.sourceRequired).toBe('8.25');expect(plan.data.request).toMatchObject({currency:'USDT',debit_currency:'USDT',amount:8.25,account_bank:'SOLANA'});
 const state={...flwRow(),stage:'PREPARED',providerData:plan.data,receiveAmount:plan.receiveAmount};
 expect(await runFlutterwaveWithdrawal(state,async(data:any)=>Object.assign(state,data))).toEqual({id:'43',status:'SUCCEEDED'});
 expect(submitted).toMatchObject({currency:'USDT',debit_currency:'USDT',amount:8.25});
 expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('/transfers/rates'))).toHaveLength(1);
 expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('debit_currency=USD'))).toBe(false);
});
for(const [asset,currency,network] of [['USDT_SOLANA','USDT','SOLANA'],['USDC_BASE','USDC','BASE'],['RLUSD_ETHEREUM','RLUSD','ETHEREUM']]) {
 for(const late of [false,true])it(`falls back to USD for ${currency} ${late?'at dispatch':'at quote'} without grossing up separately charged fiat fees`,async()=>{
  let nativeBalance=late?100:0,usdBalance=10,submitted:any,saved:any;
  vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
   const parsed=new URL(url),path=parsed.pathname;
   if(path==='/v3/transfers/rates') {const amount=parsed.searchParams.get('amount');return Response.json({status:'success',data:{rate:1,source:{currency:'USD',amount},destination:{currency,amount}}});}
   if(path==='/v3/transfers/fee')return Response.json({status:'success',data:[parsed.searchParams.get('debit_currency')==='USD'?{currency,fee_type:'percentage',fee:1,fee_amount_in_fiat_currency:0.07,amount_minus_fee:6.68}:{currency,fee_type:'value',fee:1.5}]});
   if(path==='/v3/balances')return Response.json({status:'success',data:[...(late?[{currency,available_balance:nativeBalance}]:[]),{currency:'USD',available_balance:usdBalance,ledger_balance:500}]});
   submitted=JSON.parse(options.body);expect(saved.request).toEqual(expect.objectContaining({amount:6.75,debit_currency:'USD'}));
   return Response.json({status:'success',data:{...submitted,id:44,bank_code:submitted.account_bank,status:'SUCCESSFUL'}});
  });
  const plan=await prepareFlutterwaveWithdrawal(d('6.75'),{type:'crypto',asset,address:'wallet',confirmed:true});
  expect(plan.receiveAmount).toBe('6.75');expect(plan.data.request.debit_currency).toBe(late?currency:'USD');
  if(!late){expect(plan.data.request.amount).toBe(6.75);expect(plan.data.sourceRequired).toBe('6.82');expect(plan.data.feeEstimate).toEqual({amount:'0.07',currency:'USD',includesConversion:true});}
  nativeBalance=0;
  const state={...flwRow(),stage:'PREPARED',providerData:plan.data,receiveAmount:plan.receiveAmount};
  const save=async(data:any)=>{if(data.providerData)saved=data.providerData;return Object.assign(state,data);};
  usdBalance=6.8;
  await expect(runFlutterwaveWithdrawal(state,save)).rejects.toThrow('insufficient provider funds');expect(submitted).toBeUndefined();expect(saved).toBeUndefined();
  usdBalance=10;
  expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'44',status:'SUCCEEDED'});
  expect(submitted).toMatchObject({amount:6.75,currency,debit_currency:'USD',account_bank:network});expect(saved.sourceRequired).toBe('6.82');
  // Once submission is uncertain, reconcile the saved USD plan without switching or resending.
  state.stage='PAYOUT_SUBMITTING';state.providerId=null;nativeBalance=100;usdBalance=0;
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:[{...submitted,id:44,bank_code:network,status:'SUCCESSFUL'}]}));
  expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'44',status:'SUCCEEDED'});
  expect(String(vi.mocked(fetch).mock.calls.at(-1)![0])).toContain('/transfers?reference=');
 });
}
it('refuses USD fallback when available USD cannot cover payout plus fee, even with a large ledger balance',async()=>{
 vi.mocked(fetch).mockImplementation(async(url:any)=>{
  const parsed=new URL(url),amount=parsed.searchParams.get('amount');
  return Response.json({status:'success',data:parsed.pathname.endsWith('/rates')?{rate:1,source:{currency:'USD',amount},destination:{currency:'USDT',amount}}:parsed.pathname.endsWith('/fee')?[{currency:'USDT',fee_type:'value',fee:1.5,fee_amount_in_fiat_currency:0.07}]:[{currency:'USD',available_balance:6.75,ledger_balance:376.49},{currency:'USDC',available_balance:1234.56},{currency:'USDT',available_balance:0,ledger_balance:789.01}]});
 });
 await expect(prepareFlutterwaveWithdrawal(d('6.75'),{type:'crypto',asset:'USDT_SOLANA',address:'wallet',confirmed:true})).rejects.toThrow('insufficient provider funds');
 expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
});
it('does not select USD when stablecoin balance retrieval fails',async()=>{
 vi.mocked(fetch).mockImplementation(async(url:any)=>{
  const parsed=new URL(url),amount=parsed.searchParams.get('amount');
  return Response.json({status:'success',data:parsed.pathname.endsWith('/rates')?{rate:1,source:{currency:'USD',amount},destination:{currency:'USDT',amount}}:parsed.pathname.endsWith('/fee')?[{currency:'USDT',fee_type:'value',fee:1.5}]:{invalid:'balances'}});
 });
 await expect(prepareFlutterwaveWithdrawal(d('6.75'),{type:'crypto',asset:'USDT_SOLANA',address:'wallet',confirmed:true})).rejects.toThrow('Could not verify payout provider balance');
 expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('debit_currency=USD'))).toBe(false);
});
it('blocks stablecoin dispatch when fees increase after quoting',async()=>{
 const state={...flwRow(),stage:'PREPARED',receiveAmount:'6.75',providerData:{sourceRequired:'8.25',request:{currency:'USDT',debit_currency:'USDT',amount:8.25}}};
 vi.mocked(fetch).mockImplementation(async(url:any)=>Response.json({status:'success',data:String(url).includes('/transfers/fee')?[{currency:'USDT',fee_type:'value',fee:2}]:[{currency:'USDT',available_balance:789.01}]}));
 const save=vi.fn();await expect(runFlutterwaveWithdrawal(state,save)).rejects.toThrow('fees changed');expect(save).not.toHaveBeenCalled();
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
it('blocks a Flutterwave submission when authorization is revoked after the funding preflight',async()=>{
 vi.mocked(fetch).mockImplementation(async(url:any)=>Response.json({status:'success',data:String(url).endsWith('/balances')?[{currency:'NGN',available_balance:1000}]:[{currency:'NGN',fee_type:'value',fee:0}]}));
 const guard=vi.fn().mockRejectedValue(new Error('User restricted')),save=vi.fn();
 await expect(runFlutterwaveWithdrawal({...flwRow(),stage:'PREPARED',expiresAt:new Date(Date.now()+60000),providerData:{request:{currency:'NGN',debit_currency:'NGN',amount:'56.25'},sourceRequired:'60'}},save,guard)).rejects.toThrow('restricted');expect(guard).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();expect(vi.mocked(fetch).mock.calls.every(([,options])=>options!.method==='GET')).toBe(true);
});

it.each([200,422,502])('logs safe provider diagnostics without response bodies or headers for status %s',async status=>{
 const raw=status===502?'upstream bank account 0123456789 unavailable':JSON.stringify({id:'pd-1',account_number:'0123456789',account_name:'PRIVATE HOLDER',error_code:status===422?'VALIDATION_ERROR':undefined});
 const consoleLog=vi.spyOn(console,'info').mockImplementation(()=>{});
 vi.mocked(fetch).mockResolvedValueOnce(new Response(raw,{status,headers:{'x-request-id':'provider-request-1','x-provider-detail':'private-header-value'}}));
 if(status===200)await payoutRequest('BACHS','/payouts/destinations',{},'wd-test','acct-1');
 else await expect(payoutRequest('BACHS','/payouts/destinations',{},'wd-test','acct-1')).rejects.toBeInstanceOf(WithdrawalProviderError);
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'provider.response',httpStatus:status,providerRequestId:'provider-request-1',providerEndpoint:'/payouts/destinations',method:'POST',providerAccountId:'acct-1'}),expect.any(String));
 const logs=JSON.stringify([vi.mocked(logger.info).mock.calls,vi.mocked(logger.error).mock.calls]);
 expect(logs).not.toMatch(/0123456789|PRIVATE HOLDER|private-header-value|responseBody|bachs_withdrawal_response_raw/);
 expect(consoleLog).not.toHaveBeenCalled();
});
it('records network failures as uncertain and propagates them without logging provider messages',async()=>{
 const error=new Error('Private holder at bank account 0123456789');
 vi.mocked(fetch).mockRejectedValueOnce(error);
 await expect(payoutRequest('BACHS','/payouts',{},'wd-test')).rejects.toBe(error);
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'provider.request.failed',gateway:'BACHS',outcome:'provider_uncertain',durationMs:expect.any(Number)}),expect.any(String));
 expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain('0123456789');
});
it('keeps concurrent withdrawal diagnostic contexts isolated and drops unexpected payload fields',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await Promise.all([
  withdrawalStep('processing',{withdrawalId:'wd-first',userId:'first'},async()=>{await gate;withdrawalDiagnostic('first.check',{body:{account_number:'private-account'},email:'private@example.test'} as any);}),
  withdrawalStep('processing',{withdrawalId:'wd-second',userId:'second'},async()=>{withdrawalDiagnostic('second.check');release();}),
 ]);
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'first.check',withdrawalId:'wd-first',userId:'first'}),expect.any(String));
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({operation:'second.check',withdrawalId:'wd-second',userId:'second'}),expect.any(String));
 expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toMatch(/private-account|private@example/);
});

for(const native of [true,false])it(`records verified ${native?'native':'USD-funded'} provider fees with their actual currency`,async()=>{
 const state={...flwRow(),providerId:'42',stage:'PAYOUT_ACCEPTED',providerData:{request:{account_number:'wallet',account_bank:'BASE',amount:16.12,currency:'USDC',debit_currency:native?'USDC':'USD'}}};
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{id:42,reference:state.id,account_number:'wallet',bank_code:'BASE',amount:16.12,currency:'USDC',debit_currency:native?'USDC':'USD',status:'SUCCESSFUL',...(native?{fee:1.5}:{fee_amount_in_fiat_currency:0.12,fee:999})}}));
 const save=vi.fn(async(data:any)=>Object.assign(state,data));
 expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'42',status:'SUCCEEDED'});
 expect(state).toMatchObject({providerFee:native?'1.5':'0.12',providerFeeCurrency:native?'USDC':'USD',providerFeeIncludesConversion:!native,providerFeeSource:'PROVIDER',providerConversionFee:native?'0':null});
});
it('does not turn missing or malformed fee reports into actual zero fees',async()=>{
 for(const fee of [undefined,-1,'bad']) {
  const state={...flwRow(),providerId:'42',stage:'PAYOUT_ACCEPTED',providerData:{request:{...flwRow().providerData.request}}};
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{...response(),fee}}));
  const save=vi.fn();expect(await runFlutterwaveWithdrawal(state,save)).toEqual({id:'42',status:'SUCCEEDED'});expect(save).not.toHaveBeenCalled();
 }
 const state={...flwRow(),providerId:'42',stage:'PAYOUT_ACCEPTED',providerData:{request:{...flwRow().providerData.request,debit_currency:'USD'}}};
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({status:'success',data:{...response(),debit_currency:'USD',fee:1.5}}));
 const save=vi.fn();await runFlutterwaveWithdrawal(state,save);expect(save).toHaveBeenCalledWith(expect.objectContaining({providerFee:'1.5',providerFeeCurrency:'USD',providerFeeIncludesConversion:true}));
});
