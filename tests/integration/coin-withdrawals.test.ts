import {PrismaPg} from '@prisma/adapter-pg';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/db',async()=>{const {PrismaClient}=await import('@prisma/client');return {default:new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})})};});
const provider=vi.hoisted(()=>({prepare:vi.fn(),run:vi.fn()}));
vi.mock('@/services/v1/wallets/withdrawal-flutterwave',()=>({prepareFlutterwaveWithdrawal:provider.prepare,runFlutterwaveWithdrawal:provider.run}));
vi.mock('@/services/v1/wallets/withdrawal-bachs',()=>({prepareBachsWithdrawal:provider.prepare,runBachsWithdrawal:provider.run}));
import db from '@/db';
import {quoteCoinWithdrawal,confirmCoinWithdrawal,processCoinWithdrawal,listCoinWithdrawals} from '@/services/v1/wallets';
const buyer='withdrawal-fixture-user',other='withdrawal-fixture-other';
const destination={type:'crypto' as const,asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true as const};
let rate:any;
beforeAll(async()=>{
 vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');
 const continent=await db.continent.create({data:{id:'withdrawal-fixture-continent',code:'XW',name:'Withdrawal fixture continent'}});
 const country=await db.country.create({data:{id:'withdrawal-fixture-country',name:'Withdrawal fixture country',iso2:'XW',iso3:'XWW',emoji:'withdrawal-flag',continentId:continent.id}});
 for(const id of [buyer,other])await db.user.create({data:{id,name:'Withdrawal User',username:id,email:`${id}@example.test`,countryId:country.id,wallet:{create:{coins:10000,bonus:100,credit:200}}}});
 rate=await db.chargeRate.findUnique({where:{id:'default'}});
 await db.chargeRate.upsert({where:{id:'default'},create:{id:'default',price:.015,minWithdrawal:5,fee:.25,ngnPrice:18,minNgnWithdrawal:1000,ngnFee:.2},update:{price:.015,minWithdrawal:5,fee:.25,ngnPrice:18,minNgnWithdrawal:1000,ngnFee:.2}});
});
beforeEach(async()=>{
 await db.coinWithdrawal.deleteMany({where:{userId:buyer}});await db.transaction.deleteMany({where:{userId:buyer}});await db.walletOperation.deleteMany({where:{scope:`withdrawal:${buyer}`}});
 await db.wallet.update({where:{userId:buyer},data:{coins:10000,bonus:100,credit:200,isLocked:false}});
 provider.prepare.mockReset();provider.run.mockReset();
 provider.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),data:{request:{account_number:destination.address,account_bank:'BASE',amount:57.75,currency:'USDC',debit_currency:'USD'},sourceRequired:'59.25'}});
 provider.run.mockImplementation(async(row,save)=>{await save({stage:'PAYOUT_ACCEPTED',providerId:`payout-${row.id}`});return {status:'PROCESSING'};});
});
afterAll(async()=>{
 await db.coinWithdrawal.deleteMany({where:{userId:{in:[buyer,other]}}});await db.transaction.deleteMany({where:{userId:{in:[buyer,other]}}});await db.wallet.deleteMany({where:{userId:{in:[buyer,other]}}});await db.user.deleteMany({where:{id:{in:[buyer,other]}}});await db.country.delete({where:{id:'withdrawal-fixture-country'}});await db.continent.delete({where:{id:'withdrawal-fixture-continent'}});
 if(rate)await db.chargeRate.update({where:{id:'default'},data:{price:rate.price,minWithdrawal:rate.minWithdrawal,fee:rate.fee,ngnPrice:rate.ngnPrice,minNgnWithdrawal:rate.minNgnWithdrawal,ngnFee:rate.ngnFee}});
 await db.$disconnect();
});
async function quote(){return await quoteCoinWithdrawal(buyer,{coins:5000,gateway:'FLUTTERWAVE',destination});}
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
