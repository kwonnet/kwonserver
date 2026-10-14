vi.mock('@/services/email',()=>({enqueueEmailMessage:vi.fn()}));
import {PrismaPg} from '@prisma/adapter-pg';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})})};});
const provider=vi.hoisted(()=>({prepare:vi.fn(),run:vi.fn()}));
vi.mock('@/services/v1/wallets/withdrawal-flutterwave',()=>({prepareFlutterwaveWithdrawal:provider.prepare,runFlutterwaveWithdrawal:provider.run}));
vi.mock('@/services/v1/wallets/withdrawal-bachs',()=>({prepareBachsWithdrawal:provider.prepare,runBachsWithdrawal:provider.run}));
import db from '@/db';
import {decryptEmailToken} from '@/utils/auth-security';
import {quoteCoinWithdrawal,confirmCoinWithdrawal as confirmOriginal,requestWithdrawalOtp,processCoinWithdrawal,listCoinWithdrawals,decideWithdrawal,updateWithdrawalAdminPolicy,restrictUserWithdrawal,getWithdrawalAdminDetails,listWithdrawalAdminQueue} from '@/services/v1/wallets';
const buyer='withdrawal-fixture-user',other='withdrawal-fixture-other',admin='withdrawal-fixture-admin';const codes=new Map<string,{challengeId:string;code:string}>();
const destination={type:'crypto' as const,asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true as const};
let rate:any;
beforeAll(async()=>{
 vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','test-withdrawal-secret-at-least-32-characters');
 const continent=await db.continent.create({data:{id:'withdrawal-fixture-continent',code:'XW',name:'Withdrawal fixture continent'}});
 const country=await db.country.create({data:{id:'withdrawal-fixture-country',name:'Withdrawal fixture country',iso2:'XW',iso3:'XWW',emoji:'withdrawal-flag',continentId:continent.id}});
 for(const id of [buyer,other,admin])await db.user.create({data:{id,role:id===admin?'ADMIN':'USER',emailVerifiedAt:new Date(),name:'Withdrawal User',username:id,email:`${id}@example.test`,countryId:country.id,wallet:{create:{coins:10000,bonus:100,credit:200}}}});
 rate=await db.chargeRate.findUnique({where:{id:'default'}});
 await db.chargeRate.upsert({where:{id:'default'},create:{id:'default',price:.015,minWithdrawal:5,fee:.25,ngnPrice:18,minNgnWithdrawal:1000,ngnFee:.2},update:{price:.015,minWithdrawal:5,fee:.25,ngnPrice:18,minNgnWithdrawal:1000,ngnFee:.2}});
});
beforeEach(async()=>{
 codes.clear();await db.authEmailToken.deleteMany({where:{userId:buyer,purpose:'WITHDRAWAL_OTP'}});await db.emailMessage.deleteMany({where:{userId:buyer,kind:'WITHDRAWAL_OTP'}});await db.withdrawalAdminEvent.deleteMany({});
 await db.user.update({where:{id:buyer},data:{email:`${buyer}@example.test`,emailVerifiedAt:new Date(),withdrawalRestricted:false}});
 await db.chargeRate.update({where:{id:'default'},data:{withdrawalsEnabled:true,maxWithdrawal:5000,maxNgnWithdrawal:5000000,reviewWithdrawal:2500,reviewNgnWithdrawal:2500000}});
 await db.coinWithdrawal.deleteMany({where:{userId:buyer}});await db.transaction.deleteMany({where:{userId:buyer}});await db.walletOperation.deleteMany({where:{scope:`withdrawal:${buyer}`}});
 await db.wallet.update({where:{userId:buyer},data:{coins:10000,bonus:100,credit:200,isLocked:false}});
 provider.prepare.mockReset();provider.run.mockReset();
 provider.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),data:{request:{account_number:destination.address,account_bank:'BASE',amount:57.75,currency:'USDC',debit_currency:'USD'},sourceRequired:'59.25'}});
 provider.run.mockImplementation(async(row,save)=>{await save({stage:'PAYOUT_ACCEPTED',providerId:`payout-${row.id}`});return {status:'PROCESSING'};});
});
afterAll(async()=>{
 await db.withdrawalAdminEvent.deleteMany({});await db.coinWithdrawal.deleteMany({where:{userId:{in:[buyer,other,admin]}}});await db.transaction.deleteMany({where:{userId:{in:[buyer,other,admin]}}});await db.wallet.deleteMany({where:{userId:{in:[buyer,other,admin]}}});await db.user.deleteMany({where:{id:{in:[buyer,other,admin]}}});await db.country.delete({where:{id:'withdrawal-fixture-country'}});await db.continent.delete({where:{id:'withdrawal-fixture-continent'}});
 if(rate)await db.chargeRate.update({where:{id:'default'},data:{price:rate.price,minWithdrawal:rate.minWithdrawal,fee:rate.fee,ngnPrice:rate.ngnPrice,minNgnWithdrawal:rate.minNgnWithdrawal,ngnFee:rate.ngnFee}});
 await db.$disconnect();
});
async function authorize(id:string){const challenge=await requestWithdrawalOtp(buyer,id);const action=await db.authEmailToken.findUniqueOrThrow({where:{id:challenge.challengeId}});const otp={challengeId:challenge.challengeId,code:decryptEmailToken(action.encryptedToken)};codes.set(id,otp);return otp;}
async function quote(){const q=await quoteCoinWithdrawal(buyer,{coins:5000,gateway:'FLUTTERWAVE',destination});await authorize(q.id);return q;}
async function confirmCoinWithdrawal(userId:string,id:string,key:string){return await confirmOriginal(userId,id,key,codes.get(id));}
it('concurrent confirmation reserves coins once and starts one payout',async()=>{
 const q=await quote();expect(q).toMatchObject({amount:56.25,coins:5000,exchangeFeePercent:25});
 const before=await db.wallet.findUniqueOrThrow({where:{userId:buyer}});expect(before.coins.toNumber()).toBe(10000);
 await Promise.all(Array.from({length:8},()=>confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-same-key')));
 const wallet=await db.wallet.findUniqueOrThrow({where:{userId:buyer}});
 expect(wallet.coins.toNumber()).toBe(5000);expect(wallet.bonus.toNumber()).toBe(100);expect(wallet.credit.toNumber()).toBe(200);
 expect(await db.transaction.count({where:{userId:buyer,type:'DEBIT',category:'COIN_WITHDRAWAL'}})).toBe(1);expect(provider.run.mock.calls.filter(([row])=>row.stage==='PREPARED')).toHaveLength(1);
});
it('repeated confirmation with different keys still cannot debit the same quote twice',async()=>{
 const q=await quote();await confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-key-first');await confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-key-second');
 expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(5000);expect(await db.transaction.count({where:{userId:buyer,type:'DEBIT'}})).toBe(1);
});
it('restores exact coins once after confirmed provider failure',async()=>{
 const q=await quote();await confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-failure-key');provider.run.mockResolvedValue({status:'FAILED'});
 await Promise.all(Array.from({length:8},()=>processCoinWithdrawal(q.id,buyer)));
 expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(10000);
 expect(await db.transaction.count({where:{userId:buyer,type:'CREDIT',category:'COIN_WITHDRAWAL'}})).toBe(1);
});
it('does not restore uncertain payouts, including old jobs; later delivery completes without another debit',async()=>{
 provider.run.mockImplementation(async(_row,save)=>{await save({stage:'PAYOUT_SUBMITTING'});throw new Error('Response lost after provider accepted payout');});
 const q=await quote();await confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-unknown-key');
 await db.coinWithdrawal.update({where:{id:q.id},data:{createdAt:new Date(Date.now()-9*86400000)}});
 provider.run.mockRejectedValue(new Error('Provider is unavailable'));await processCoinWithdrawal(q.id,buyer);
 expect((await db.coinWithdrawal.findUniqueOrThrow({where:{id:q.id}})).status).toBe('REVIEW');expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(5000);
 provider.run.mockResolvedValue({status:'SUCCEEDED'});expect(await processCoinWithdrawal(q.id,buyer)).toMatchObject({status:'SUCCEEDED'});
 expect(await db.transaction.count({where:{userId:buyer,type:'CREDIT'}})).toBe(0);
});
it('binds quotes, confirmation and status to the authenticated owner',async()=>{
 const q=await quote();await expect(confirmCoinWithdrawal(other,q.id,'withdraw-fixture-owner-key')).rejects.toThrow('not found');await expect(processCoinWithdrawal(q.id,other)).rejects.toThrow('not found');
 expect(await listCoinWithdrawals(other)).toEqual([]);expect(provider.run).not.toHaveBeenCalled();
});
it('rechecks wallet availability at confirmation, excluding bonus and credit',async()=>{
 const q=await quote();await db.wallet.update({where:{userId:buyer},data:{coins:4999,bonus:999999,credit:999999}});
 await expect(confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-short-key')).rejects.toThrow('Insufficient coin balance');expect(provider.run).not.toHaveBeenCalled();
});
it('rejects stale rate and expired quotes without debiting coins or sending payouts',async()=>{
 const q=await quote();await db.chargeRate.update({where:{id:'default'},data:{price:.016}});
 try{await expect(confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-rate-key')).rejects.toThrow('rates changed');}finally{await db.chargeRate.update({where:{id:'default'},data:{price:.015}});}
 await db.coinWithdrawal.update({where:{id:q.id},data:{expiresAt:new Date(Date.now()-1)}});
 await expect(confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-expired-key')).rejects.toThrow('expired');expect(provider.run).not.toHaveBeenCalled();expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(10000);
});
it('blocks another pending withdrawal and rejects below-minimum quotes before provider calls',async()=>{
 await expect(quoteCoinWithdrawal(buyer,{coins:444.44,gateway:'FLUTTERWAVE',destination})).rejects.toThrow('Minimum');expect(provider.prepare).not.toHaveBeenCalled();
 const q=await quote();await confirmCoinWithdrawal(buyer,q.id,'withdraw-fixture-pending-key');await expect(quote()).rejects.toThrow('in progress');
});

it('requires verified email and rejects above-maximum requests before contacting a payout provider',async()=>{
 await db.user.update({where:{id:buyer},data:{emailVerifiedAt:null}});
 await expect(quoteCoinWithdrawal(buyer,{coins:5000,gateway:'FLUTTERWAVE',destination})).rejects.toThrow('Verify');
 await db.user.update({where:{id:buyer},data:{emailVerifiedAt:new Date()}});await db.wallet.update({where:{userId:buyer},data:{coins:1000000}});
 await expect(quoteCoinWithdrawal(buyer,{coins:500000,gateway:'FLUTTERWAVE',destination})).rejects.toThrow('Maximum');expect(provider.prepare).not.toHaveBeenCalled();
});
it('commits OTP guess counters, refuses replay on another quote and supports a concurrent valid confirmation once',async()=>{
 const q=await quote(),otp=codes.get(q.id)!;
 await expect(confirmOriginal(buyer,q.id,'wrong-code-attempt-1',{...otp,code:otp.code==='000000'?'000001':'000000'})).rejects.toThrow('Invalid');
 expect((await db.authEmailToken.findUniqueOrThrow({where:{id:otp.challengeId}})).attempts).toBe(1);expect(provider.run).not.toHaveBeenCalled();
 const otherQuote=await quoteCoinWithdrawal(buyer,{coins:5000,gateway:'FLUTTERWAVE',destination});await expect(confirmOriginal(buyer,otherQuote.id,'otp-cross-intent-key',otp)).rejects.toThrow('Invalid');
 await Promise.all(Array.from({length:8},()=>confirmOriginal(buyer,q.id,'concurrent-otp-valid',otp)));
 expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(5000);expect(await db.transaction.count({where:{userId:buyer,type:'DEBIT'}})).toBe(1);
});
it('locks an OTP after five guesses, rejects expired codes and rate limits sending',async()=>{
 const q=await quote(),otp=codes.get(q.id)!,wrong=otp.code==='000000'?'000001':'000000';
 await expect(requestWithdrawalOtp(buyer,q.id)).rejects.toThrow('60 seconds');
 for(let i=0;i<5;i++)await expect(confirmOriginal(buyer,q.id,`wrong-code-attempt-${i}`,{...otp,code:wrong})).rejects.toThrow('Invalid');
 await expect(confirmOriginal(buyer,q.id,'locked-otp-valid',otp)).rejects.toThrow('locked');expect(provider.run).not.toHaveBeenCalled();
 await db.authEmailToken.update({where:{id:otp.challengeId},data:{attempts:0,expiresAt:new Date(0)}});
 await expect(confirmOriginal(buyer,q.id,'expired-otp-valid',otp)).rejects.toThrow('expired');
});
it('holds exact-threshold withdrawals for admin review and rejects with one coin restoration',async()=>{
 await db.wallet.update({where:{userId:buyer},data:{coins:1000000}});
 const q=await quoteCoinWithdrawal(buyer,{coins:222222.23,gateway:'FLUTTERWAVE',destination});await authorize(q.id);
 expect(q.amount).toBe(2500);expect(await confirmCoinWithdrawal(buyer,q.id,'large-withdrawal-review')).toMatchObject({status:'AWAITING_APPROVAL'});expect(provider.run).not.toHaveBeenCalled();
 expect((await listWithdrawalAdminQueue(admin)).items).toHaveLength(1);const detail=await getWithdrawalAdminDetails(admin,q.id);expect(detail.history).toHaveLength(1);expect(detail.user.wallet!.coins).toBe(777777.77);
 await Promise.all(Array.from({length:8},()=>decideWithdrawal(admin,q.id,'REJECT','Earnings need investigation','reject-large-withdrawal')));
 expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(1000000);expect(await db.transaction.count({where:{userId:buyer,type:'CREDIT'}})).toBe(1);expect(provider.run).not.toHaveBeenCalled();
});
it('allows approval only by another current administrator, records the audit, then checks restrictions again before payout',async()=>{
 await db.wallet.update({where:{userId:buyer},data:{coins:1000000}});
 const q=await quoteCoinWithdrawal(buyer,{coins:222222.23,gateway:'FLUTTERWAVE',destination});await authorize(q.id);await confirmCoinWithdrawal(buyer,q.id,'review-approve-request');
 await expect(getWithdrawalAdminDetails(other,q.id)).rejects.toThrow('Administrator');await expect(decideWithdrawal(other,q.id,'APPROVE','Looks valid','unauthorized-decision')).rejects.toThrow('Administrator');
 await decideWithdrawal(admin,q.id,'APPROVE','Verified earnings ledger','approved-large-withdrawal');expect(provider.run).not.toHaveBeenCalled();
 await restrictUserWithdrawal(admin,buyer,true,'Investigating account');expect(await processCoinWithdrawal(q.id,buyer)).toMatchObject({status:'BLOCKED'});expect(provider.run).not.toHaveBeenCalled();
 await restrictUserWithdrawal(admin,buyer,false,'Investigation complete');await processCoinWithdrawal(q.id,buyer);expect(provider.run).toHaveBeenCalled();expect(await db.withdrawalAdminEvent.count({where:{withdrawalId:q.id,action:'APPROVE'}})).toBe(1);
});
it('enforces platform pauses and email changes after authorization, while still reconciling already submitted payouts',async()=>{
 const q=await quote();await confirmCoinWithdrawal(buyer,q.id,'pause-after-submission');provider.run.mockResolvedValue({status:'SUCCEEDED'});
 const policy={withdrawalsEnabled:false,maxWithdrawal:5000,maxNgnWithdrawal:5000000,reviewWithdrawal:2500,reviewNgnWithdrawal:2500000};await updateWithdrawalAdminPolicy(admin,policy);
 expect(await processCoinWithdrawal(q.id,buyer)).toMatchObject({status:'SUCCEEDED'});
 await expect(quoteCoinWithdrawal(buyer,{coins:1000,gateway:'FLUTTERWAVE',destination})).rejects.toThrow('paused');
 await updateWithdrawalAdminPolicy(admin,{...policy,withdrawalsEnabled:true});
 const fresh=await quoteCoinWithdrawal(buyer,{coins:1000,gateway:'FLUTTERWAVE',destination});await db.authEmailToken.updateMany({where:{userId:buyer},data:{createdAt:new Date(0)}});const otp=await authorize(fresh.id);
 await db.user.update({where:{id:buyer},data:{email:'changed-withdrawal@example.test'}});await expect(confirmOriginal(buyer,fresh.id,'email-changed-intent',otp)).rejects.toThrow('Invalid');
});
it('lets administrators reject an expired unsubmitted worker lease and fences the old worker',async()=>{
 await db.wallet.update({where:{userId:buyer},data:{coins:1000000}});const q=await quoteCoinWithdrawal(buyer,{coins:222222.23,gateway:'FLUTTERWAVE',destination});await authorize(q.id);await confirmCoinWithdrawal(buyer,q.id,'expired-lease-review');
 await db.coinWithdrawal.update({where:{id:q.id},data:{status:'BLOCKED',processingUntil:new Date(0),processingAttempts:7}});expect((await getWithdrawalAdminDetails(admin,q.id)).canDecide).toBe(true);
 await decideWithdrawal(admin,q.id,'REJECT','Unsubmitted request cancelled','expired-lease-rejection');const row=await db.coinWithdrawal.findUniqueOrThrow({where:{id:q.id}});expect(row).toMatchObject({status:'REJECTED',processingUntil:null,processingAttempts:8});expect((await db.wallet.findUniqueOrThrow({where:{userId:buyer}})).coins.toNumber()).toBe(1000000);expect(await processCoinWithdrawal(q.id,buyer)).toMatchObject({status:'REJECTED'});expect(provider.run).not.toHaveBeenCalled();
});
it('holds the inclusive Nigerian review threshold and refuses its per-transaction maximum',async()=>{
 const original=await db.country.findUniqueOrThrow({where:{id:'withdrawal-fixture-country'}});await db.country.update({where:{id:original.id},data:{iso3:'NGA'}});
 try{
  await db.wallet.update({where:{userId:buyer},data:{coins:1000000}});const bank={type:'bank' as const,bankCode:'058',accountNumber:'0123456789'};provider.prepare.mockResolvedValue({receiveAmount:'2500000',receiveCurrency:'NGN',expiresAt:new Date(Date.now()+60000),data:{accountName:'Withdrawal User',request:{beneficiary_name:'Withdrawal User'},sourceRequired:'2500100'}});
  await expect(quoteCoinWithdrawal(buyer,{coins:347223,gateway:'FLUTTERWAVE',destination:bank})).rejects.toThrow('Maximum');
  const q=await quoteCoinWithdrawal(buyer,{coins:173611.12,gateway:'FLUTTERWAVE',destination:bank});expect(q).toMatchObject({currency:'NGN',approvalRequired:true});await authorize(q.id);expect(await confirmCoinWithdrawal(buyer,q.id,'ngn-inclusive-review')).toMatchObject({status:'AWAITING_APPROVAL'});expect(provider.run).not.toHaveBeenCalled();
 }finally{await db.country.update({where:{id:original.id},data:{iso3:original.iso3}});}
});
