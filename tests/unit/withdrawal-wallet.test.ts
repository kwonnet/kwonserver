import {beforeEach,expect,it,vi} from 'vitest';
import {createHmac,createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import logger from '@/logger';
import * as security from '@/utils/auth-security';
import {TOTP,Secret} from 'otpauth';
const fixture=vi.hoisted(()=>({factor:null as any,row:null as any,other:null as any,user:null as any,wallet:null as any,rates:null as any,operation:vi.fn(),prepare:vi.fn(),run:vi.fn(),enqueue:vi.fn()}));
const db=vi.hoisted(()=>Object.fromEntries(['userTwoFactor','user','wallet','chargeRate','coinWithdrawal','transaction','authEmailToken','emailMessage','withdrawalAdminEvent'].map(model=>[model,Object.fromEntries(['findUnique','findUniqueOrThrow','findFirst','findMany','create','update','updateMany','count','groupBy'].map(method=>[method,vi.fn()]))])) as any);
vi.mock('@/services/email',()=>({enqueueEmailMessage:fixture.enqueue}));
vi.mock('@/db',()=>({default:db}));
vi.mock('@/services/walletLedger',async original=>({...await original<any>(),walletOperation:fixture.operation}));
vi.mock('@/services/v1/wallets/withdrawal-flutterwave',()=>({prepareFlutterwaveWithdrawal:fixture.prepare,runFlutterwaveWithdrawal:fixture.run}));
vi.mock('@/services/v1/wallets/withdrawal-bachs',()=>({prepareBachsWithdrawal:fixture.prepare,runBachsWithdrawal:fixture.run}));
import {WalletError} from '@/services/walletLedger';
import {WithdrawalProviderError} from '@/services/v1/wallets/withdrawal-provider';
import {withdrawalSettings,quoteCoinWithdrawal,confirmCoinWithdrawal,processCoinWithdrawal,listCoinWithdrawals,reconcileCoinWithdrawals,requestWithdrawalOtp,withdrawalOtpHash,getWithdrawalAdminPolicy,updateWithdrawalAdminPolicy,restrictUserWithdrawal,listWithdrawalAdminQueue,getWithdrawalAdminDetails,decideWithdrawal,withdrawalConversion} from '@/services/v1/wallets';
const d=(n:number|string)=>new Prisma.Decimal(n),crypto={type:'crypto' as const,asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true as const};
function makeRow(){return {authorizationAttempts:0,authorizationMethod:null,authorizationFactorVersion:null,authorizationCodeHash:null,id:'withdraw-fixture',userId:'user',gateway:'FLUTTERWAVE',environment:'flutterwave:test',country:'USA',coins:d(5000),rate:d('.015'),fee:d('.25'),minimum:d(10),amount:d('56.25'),currency:'USD',destination:crypto,providerData:{request:{},sourceRequired:'60'},receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),status:'QUOTED',stage:'PREPARED',providerId:null,createdAt:new Date(),completedAt:null,reviewRequiredAt:null,processingAttempts:0,processingUntil:null,otpVerifiedAt:new Date(),otpChallengeId:'11111111-1111-4111-8111-111111111111'};}
function apply(data:any){for(const [key,value]of Object.entries(data))fixture.row[key]=value&&typeof value==='object'&&'increment'in value?fixture.row[key]+(value as any).increment:value;return {...fixture.row};}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','test-withdrawal-secret-at-least-32-characters');
 db.$transaction=vi.fn(async(work)=>await work({...db}));db.$queryRaw=vi.fn(async()=>[]);
 db.authEmailToken.findUnique.mockImplementation(async()=>({id:fixture.row.otpChallengeId,userId:'user',purpose:'WITHDRAWAL_OTP',subjectId:fixture.row.id,recipientHash:createHash('sha256').update('user@example.test').digest('hex'),tokenHash:createHmac('sha256',process.env.AUTH_EMAIL_TOKEN_SECRET!).update(JSON.stringify([fixture.row.id,fixture.row.otpChallengeId,'user@example.test','123456'])).digest('hex'),usedAt:new Date(),attempts:0,createdAt:new Date(),expiresAt:new Date(Date.now()+60000)}));
 db.chargeRate.findUniqueOrThrow.mockImplementation(async()=>fixture.rates);
 fixture.factor=null;db.userTwoFactor.findUnique.mockImplementation(async()=>fixture.factor);db.userTwoFactor.update.mockImplementation(async({data}:any)=>Object.assign(fixture.factor,data));
 vi.spyOn(security,'consumeAuthRateLimit').mockResolvedValue({allowed:true,retryAfter:1});
 fixture.row=makeRow();fixture.other=null;fixture.wallet={id:'wallet',userId:'user',coins:d(10000),bonus:d(100),credit:d(100),isLocked:false};fixture.user={id:'user',email:'user@example.test',emailVerifiedAt:new Date(),name:'Test User',country:{iso3:'USA',iso2:'US'},wallet:fixture.wallet};fixture.rates={withdrawalsEnabled:true,maxWithdrawal:d(5000),maxNgnWithdrawal:d(5000000),reviewWithdrawal:d(2500),reviewNgnWithdrawal:d(2500000),price:d('.015'),ngnPrice:d(18),fee:d('.25'),ngnFee:d('.2'),minWithdrawal:d(10),minNgnWithdrawal:d(1000)};
 db.user.findUnique.mockImplementation(async({where}:any)=>where.id==='admin'?{id:'admin',role:'ADMIN',status:'ACTIVE'}:fixture.user);db.user.findUniqueOrThrow.mockImplementation(async()=>fixture.user);db.chargeRate.findUnique.mockImplementation(async()=>fixture.rates);
 db.wallet.findUniqueOrThrow.mockImplementation(async()=>fixture.wallet);db.wallet.update.mockImplementation(async({data}:any)=>{if(data.coins?.increment)fixture.wallet.coins=fixture.wallet.coins.add(data.coins.increment);if(data.coins?.decrement)fixture.wallet.coins=fixture.wallet.coins.sub(data.coins.decrement);return fixture.wallet;});
 db.coinWithdrawal.findFirst.mockImplementation(async({where}:any)=>where.id&&typeof where.id==='string'?fixture.row&&where.id===fixture.row.id&&(!where.userId||where.userId===fixture.row.userId)?{...fixture.row}:null:fixture.other);
 db.coinWithdrawal.findUniqueOrThrow.mockImplementation(async()=>({...fixture.row}));db.coinWithdrawal.findMany.mockImplementation(async()=>fixture.row?[{...fixture.row}]:[]);
 db.coinWithdrawal.create.mockImplementation(async({data}:any)=>{fixture.row={...makeRow(),...data};return {...fixture.row};});db.coinWithdrawal.update.mockImplementation(async({data}:any)=>apply(data));db.coinWithdrawal.updateMany.mockImplementation(async({data}:any)=>{apply(data);return {count:1};});
 db.coinWithdrawal.findUnique.mockImplementation(async()=>({...fixture.row,user:fixture.user}));db.authEmailToken.findFirst.mockResolvedValue(null);db.authEmailToken.count.mockResolvedValue(0);db.emailMessage.create.mockResolvedValue({id:'email'});db.transaction.findMany.mockResolvedValue([]);db.transaction.groupBy.mockResolvedValue([]);db.withdrawalAdminEvent.findMany.mockResolvedValue([]);db.chargeRate.update.mockImplementation(async({data}:any)=>({...fixture.rates,...Object.fromEntries(Object.entries(data).map(([k,v])=>[k,k==='withdrawalsEnabled'?v:d(v as number)]))}));
 db.transaction.create.mockResolvedValue({});db.transaction.updateMany.mockResolvedValue({count:1});fixture.operation.mockImplementation(async(_scope,_key,_payload,_ids,work)=>await work({...db}));
 fixture.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),data:{request:{},sourceRequired:'60'}});fixture.run.mockResolvedValue({status:'PROCESSING'});
});
const quote=()=>quoteCoinWithdrawal('user',{coins:5000,gateway:'FLUTTERWAVE',destination:crypto});
const confirm=()=>confirmCoinWithdrawal('user','withdraw-fixture','withdraw-test-key',{challengeId:'11111111-1111-4111-8111-111111111111',code:'123456'});
it('returns regional settings and provider availability',async()=>{
 expect(await withdrawalSettings('user')).toMatchObject({currency:'USD',rate:'0.015',exchangeFeePercent:25,minimum:10});
 fixture.user.country.iso3='NGA';expect(await withdrawalSettings('user')).toMatchObject({currency:'NGN',rate:'18',exchangeFeePercent:20,minimum:1000});
 vi.stubEnv('FLUTTERWAVE_SECK','');vi.stubEnv('BACHS_API_KEY','');expect((await withdrawalSettings('user')).providers.every(p=>!p.enabled)).toBe(true);
});
for(const gateway of ['BACHS','FLUTTERWAVE'] as const)for(const country of ['USA','NGA'])it(`enforces the configured USD 10 minimum for ${country} crypto through ${gateway}`,async()=>{
 fixture.user.country.iso3=country;
 await expect(quoteCoinWithdrawal('user',{coins:800,gateway,destination:crypto})).rejects.toThrow('Minimum withdrawal after exchange fee is USD 10.00');
 expect(fixture.prepare).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();
});
it('requires country and exchange settings',async()=>{fixture.user=null;await expect(withdrawalSettings('user')).rejects.toThrow('country');fixture.user={country:{iso3:'USA'}};fixture.rates=null;await expect(withdrawalSettings('user')).rejects.toThrow('rates');});
it('quotes without debiting and protects persisted provider data from the API response',async()=>{
 const q=await quote();expect(q).toMatchObject({amount:56.25,coins:5000,destination:{type:'crypto',address:crypto.address}});expect(q).not.toHaveProperty('providerData');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('dispatches Bachs quotes and resolves the bank holder server-side',async()=>{
 fixture.user.country.iso3='NGA';fixture.prepare.mockResolvedValue({receiveAmount:'72000',receiveCurrency:'NGN',expiresAt:new Date(Date.now()+60000),data:{accountName:'TEST USER',request:{},sourceRequired:'72100'}});
 expect(await quoteCoinWithdrawal('user',{coins:5000,gateway:'BACHS',destination:{type:'bank',bankCode:'058',accountNumber:'0123456789'}})).toMatchObject({currency:'NGN',destination:{accountName:'TEST USER',accountEnding:'6789'}});
 expect(fixture.prepare.mock.calls[0][0]).toBe('user');
});
it('prevents invalid, locked, underfunded and overlapping quotes',async()=>{
 fixture.user=null;await expect(quote()).rejects.toThrow('country');fixture.user={email:'user@example.test',emailVerifiedAt:new Date(),country:{iso3:'USA'},wallet:null};await expect(quote()).rejects.toThrow('wallet');fixture.user.wallet=fixture.wallet;
 fixture.wallet.isLocked=true;await expect(quote()).rejects.toThrow('locked');fixture.wallet.isLocked=false;
 await expect(quoteCoinWithdrawal('user',{coins:5000,gateway:'UNKNOWN' as any,destination:crypto})).rejects.toThrow('Unsupported');
 fixture.rates=null;await expect(quote()).rejects.toThrow('rates');fixture.rates={price:d('.015'),fee:d('.25'),minWithdrawal:d(10)};fixture.wallet.coins=d(1);await expect(quote()).rejects.toThrow('Insufficient');fixture.wallet.coins=d(10000);fixture.other={};await expect(quote()).rejects.toThrow('in progress');
 expect(fixture.prepare).not.toHaveBeenCalled();
});
it('rejects a provider funding preflight before reserving',async()=>{fixture.prepare.mockRejectedValue(new WalletError('insufficient provider funds',503));await expect(quote()).rejects.toThrow('funds');expect(db.coinWithdrawal.create).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();});
it('confirms using the saved quote and reserves only coins',async()=>{
 const result=await confirm();expect(result.status).toBe('PROCESSING');expect(fixture.wallet.coins.toNumber()).toBe(5000);expect(fixture.wallet.bonus.toNumber()).toBe(100);expect(db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:'DEBIT',amount:d(5000),category:'COIN_WITHDRAWAL'})}));
});
it('does not reserve an already-confirmed or terminal quote again',async()=>{
 for(const status of ['RESERVED','SUCCEEDED','FAILED']){fixture.row.status=status;await confirm();}
 expect(db.wallet.update).not.toHaveBeenCalled();fixture.row.status='OTHER';await expect(confirm()).rejects.toThrow('cannot be confirmed');
});
it('rejects confirmation without ownership, an idempotency key or matching environment',async()=>{
 await expect(confirmCoinWithdrawal('other','withdraw-fixture','withdraw-test-key')).rejects.toThrow('not found');await expect(confirmCoinWithdrawal('user','withdraw-fixture',undefined as any)).rejects.toThrow('required');fixture.row.environment='flutterwave:live';await expect(confirm()).rejects.toThrow('environment');
});
it('rejects expired quotes and changed country, exchange rate, fee or minimum',async()=>{
 fixture.row.expiresAt=new Date(0);await expect(confirm()).rejects.toThrow('expired');fixture.row.expiresAt=new Date(Date.now()+60000);
 fixture.user.country.iso3='NGA';await expect(confirm()).rejects.toThrow('settings changed');fixture.user.country.iso3='USA';
 const base={...fixture.rates};for(const delta of [{price:d('.016')},{fee:d('.2')},{minWithdrawal:d(6)}]){fixture.rates={...base,...delta};await expect(confirm()).rejects.toThrow('rates changed');}
 fixture.rates=null;await expect(confirm()).rejects.toThrow('settings changed');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('checks wallet locks, competing withdrawals and spendable balance again at confirmation',async()=>{
 fixture.wallet.isLocked=true;await expect(confirm()).rejects.toThrow('locked');fixture.wallet.isLocked=false;fixture.wallet.coins=d(4999);await expect(confirm()).rejects.toThrow('Insufficient');fixture.wallet.coins=d(10000);fixture.other={};await expect(confirm()).rejects.toThrow('in progress');expect(fixture.run).not.toHaveBeenCalled();
});
it('does not process an unknown or completed withdrawal or take an occupied lease',async()=>{
 await expect(processCoinWithdrawal('missing','user')).rejects.toThrow('not found');fixture.row.status='SUCCEEDED';await processCoinWithdrawal(fixture.row.id,'user');expect(fixture.run).not.toHaveBeenCalled();fixture.row.status='RESERVED';fixture.row.environment='flutterwave:live';await expect(processCoinWithdrawal(fixture.row.id)).rejects.toThrow('environment');fixture.row.environment='flutterwave:test';db.coinWithdrawal.updateMany.mockResolvedValueOnce({count:0});await processCoinWithdrawal(fixture.row.id);expect(fixture.run).not.toHaveBeenCalled();
});
it('polls Bachs through its own adapter and completes a delivered payout without coin restoration',async()=>{
 fixture.row.status='RESERVED';fixture.row.gateway='BACHS';fixture.row.environment='https://sandbox-api.bachs.io';fixture.run.mockResolvedValue({status:'SUCCEEDED'});expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'SUCCEEDED'});expect(db.wallet.update).not.toHaveBeenCalled();expect(db.transaction.updateMany).toHaveBeenCalled();
});
it('restores the exact reservation on verified failure',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockResolvedValue({status:'FAILED'});await processCoinWithdrawal(fixture.row.id);expect(db.wallet.update).toHaveBeenCalledWith({where:{userId:'user'},data:{coins:{increment:d(5000)}}});expect(db.transaction.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:'CREDIT',description:'Withdrawal failed — coins restored'})}));
});
it('saves provider progress under the current lease and preserves pending state',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockImplementation(async(_row,save)=>{await save({stage:'PAYOUT_ACCEPTED',providerId:'payout-fixture'});return {status:'PROCESSING'};});expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'PROCESSING'});expect(fixture.row.providerId).toBe('payout-fixture');expect(fixture.row.processingUntil).toBeNull();
});
it('escalates overdue pending jobs without cancelling or restoring',async()=>{
 fixture.row.status='RESERVED';fixture.row.createdAt=new Date(Date.now()-25*3600000);expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'REVIEW'});await processCoinWithdrawal(fixture.row.id);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('restores safely on a preflight error but keeps a lost payout response reserved',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockRejectedValue(new WalletError('No provider funds',503));expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'FAILED'});
 fixture.row=makeRow();fixture.row.status='RESERVED';fixture.run.mockImplementation(async(_row,save)=>{await save({stage:'PAYOUT_SUBMITTING'});throw new Error('Lost payout response');});expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'RESERVED'});
});
it('only releases an authoritative first submission rejection, never a later authentication failure',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockImplementation(async(_row,save)=>{await save({stage:'PAYOUT_SUBMITTING'});throw new WithdrawalProviderError(true,422);});expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'FAILED'});
 fixture.row=makeRow();fixture.row.status='PROCESSING';fixture.row.stage='FUNDING';fixture.row.gateway='BACHS';fixture.row.environment='https://sandbox-api.bachs.io';fixture.run.mockRejectedValue(new WithdrawalProviderError(true,401));expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'PROCESSING'});
});
it('escalates unmatched or old unknown outcomes and does not restore',async()=>{
 fixture.row.status='RESERVED';fixture.row.stage='PAYOUT_ACCEPTED';fixture.run.mockRejectedValue(new WalletError('Response mismatch',409));expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'REVIEW'});
 fixture.row.reviewRequiredAt=null;fixture.row.createdAt=new Date(Date.now()-25*3600000);fixture.run.mockRejectedValue(new Error('Unavailable'));expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'REVIEW'});expect(db.wallet.update).not.toHaveBeenCalled();
});
it.each(['manual','scheduled'])('clears an accepted reviewed withdrawal through %s reconciliation without deducting coins again',async(mode)=>{
 fixture.row.status='REVIEW';fixture.row.stage='PAYOUT_ACCEPTED';fixture.row.providerId='2247362';fixture.row.expiresAt=new Date(0);fixture.row.reviewRequiredAt=new Date();
 fixture.wallet.coins=d(5000);fixture.run.mockResolvedValue({id:'2247362',status:'SUCCEEDED'});
 if(mode==='manual')expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'SUCCEEDED'});
 else {await reconcileCoinWithdrawals();expect(fixture.row.status).toBe('SUCCEEDED');}
 expect(fixture.run).toHaveBeenCalledWith(expect.objectContaining({providerId:'2247362',stage:'PAYOUT_ACCEPTED'}),expect.any(Function),expect.any(Function));
 expect(fixture.wallet.coins.toString()).toBe('5000');expect(db.wallet.update).not.toHaveBeenCalled();
 fixture.run.mockClear();expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'SUCCEEDED'});expect(fixture.run).not.toHaveBeenCalled();
});
it('retains a transfer ID saved before a response mismatch and leaves coins reserved for review',async()=>{
 fixture.row.status='RESERVED';fixture.row.stage='PAYOUT_SUBMITTING';fixture.wallet.coins=d(5000);
 fixture.run.mockImplementation(async(_row,save)=>{await save({providerId:'42',stage:'PAYOUT_ACCEPTED'});throw new WalletError('Payout response does not match this withdrawal',409);});
 expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'REVIEW'});
 expect(fixture.row.providerId).toBe('42');expect(fixture.row.stage).toBe('PAYOUT_ACCEPTED');
 expect(fixture.wallet.coins.toString()).toBe('5000');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('does not act on a lease lost after an external request',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockImplementation(async()=>{fixture.row.processingAttempts++;throw new Error('Lease lost');});await processCoinWithdrawal(fixture.row.id);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('enforces the lease on progress writes and terminal settlement',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockImplementation(async(_row,save)=>{db.coinWithdrawal.updateMany.mockResolvedValueOnce({count:0});await save({stage:'PAYOUT_SUBMITTING'});return {status:'PROCESSING'};});await processCoinWithdrawal(fixture.row.id);
 db.transaction.updateMany.mockClear();fixture.row=makeRow();fixture.row.status='RESERVED';fixture.run.mockImplementation(async()=>{fixture.row.processingUntil=new Date(0);return {status:'SUCCEEDED'};});await processCoinWithdrawal(fixture.row.id);expect(db.transaction.updateMany).not.toHaveBeenCalled();
});
it('returns terminal settlement already saved without another credit',async()=>{
 fixture.row.status='RESERVED';fixture.run.mockImplementation(async()=>{fixture.row.status='SUCCEEDED';return {status:'SUCCEEDED'};});await processCoinWithdrawal(fixture.row.id);expect(db.wallet.update).not.toHaveBeenCalled();
});
it('lists only the authenticated user and reconciles fairly after an error',async()=>{
 expect(await listCoinWithdrawals('user')).toHaveLength(1);expect(db.coinWithdrawal.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user',status:{not:'QUOTED'}}}));
 fixture.row.status='RESERVED';fixture.row.environment='flutterwave:live';await reconcileCoinWithdrawals();expect(db.coinWithdrawal.update).toHaveBeenCalledWith(expect.objectContaining({data:{updatedAt:expect.any(Date)}}));
 fixture.row.environment='flutterwave:test';await reconcileCoinWithdrawals();expect(fixture.run).toHaveBeenCalled();
});

it('enforces verified email, platform and individual restrictions before quoting',async()=>{
 for(const change of [()=>fixture.user.emailVerifiedAt=null,()=>fixture.rates.withdrawalsEnabled=false,()=>fixture.user.withdrawalRestricted=true]){
  fixture.user.emailVerifiedAt=new Date();fixture.rates.withdrawalsEnabled=true;fixture.user.withdrawalRestricted=false;change();
  expect((await withdrawalSettings('user')).canWithdraw).toBe(false);await expect(quote()).rejects.toMatchObject({status:403});
 }
 expect(fixture.prepare).not.toHaveBeenCalled();
});
it('enforces net payout maxima in both regions and invalid configured limits',()=>{
 expect(withdrawalConversion(5000,fixture.rates,false).amount.toNumber()).toBe(56.25);
 expect(withdrawalConversion(444444.44,fixture.rates,false).amount.lte(5000)).toBe(true);
 expect(()=>withdrawalConversion(444446,fixture.rates,false)).toThrow('Maximum');
 expect(()=>withdrawalConversion(347223,fixture.rates,true)).toThrow('Maximum');
 fixture.rates.maxWithdrawal=d(1);expect(()=>withdrawalConversion(5000,fixture.rates,false)).toThrow('limits');fixture.rates.maxWithdrawal=d(Infinity);expect(()=>withdrawalConversion(5000,fixture.rates,false)).toThrow('limits');
});
it('queues an encrypted intent-bound OTP without exposing the code, retaining the outbox on enqueue failure',async()=>{
 fixture.row.otpVerifiedAt=null;fixture.enqueue.mockRejectedValueOnce(new Error('queue offline'));
 const result=await requestWithdrawalOtp('user',fixture.row.id);expect(result.message).toBe('A withdrawal code is sent to your registered email.');expect(result).not.toHaveProperty('code');expect(result).not.toHaveProperty('messageId');
 const data=db.authEmailToken.create.mock.calls[0][0].data;const {decryptEmailToken}=await import('@/utils/auth-security');const code=decryptEmailToken(data.encryptedToken);
 expect(code).toMatch(/^\d{6}$/);expect(data.tokenHash).toBe(withdrawalOtpHash(fixture.row.id,data.id,fixture.user.email,code));expect(data.encryptedToken).not.toBe(code);
 expect(db.authEmailToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user',purpose:'WITHDRAWAL_OTP',usedAt:null}}));
 expect(db.emailMessage.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({withdrawalId:fixture.row.id,actionTokenId:data.id})}));
 await expect(requestWithdrawalOtp('user',fixture.row.id)).resolves.toHaveProperty('challengeId');
});
it('blocks stale, confirmed, unauthorized and rate-limited OTP requests',async()=>{
 fixture.row.otpVerifiedAt=null;fixture.row.expiresAt=new Date(0);await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toThrow('expired');fixture.row.expiresAt=new Date(Date.now()+60000);
 fixture.row.status='RESERVED';await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toThrow('unconfirmed');fixture.row.status='QUOTED';fixture.row.otpVerifiedAt=new Date();await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toThrow('unconfirmed');fixture.row.otpVerifiedAt=null;
 await expect(requestWithdrawalOtp('other',fixture.row.id)).rejects.toThrow('unconfirmed');
 fixture.rates=null;await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toThrow('settings');fixture.rates={withdrawalsEnabled:true};
 db.authEmailToken.findFirst.mockResolvedValueOnce({});await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toMatchObject({status:429});db.authEmailToken.count.mockResolvedValueOnce(5);await expect(requestWithdrawalOtp('user',fixture.row.id)).rejects.toMatchObject({status:429});
 vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','');expect(()=>withdrawalOtpHash('id','challenge','email','123456')).toThrow('configured');vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','short');expect(()=>withdrawalOtpHash('id','challenge','email','123456')).toThrow('configured');
});
it('rejects missing, malformed and cross-intent codes before reserving',async()=>{
 for(const otp of [undefined,{challengeId:fixture.row.otpChallengeId,code:'x'},{challengeId:'other',code:'123456'}])await expect(confirmCoinWithdrawal('user',fixture.row.id,'withdraw-test-key',otp)).rejects.toThrow('code');
 const original=db.authEmailToken.findUnique.getMockImplementation()!;
 for(const override of [null,{userId:'other'},{purpose:'VERIFY_EMAIL'},{subjectId:'other'},{recipientHash:'other'},{attempts:5},{createdAt:new Date(0)}]){
  fixture.user.passwordChangedAt=new Date(1000);db.authEmailToken.findUnique.mockImplementationOnce(async()=>override===null?null:{...await original(),...override});await expect(confirm()).rejects.toThrow('code');
 }
 fixture.rates=null;await expect(confirm()).rejects.toThrow('settings');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('commits guess counters, consumes a valid unused OTP once and disallows consumed codes without proof',async()=>{
 const original=db.authEmailToken.findUnique.getMockImplementation()!;
 db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),usedAt:null,tokenHash:'00'}));await expect(confirm()).rejects.toThrow('code');expect(db.authEmailToken.update).toHaveBeenCalledWith(expect.objectContaining({data:{attempts:{increment:1}}}));
 db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),usedAt:null,expiresAt:new Date(0)}));await expect(confirm()).rejects.toThrow('code');
 fixture.row.otpVerifiedAt=null;await expect(confirm()).rejects.toThrow('code');
 db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),usedAt:null}));expect(await confirm()).toMatchObject({status:'PROCESSING'});expect(db.authEmailToken.update).toHaveBeenCalledWith(expect.objectContaining({data:{usedAt:expect.any(Date)}}));expect(fixture.row.otpVerifiedAt).toBeInstanceOf(Date);
});
it('holds large confirmed withdrawals for approval without submitting payout',async()=>{
 fixture.row.coins=d(222223);fixture.row.amount=d('2500.00');fixture.wallet.coins=d(300000);fixture.rates.price=d('2500').div(222223).div('.75');fixture.row.rate=fixture.rates.price;
 expect(await confirm()).toMatchObject({status:'AWAITING_APPROVAL',approvalRequired:true});expect(fixture.run).not.toHaveBeenCalled();
});
it('blocks dispatch when policies, credentials, country, limits or approval change after confirmation',async()=>{
 const original=db.authEmailToken.findUnique.getMockImplementation()!;
 for(const change of [()=>fixture.rates.withdrawalsEnabled=false,()=>fixture.user.withdrawalRestricted=true,()=>fixture.user.emailVerifiedAt=null,()=>fixture.row.otpVerifiedAt=null,()=>fixture.row.otpChallengeId=null,()=>db.authEmailToken.findUnique.mockResolvedValueOnce(null),()=>db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),usedAt:null})),()=>db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),subjectId:'other'})),()=>db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),userId:'other'})),()=>db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),purpose:'other'})),()=>db.authEmailToken.findUnique.mockImplementationOnce(async()=>({...await original(),recipientHash:'other'})),()=>fixture.user.passwordChangedAt=new Date(Date.now()+1000),()=>fixture.user.country.iso3='NGA',()=>fixture.rates.maxWithdrawal=d(50),()=>fixture.row.approvalRequired=true,()=>fixture.rates.reviewWithdrawal=d(50)]){
  fixture.row=makeRow();fixture.row.status='RESERVED';fixture.user.emailVerifiedAt=new Date();fixture.user.withdrawalRestricted=false;fixture.user.passwordChangedAt=null;fixture.user.country.iso3='USA';fixture.rates.withdrawalsEnabled=true;fixture.rates.maxWithdrawal=d(5000);fixture.rates.reviewWithdrawal=d(2500);change();
  expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'BLOCKED'});
 }
 expect(fixture.run).not.toHaveBeenCalled();expect(db.wallet.update).not.toHaveBeenCalled();
});
it('refreshes expired provider quotes while preserving the authorized payout and canonical reference',async()=>{
 fixture.row.status='RESERVED';fixture.row.providerData.quoteExpiresAt=new Date(0).toISOString();fixture.prepare.mockResolvedValue({receiveAmount:'55.5',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+30000),data:{request:{reference:'temporary'},sourceRequired:'60'}});
 fixture.run.mockImplementation(async(row,save,guard)=>{expect(row.expiresAt.getTime()).toBeLessThan(Date.now()+40000);const saved=await save({stage:'PAYOUT_SUBMITTING'});expect(saved.expiresAt).toEqual(row.expiresAt);await guard();expect(row.providerData.request.reference).toBe(row.id);return {status:'PROCESSING'};});
 await processCoinWithdrawal(fixture.row.id);expect(fixture.row.receiveAmount).toBe('55.5');expect(fixture.prepare).toHaveBeenCalledWith(d('56.25'),crypto);
 fixture.row=makeRow();fixture.row.gateway='BACHS';fixture.row.environment='https://sandbox-api.bachs.io';fixture.row.status='RESERVED';fixture.row.providerData.quoteExpiresAt=new Date(0).toISOString();await processCoinWithdrawal(fixture.row.id);expect(fixture.prepare).toHaveBeenLastCalledWith('user',d('56.25'),d(75),crypto,expect.stringContaining('preflight'));
});
it('does not submit if a re-resolved bank holder changes',async()=>{
 fixture.row.status='RESERVED';fixture.row.country='NGA';fixture.user.country.iso3='NGA';fixture.row.destination={type:'bank',accountNumber:'0123456789',accountName:'ORIGINAL',bankCode:'058'};fixture.row.providerData.quoteExpiresAt=new Date(0).toISOString();fixture.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'NGN',expiresAt:new Date(Date.now()+30000),data:{request:{beneficiary_name:'OTHER'}}});
 expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'FAILED'});expect(fixture.run).not.toHaveBeenCalled();
});
it('paginates withdrawal lists and validates page boundaries',async()=>{
 for(const page of [0,-1,1.5])await expect(listCoinWithdrawals('user',page)).rejects.toThrow('page');
 db.coinWithdrawal.findMany.mockResolvedValueOnce(Array.from({length:21},()=>makeRow()));expect(await listCoinWithdrawals('user',1)).toMatchObject({nextPage:2});expect(await listCoinWithdrawals('user',2)).toMatchObject({nextPage:null});
});
it('requires current active administrator access for policy changes',async()=>{
 for(const actor of [null,{role:'USER',status:'ACTIVE'},{role:'ADMIN',status:'BANNED'},{role:'ADMIN',status:'ACTIVE',deletedAt:new Date()},{role:'SUPER',status:'PRIVATE',deactivatedAt:new Date()}]){db.user.findUnique.mockResolvedValueOnce(actor);await expect(getWithdrawalAdminPolicy('admin')).rejects.toMatchObject({status:403});}
 expect(await getWithdrawalAdminPolicy('admin')).toMatchObject({maxWithdrawal:5000,maxNgnWithdrawal:5000000});
 const input={withdrawalsEnabled:false,maxWithdrawal:4000,maxNgnWithdrawal:4000000,reviewWithdrawal:2000,reviewNgnWithdrawal:2000000};expect(await updateWithdrawalAdminPolicy('admin',input)).toMatchObject(input);expect(db.withdrawalAdminEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'POLICY_UPDATED'})}));
 for(const delta of [{maxWithdrawal:1},{reviewWithdrawal:5000},{reviewWithdrawal:1},{maxNgnWithdrawal:1},{reviewNgnWithdrawal:5000000},{reviewNgnWithdrawal:1}])await expect(updateWithdrawalAdminPolicy('admin',{...input,...delta})).rejects.toThrow('threshold');
});
it('audits individual restrictions and removal and validates target/reason',async()=>{
 await expect(restrictUserWithdrawal('admin','user',true,'x')).rejects.toThrow('reason');await expect(restrictUserWithdrawal('admin','user',true,'x'.repeat(501))).rejects.toThrow('reason');db.user.findUnique.mockResolvedValueOnce({role:'ADMIN',status:'ACTIVE'}).mockResolvedValueOnce(null);await expect(restrictUserWithdrawal('admin','missing',true,'fraud')).rejects.toThrow('not found');
 expect(await restrictUserWithdrawal('admin','user',true,'review earnings')).toEqual({userId:'user',restricted:true});expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({data:{withdrawalRestricted:true,withdrawalRestrictionReason:'review earnings'}}));
 await restrictUserWithdrawal('admin','user',false,'resolved');expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({data:{withdrawalRestricted:false,withdrawalRestrictionReason:null}}));
});
it('provides a paged admin queue and safe history, earnings and audit details',async()=>{
 for(const [page,status]of [[0,'AWAITING_APPROVAL'],[1.5,'BLOCKED'],[1,'UNKNOWN']]as const)await expect(listWithdrawalAdminQueue('admin',page,status)).rejects.toThrow('filter');
 db.coinWithdrawal.findMany.mockResolvedValueOnce(Array.from({length:21},()=>({...makeRow(),user:fixture.user})));expect(await listWithdrawalAdminQueue('admin')).toMatchObject({nextPage:2});expect(await listWithdrawalAdminQueue('admin',2,'BLOCKED')).toMatchObject({nextPage:null});
 await expect(getWithdrawalAdminDetails('admin',fixture.row.id,0)).rejects.toThrow('page');db.coinWithdrawal.findUnique.mockResolvedValueOnce(null);await expect(getWithdrawalAdminDetails('admin','missing')).rejects.toThrow('not found');
 fixture.row.status='AWAITING_APPROVAL';fixture.row.processingUntil=new Date(0);db.transaction.findMany.mockResolvedValueOnce(Array.from({length:51},()=>({amount:d(10)})));db.transaction.groupBy.mockResolvedValueOnce([{_sum:{amount:d(100)}},{_sum:{amount:null}}]);
 const details=await getWithdrawalAdminDetails('admin',fixture.row.id);expect(details).toMatchObject({canDecide:true,nextHistoryPage:2,user:{wallet:{coins:10000,bonus:100}}});expect(details.history).toHaveLength(50);expect(details.earnings[1]._sum.amount).toBe(0);expect(db.transaction.findMany.mock.calls.at(-1)[0].select).not.toHaveProperty('metadata');
 fixture.user.wallet=null;fixture.row.processingUntil=new Date(Date.now()+60000);expect(await getWithdrawalAdminDetails('admin',fixture.row.id,2)).toMatchObject({canDecide:false,nextHistoryPage:null,user:{wallet:null}});
});
it('permits audited approval only for eligible third-party unsubmitted requests',async()=>{
 fixture.row.status='AWAITING_APPROVAL';fixture.row.approvalRequired=true;fixture.row.processingUntil=new Date(0);
 expect(await decideWithdrawal('admin',fixture.row.id,'APPROVE','earnings checked','approve-key')).toMatchObject({status:'RESERVED',approvedAt:expect.any(Date)});expect(fixture.row.processingUntil).toBeNull();expect(fixture.row.processingAttempts).toBe(1);expect(fixture.run).not.toHaveBeenCalled();
 await expect(decideWithdrawal('admin',fixture.row.id,'APPROVE','x','approve-key')).rejects.toThrow('reason');await expect(decideWithdrawal('admin',fixture.row.id,'APPROVE','x'.repeat(501),'approve-key')).rejects.toThrow('reason');
 db.coinWithdrawal.findUnique.mockResolvedValueOnce(null);await expect(decideWithdrawal('admin','missing','APPROVE','checked','approve-key')).rejects.toThrow('not found');fixture.row.userId='admin';await expect(decideWithdrawal('admin',fixture.row.id,'REJECT','checked','approve-key')).rejects.toThrow('own');fixture.row.userId='user';
 for(const change of [()=>fixture.row.status='PROCESSING',()=>fixture.row.stage='FUNDING',()=>fixture.row.providerId='provider',()=>fixture.row.processingUntil=new Date(Date.now()+60000)]){fixture.row=makeRow();fixture.row.status='AWAITING_APPROVAL';change();await expect(decideWithdrawal('admin',fixture.row.id,'APPROVE','checked','approve-key')).rejects.toThrow('reconciled');}
 fixture.row=makeRow();fixture.row.status='AWAITING_APPROVAL';fixture.user.country.iso3='NGA';await expect(decideWithdrawal('admin',fixture.row.id,'APPROVE','checked','approve-key')).rejects.toThrow('eligible');fixture.user.country.iso3='USA';fixture.rates.maxWithdrawal=d(50);await expect(decideWithdrawal('admin',fixture.row.id,'APPROVE','checked','approve-key')).rejects.toThrow('eligible');
});
it('restores coins on rejection, leaves bonus untouched and fences expired workers',async()=>{
 fixture.row.status='BLOCKED';fixture.row.processingUntil=new Date(0);fixture.row.processingAttempts=3;
 expect(await decideWithdrawal('admin',fixture.row.id,'REJECT','earnings rejected','reject-key')).toMatchObject({status:'REJECTED',completedAt:expect.any(Date)});expect(fixture.wallet.coins.toNumber()).toBe(15000);expect(fixture.wallet.bonus.toNumber()).toBe(100);expect(fixture.row.processingAttempts).toBe(4);
 await expect(decideWithdrawal('admin',fixture.row.id,'REJECT','earnings rejected','another-key')).rejects.toThrow('reconciled');expect(fixture.wallet.coins.toNumber()).toBe(15000);
});

