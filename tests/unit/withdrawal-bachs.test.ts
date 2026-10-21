import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
const db=vi.hoisted(()=>({user:{findUniqueOrThrow:vi.fn()},withdrawalRecipient:{upsert:vi.fn(),update:vi.fn()}}));
vi.mock('@/db',()=>({default:db}));
import {prepareBachsWithdrawal,runBachsWithdrawal} from '@/services/v1/wallets/withdrawal-bachs';
const d=(s:number|string)=>new Prisma.Decimal(s),address='0x'+'a'.repeat(40);
let payoutFailed=false,recoveryLost=false;const requests:{path:string;body:any;key?:string;account?:string}[]=[];
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');requests.length=0;payoutFailed=false;recoveryLost=false;
 db.user.findUniqueOrThrow.mockResolvedValue({name:'Test User',email:'user@example.test',country:{iso2:'US'}});
 db.withdrawalRecipient.upsert.mockImplementation(async({create})=>({...create,providerId:'acct-1',createdAt:new Date()}));db.withdrawalRecipient.update.mockResolvedValue({});
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
  const path=new URL(url).pathname,body=options?.body?JSON.parse(options.body):undefined,key=options?.headers?.['Idempotency-Key'],account=options?.headers?.['X-Account-Id'];requests.push({path,body,key,account});
  if(path==='/v1/accounts/me')return Response.json({id:'platform',is_active:true,capabilities:null,enabled_capabilities:['payouts','transfers']});
  if(path==='/v1/accounts' && body)return Response.json({id:'acct-1'});
  if(path==='/v1/accounts/acct-1')return Response.json({id:'acct-1',capabilities:{transfers:{status:'active'},payouts:{status:'active'}}});
  if(path==='/v1/payouts/destinations')return Response.json({items:[{id:'pd-1',is_usable:true,currency:'USDC_BASE',wallet_address:address}]});
  if(path==='/v1/payouts/quotes')return Response.json({quote_id:'quote-'+body.amount,from_currency:'USD',to_currency:'USDC_BASE',from_amount:body.amount,to_amount:d(body.amount).sub(1).toFixed(2),exchange_rate:'1',expires_at:new Date(Date.now()+30000).toISOString()});
  if(path==='/v1/balances')return Response.json({balances:[{currency:'USD',available_balance:account?'75.00':'1000.00'}]});
  if(path==='/v1/transfers'){
   if(body.destination==='self' && recoveryLost){recoveryLost=false;throw new Error('Recovery accepted but response lost');}
   return Response.json({id:body.destination==='self'?'recover-1':'fund-1',source:account??'platform',destination:body.destination==='self'?'platform':body.destination,amount:body.amount,currency:body.currency,transfer_group:body.transfer_group,status:'paid'});
  }
  if(path.startsWith('/v1/payouts'))return Response.json({id:'payout-1',reference:'wd-1',destination:'pd-1',currency:'USDC_BASE',source_currency:'USD',amount:'56.25',fee:'1.00',total_debited:'57.25',status:payoutFailed?'failed':'completed'});
  throw new Error('Unexpected mocked endpoint '+path);
 });
});
it('onboards a recipient and grosses up the source quote without reducing the user payout',async()=>{
 const plan=await prepareBachsWithdrawal('user',d('56.25'),d(75),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1');
 expect(plan.data.platformId).toBe('platform');expect(plan.data.request).toEqual({destination:'pd-1',quote_id:'quote-57.25',reference:'wd-1'});
 expect(plan.receiveAmount).toBe('56.25');expect(plan.data.sourceAmount).toBe('57.25');expect(plan.data.fundingAmount).toBe('76.00');
 expect(requests.filter(r=>r.path.endsWith('/quotes')).map(r=>r.body.amount)).toEqual(['56.25','57.25']);
 const onboard=requests.find(r=>r.path==='/v1/accounts/acct-1'&&r.body)!;expect(onboard.body.fields.payout_destination).toEqual({type:'crypto_wallet',currency:'USDC_BASE',asset:'USDC_BASE',wallet_address:address});expect(onboard.body).not.toHaveProperty('balance_currencies');
 expect(requests.filter(r=>r.path.endsWith('/quotes')).every(r=>r.account==='acct-1')).toBe(true);expect(requests.some(r=>r.path==='/v1/transfers')).toBe(false);
});
it('requires active capabilities and a usable destination before any coin reservation',async()=>{
 vi.mocked(fetch).mockImplementation(async(url)=>Response.json(String(url).endsWith('/accounts/me')?{id:'platform',is_active:true,capabilities:null,enabled_capabilities:['payouts','transfers']}:{id:'acct-1',capabilities:{payouts:{status:'restricted'},transfers:{status:'active'}}}));
 await expect(prepareBachsWithdrawal('user',d(10),d(15),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1')).rejects.toThrow('approve your recipient');
});
it('creates a recipient once with a stable per-user account idempotency key',async()=>{
 db.withdrawalRecipient.upsert.mockImplementation(async({create})=>({...create,providerId:null,createdAt:new Date()}));
 await prepareBachsWithdrawal('user',d('56.25'),d(75),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1');
 expect(requests.find(r=>r.path==='/v1/accounts')?.body).toMatchObject({contact_email:'user@example.test',country:'US',configuration:{recipient:{capabilities:{transfers:{requested:true},payouts:{requested:true}}}}});expect(db.withdrawalRecipient.update).toHaveBeenCalledWith(expect.objectContaining({data:{providerId:'acct-1'}}));
});
function row(){return {id:'wd-1',userId:'user',gateway:'BACHS',currency:'USD',stage:'PREPARED',providerId:null,receiveAmount:'56.25',receiveCurrency:'USDC_BASE',createdAt:new Date(),expiresAt:new Date(Date.now()+30000),providerData:{platformId:'platform',accountId:'acct-1',destinationId:'pd-1',fundingAmount:'75.00',sourceAmount:'56.25',request:{destination:'pd-1',quote_id:'quote-1',reference:'wd-1'}}} as any;}
function saver(state:any){return async(data:any)=>{Object.assign(state,data);return {...state};};}
it('checks both available balances, funds the recipient, pays out and reclaims unused platform funding',async()=>{
 const state=row();expect(await runBachsWithdrawal(state,saver(state))).toEqual({id:'payout-1',status:'SUCCEEDED'});
 expect(requests.filter(r=>r.path==='/v1/balances').map(r=>r.account)).toEqual([undefined,'acct-1','acct-1']);
 const funding=requests.find(r=>r.key==='wd-1-fund')!;expect(funding.body).toEqual({destination:'acct-1',currency:'USD',amount:'75.00',transfer_group:'wd-1',description:'Kwonnet withdrawal funding'});
 const payout=requests.find(r=>r.path==='/v1/payouts')!;expect(payout.account).toBe('acct-1');expect(payout.body).not.toHaveProperty('amount');expect(payout.body).not.toHaveProperty('currency');
 expect(requests.find(r=>r.key==='wd-1-recover')?.body.amount).toBe('17.75');expect(state.providerData.recovered).toBe(true);
});
it('does not report definitive failure until funded money is recovered',async()=>{
 payoutFailed=true;const state=row();expect(await runBachsWithdrawal(state,saver(state))).toEqual({id:'payout-1',status:'FAILED'});
 expect(requests.find(r=>r.key==='wd-1-recover')?.body.amount).toBe('75.00');
});
it('keeps recovery amount and key identical when its response was lost',async()=>{
 const state=row();recoveryLost=true;await expect(runBachsWithdrawal(state,saver(state))).rejects.toThrow('response lost');expect(state.providerData.recoveryAmount).toBe('17.75');
 const before=requests.length;expect(await runBachsWithdrawal(state,saver(state))).toMatchObject({status:'SUCCEEDED'});
 const retries=requests.filter(r=>r.key==='wd-1-recover');expect(retries).toHaveLength(2);expect(retries[0].body).toEqual(retries[1].body);
 expect(requests.slice(before).some(r=>r.path==='/v1/balances')).toBe(false);
});
it('does not send an expired payout quote after its recipient was funded',async()=>{
 const state=row();state.stage='FUNDED';state.expiresAt=new Date(0);expect(await runBachsWithdrawal(state,saver(state))).toEqual({status:'FAILED'});expect(requests.some(r=>r.path==='/v1/payouts')).toBe(false);expect(requests.find(r=>r.key==='wd-1-recover')?.body.amount).toBe('75.00');
});
it('does not retry uncertain funding or recovery after the idempotency window',async()=>{
 const state=row();state.stage='FUNDING';state.createdAt=new Date(Date.now()-24*3600000);await expect(runBachsWithdrawal(state,saver(state))).rejects.toThrow('requires review');expect(requests).toHaveLength(0);
 state.stage='PAYOUT_ACCEPTED';state.providerId='payout-1';state.providerData.recoveryAmount='17.75';state.providerData.recoveryStartedAt=new Date(Date.now()-24*3600000).toISOString();await expect(runBachsWithdrawal(state,saver(state))).rejects.toThrow('requires review');expect(requests.some(r=>r.path==='/v1/transfers')).toBe(false);
});
it('uses NGN recipient onboarding and bank payouts without a conversion quote',async()=>{
 db.user.findUniqueOrThrow.mockResolvedValue({name:'Test User',email:'user@example.test',country:{iso2:'NG'}});
 const mock=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>{
  const path=new URL(url).pathname,body=options?.body?JSON.parse(options.body):undefined;
  if(path==='/v1/reference/banks')return Response.json({banks:[{code:'058',name:'Test bank'}]});
  if(path==='/v1/misc/bank-accounts/resolve')return Response.json({resolved:true,account_name:'TEST USER',account_number:'0123456789'});
  if(path==='/v1/payouts/destinations')return Response.json({items:[{id:'pd-ngn',currency:'NGN',bank_code:'058',account_number:'0123456789',account_name:'TEST USER',is_usable:true}]});
  if(path==='/v1/balances')return Response.json({balances:[{currency:'NGN',available_balance:'100000'}]});
  if(path.startsWith('/v1/payouts') && path!=='/v1/payouts/destinations')return Response.json({id:'payout-ngn',reference:'wd-ngn',destination:'pd-ngn',currency:'NGN',source_currency:'NGN',amount:'72000.00',fee:'100.00',total_debited:'72100.00',status:'completed'});
  return await mock(url,options);
 });
 const plan=await prepareBachsWithdrawal('user',d(72000),d(90000),{type:'bank',bankCode:'058',accountNumber:'0123456789'},'wd-ngn');
 expect(plan.receiveAmount).toBe('72000.00');expect(plan.data.request).toEqual({destination:'pd-ngn',amount:'72000.00',reference:'wd-ngn'});
 const onboarding=requests.find(r=>r.body?.fields)!;expect(onboarding.body.balance_currencies).toEqual({NGN:true});expect(onboarding.body.fields.payout_destination.account_name).toBe('TEST USER');
 const state={...row(),id:'wd-ngn',currency:'NGN',receiveAmount:plan.receiveAmount,receiveCurrency:'NGN',providerData:plan.data,expiresAt:plan.expiresAt};
 expect(await runBachsWithdrawal(state,saver(state))).toEqual({id:'payout-ngn',status:'SUCCEEDED'});
 expect(requests.find(r=>r.key==='wd-ngn-recover')!.body.amount).toBe('17900.00');expect(requests.some(r=>r.path.endsWith('/quotes'))).toBe(false);
});
it('rechecks restrictions immediately before funding and again before the recipient payout',async()=>{
 const state=row(),guard=vi.fn().mockRejectedValueOnce(new Error('Withdrawals paused'));
 await expect(runBachsWithdrawal(state,saver(state),guard)).rejects.toThrow('paused');expect(requests.some(r=>r.path==='/v1/transfers'||r.path==='/v1/payouts')).toBe(false);expect(state.stage).toBe('PREPARED');
 requests.length=0;guard.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('User restricted'));
 await expect(runBachsWithdrawal(state,saver(state),guard)).rejects.toThrow('restricted');expect(requests.some(r=>r.key==='wd-1-fund')).toBe(true);expect(requests.some(r=>r.path==='/v1/payouts')).toBe(false);expect(state.stage).toBe('FUNDED');
});

it('does not treat a missing platform capability projection as proof that Connect is disabled',async()=>{
 const mock=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>String(url).endsWith('/accounts/me')?Response.json({id:'platform',capabilities:null,enabled_capabilities:['payouts','transfers'],configuration:null}):await mock(url,options));
 const plan=await prepareBachsWithdrawal('user',d('56.25'),d(75),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1');
 expect(plan.data.platformId).toBe('platform');expect(plan.data.accountId).toBe('acct-1');expect(requests.some(r=>r.path==='/v1/payouts'||r.path==='/v1/transfers')).toBe(false);
});
it('still propagates an actual Bachs denial when creating a connected recipient',async()=>{
 db.withdrawalRecipient.upsert.mockImplementation(async({create})=>({...create,providerId:null,createdAt:new Date()}));
 const mock=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>new URL(url).pathname==='/v1/accounts'?Response.json({error_code:'FORBIDDEN',detail:'Connect permission required'},{status:403}):await mock(url,options));
 await expect(prepareBachsWithdrawal('user',d('56.25'),d(75),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1')).rejects.toMatchObject({providerStatus:403});
 expect(db.withdrawalRecipient.update).not.toHaveBeenCalled();expect(requests.some(r=>r.path==='/v1/transfers'||r.path==='/v1/payouts')).toBe(false);
});
it('continues to reject destinations which Bachs has not approved for payout',async()=>{
 const mock=vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async(url:any,options:any)=>new URL(url).pathname==='/v1/payouts/destinations'?Response.json({items:[{id:'pd-1',is_usable:false,currency:'USDC_BASE',wallet_address:address}]}):await mock(url,options));
 await expect(prepareBachsWithdrawal('user',d('56.25'),d(75),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1')).rejects.toThrow('not approved this destination');
 expect(requests.some(r=>r.path==='/v1/transfers'||r.path==='/v1/payouts')).toBe(false);
});

it.each([undefined,null,[],['transfers'],{payouts:true},'payouts'])(
 'blocks withdrawal preparation without an enabled payouts capability: %j',async enabled=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({id:'platform',capabilities:{connect:{status:'active'},payouts:{status:'active'}},enabled_capabilities:enabled}));
  await expect(prepareBachsWithdrawal('user',d(10),d(15),{type:'crypto',asset:'USDC_BASE',address,confirmed:true},'wd-1')).rejects.toThrow('Bachs payouts must be enabled');
  expect(db.user.findUniqueOrThrow).not.toHaveBeenCalled();expect(db.withdrawalRecipient.upsert).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1);
 });