it('rechecks quote ownership inside the coin reservation transaction',async()=>{fixture.operation.mockImplementationOnce(async(_s,_k,_p,_u,work)=>{fixture.row=null;return await work({...db});});await expect(confirm()).rejects.toThrow('not found');expect(db.wallet.update).not.toHaveBeenCalled();});
it('blocks banned, deleted and deactivated users and locks applied before payout',async()=>{
 for(const override of [{status:'BANNED'},{deletedAt:new Date()},{deactivatedAt:new Date()}]){Object.assign(fixture.user,{status:'ACTIVE',deletedAt:null,deactivatedAt:null},override);await expect(quote()).rejects.toThrow('account cannot withdraw');}
 Object.assign(fixture.user,{status:'ACTIVE',deletedAt:null,deactivatedAt:null});fixture.row.status='RESERVED';fixture.wallet.isLocked=true;expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'BLOCKED'});fixture.row.status='RESERVED';fixture.user.wallet=null;expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'BLOCKED'});expect(fixture.run).not.toHaveBeenCalled();
});

it.each(['SUCCEEDED','FAILED'] as const)('traces committed authorization, stages and %s settlement without private wallet/provider details',async status=>{
 fixture.run.mockImplementation(async(_row:any,save:any,guard:any)=>{
  await guard();await save({stage:'PAYOUT_ACCEPTED',providerId:'payout-safe'});
  return {id:'payout-safe',status};
 });
 await confirm();
 const events=vi.mocked(logger.info).mock.calls.map(([context])=>context as any);
 for(const operation of ['confirmation.started','authorization.verification.completed','confirmation.committed','processing.lease_acquired','dispatch.eligibility.completed','processing.stage_saved','provider.outcome','settlement.completed','processing.lease_released','confirmation.completed']){
  expect(events).toContainEqual(expect.objectContaining({operation,withdrawalId:'withdraw-fixture'}));
 }
 expect(events).toContainEqual(expect.objectContaining({operation:'settlement.completed',outcome:status}));
 expect(fixture.wallet.coins.toString()).toBe(status==='FAILED'?'10000':'5000');
 const serialized=JSON.stringify(events);
 expect(serialized).not.toMatch(/123456|user@example|Test User|account_number|wallet_address|tokenHash|reviewNote/);
});

it('exposes both Nigerian withdrawal methods and global crypto-only pricing',async()=>{
 const global=await withdrawalSettings('user');
 expect(global.methods.bank).toBeNull();expect(global.methods.crypto).toMatchObject({currency:'USD',rate:'0.015',exchangeFeePercent:25,minimum:10,maximum:5000});
 fixture.user.country.iso3='NGA';
 const local=await withdrawalSettings('user');
 expect(local.methods.bank).toMatchObject({currency:'NGN',rate:'18',exchangeFeePercent:20,minimum:1000,maximum:5000000});
 expect(local.methods.crypto).toEqual(global.methods.crypto);
 expect(local.providers.every(provider=>provider.routes.length>0)).toBe(true);
});
it.each(['BACHS','FLUTTERWAVE'] as const)('quotes Nigerian crypto through %s using global prices and fees',async gateway=>{
 fixture.user.country.iso3='NGA';
 const q=await quoteCoinWithdrawal('user',{coins:5000,gateway,destination:crypto});
 expect(q).toMatchObject({currency:'USD',rate:'0.015',exchangeFeePercent:25,amount:56.25,minimum:10});
 expect(fixture.row.country).toBe('NGA');expect(fixture.row.rate.toString()).toBe('0.015');
 const args=fixture.prepare.mock.calls[0];expect(args[gateway==='BACHS'?1:0].toString()).toBe('56.25');
});
it('confirms Nigerian crypto with USD policies and dispatches only within USD limits',async()=>{
 fixture.user.country.iso3='NGA';fixture.row.country='NGA';fixture.rates.maxNgnWithdrawal=d(1);fixture.rates.reviewNgnWithdrawal=d(1);
 expect(await confirm()).toMatchObject({status:'PROCESSING',currency:'USD'});
 expect(fixture.row.approvalRequired).toBe(false);expect(fixture.run).toHaveBeenCalled();
 fixture.row.status='RESERVED';fixture.rates.maxWithdrawal=d(50);fixture.run.mockClear();
 expect(await processCoinWithdrawal(fixture.row.id)).toMatchObject({status:'BLOCKED'});expect(fixture.run).not.toHaveBeenCalled();
});
it('requires USD admin review for Nigerian crypto and uses the USD maximum on approval',async()=>{
 fixture.user.country.iso3='NGA';fixture.row.country='NGA';fixture.rates.reviewWithdrawal=d(50);fixture.rates.reviewNgnWithdrawal=d(1000000);
 expect(await confirm()).toMatchObject({status:'AWAITING_APPROVAL',currency:'USD'});expect(fixture.run).not.toHaveBeenCalled();
 fixture.rates.maxNgnWithdrawal=d(1);
 expect(await decideWithdrawal('admin',fixture.row.id,'APPROVE','Verified ownership','decision-crypto')).toMatchObject({status:'RESERVED'});
});
it('rejects Nigerian crypto below the global minimum and above the global maximum',async()=>{
 fixture.user.country.iso3='NGA';
 await expect(quoteCoinWithdrawal('user',{coins:100,gateway:'BACHS',destination:crypto})).rejects.toThrow('USD');
 fixture.rates.maxWithdrawal=d(50);
 await expect(quote()).rejects.toThrow('USD');expect(fixture.prepare).not.toHaveBeenCalled();
});

function setupAuthenticator(){
 const secret=new Secret({size:20}).base32;
 fixture.user.twoFactor={enabledAt:new Date()};
 fixture.factor={userId:'user',enabledAt:new Date(),version:'factor-v1',lastUsedStep:null,secret:security.encryptTwoFactorSecret('user',secret)};
 return new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30}).generate();
}
it('allows authenticator confirmation without email and retains an intent-bound proof for retries',async()=>{
 const code=setupAuthenticator();fixture.row.otpVerifiedAt=null;fixture.row.otpChallengeId=null;
 expect((await withdrawalSettings('user')).authenticatorEnabled).toBe(true);
 expect(await confirmCoinWithdrawal('user',fixture.row.id,'authenticator-key',{method:'AUTHENTICATOR',code})).toMatchObject({status:'PROCESSING'});
 expect(fixture.factor.lastUsedStep).toEqual(expect.any(Number));expect(fixture.row.authorizationMethod).toBe('AUTHENTICATOR');expect(fixture.row.authorizationCodeHash).not.toBe(code);
 expect(db.authEmailToken.findUnique).not.toHaveBeenCalled();expect(db.emailMessage.create).not.toHaveBeenCalled();
 await confirmCoinWithdrawal('user',fixture.row.id,'authenticator-key',{method:'AUTHENTICATOR',code});
 expect(db.wallet.update).toHaveBeenCalledTimes(1);
});
it('rejects disabled factors, wrong codes, replay across withdrawals and exceeded attempt limits',async()=>{
 const code=setupAuthenticator(),bad=code==='000000'?'999999':'000000';fixture.row.otpVerifiedAt=null;
 await expect(confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code:bad})).rejects.toThrow('authenticator code');
 expect(fixture.row.authorizationAttempts).toBe(1);expect(db.wallet.update).not.toHaveBeenCalled();
 fixture.row.authorizationAttempts=5;await expect(confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code})).rejects.toThrow('authenticator code');
 fixture.row.authorizationAttempts=0;fixture.factor.lastUsedStep=Math.floor(Date.now()/30000);
 await expect(confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code})).rejects.toThrow('authenticator code');
 fixture.factor.enabledAt=null;await expect(confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code})).rejects.toThrow('requires active');
 expect(db.wallet.update).not.toHaveBeenCalled();
});
it('fails closed when the account-wide authenticator rate limit is exceeded',async()=>{
 setupAuthenticator();vi.mocked(security.consumeAuthRateLimit).mockResolvedValueOnce({allowed:false,retryAfter:900});
 await expect(confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code:'123456'})).rejects.toThrow('Too many');expect(db.wallet.update).not.toHaveBeenCalled();
});
it('blocks unsubmitted payouts when the authorized factor changes or is disabled',async()=>{
 const code=setupAuthenticator();fixture.row.otpVerifiedAt=null;
 await confirmCoinWithdrawal('user',fixture.row.id,'auth-key',{method:'AUTHENTICATOR',code});
 fixture.row.status='RESERVED';fixture.row.stage='PREPARED';fixture.factor.version='factor-v2';fixture.run.mockClear();
 expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'BLOCKED'});expect(fixture.run).not.toHaveBeenCalled();
});
it('rejects missing quotes, changed settings and malformed authenticator codes before reserving funds',async()=>{
 const code=setupAuthenticator();const row=fixture.row;
 fixture.row=null;await expect(confirmCoinWithdrawal('user','missing','auth-key',{method:'AUTHENTICATOR',code})).rejects.toThrow('not found');
 fixture.row=row;fixture.rates=null;await expect(confirmCoinWithdrawal('user',row.id,'auth-key',{method:'AUTHENTICATOR',code})).rejects.toThrow('settings changed');
 fixture.rates={withdrawalsEnabled:true,price:d('.015'),fee:d('.25'),minWithdrawal:d(10)};
 await expect(confirmCoinWithdrawal('user',row.id,'auth-key',{method:'AUTHENTICATOR',code:'recovery-code'})).rejects.toThrow('authenticator code');
 expect(db.wallet.update).not.toHaveBeenCalled();
});
it('persists estimated and actual provider fees independently of Kwonnet exchange fees',async()=>{
 fixture.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),data:{request:{},sourceRequired:'57.75',feeEstimate:{amount:'1.5',currency:'USDC',includesConversion:false}}});
 await quote();
 expect(fixture.row).toMatchObject({estimatedProviderFee:'1.5',estimatedProviderFeeCurrency:'USDC'});expect(fixture.row.fee.toString()).toBe('0.25');
 expect(db.coinWithdrawal.create.mock.calls[0][0].data).not.toHaveProperty('providerFee');
 fixture.row.status='RESERVED';fixture.row.stage='PAYOUT_ACCEPTED';
 fixture.run.mockImplementation(async(_row,save)=>{await save({providerFee:'1.5',providerFeeCurrency:'USDC',providerFeeIncludesConversion:false,providerFeeSource:'PROVIDER'});return {status:'SUCCEEDED'};});
 expect(await processCoinWithdrawal(fixture.row.id,'user')).toMatchObject({status:'SUCCEEDED'});
 expect(fixture.row).toMatchObject({providerFee:'1.5',providerFeeCurrency:'USDC',providerFeeSource:'PROVIDER'});expect(fixture.row.fee.toString()).toBe('0.25');
 fixture.run.mockClear();await processCoinWithdrawal(fixture.row.id,'user');expect(fixture.run).not.toHaveBeenCalled();
});
