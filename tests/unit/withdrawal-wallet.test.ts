import {beforeEach,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
const fixture=vi.hoisted(()=>({row:null as any,other:null as any,user:null as any,wallet:null as any,rates:null as any,operation:vi.fn(),prepare:vi.fn(),run:vi.fn()}));
const db=vi.hoisted(()=>Object.fromEntries(['user','wallet','chargeRate','coinWithdrawal','transaction'].map(model=>[model,Object.fromEntries(['findUnique','findUniqueOrThrow','findFirst','findMany','create','update','updateMany'].map(method=>[method,vi.fn()]))])) as any);
vi.mock('@/db',()=>({default:db}));
vi.mock('@/services/walletLedger',async original=>({...await original<any>(),walletOperation:fixture.operation}));
vi.mock('@/services/v1/wallets/withdrawal-flutterwave',()=>({prepareFlutterwaveWithdrawal:fixture.prepare,runFlutterwaveWithdrawal:fixture.run}));
vi.mock('@/services/v1/wallets/withdrawal-bachs',()=>({prepareBachsWithdrawal:fixture.prepare,runBachsWithdrawal:fixture.run}));
import {WalletError} from '@/services/walletLedger';
import {WithdrawalProviderError} from '@/services/v1/wallets/withdrawal-provider';
import {withdrawalSettings,quoteCoinWithdrawal,confirmCoinWithdrawal,processCoinWithdrawal,listCoinWithdrawals,reconcileCoinWithdrawals} from '@/services/v1/wallets';
const d=(n:number|string)=>new Prisma.Decimal(n),crypto={type:'crypto' as const,asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true as const};
function makeRow(){return {id:'withdraw-fixture',userId:'user',gateway:'FLUTTERWAVE',environment:'flutterwave:test',country:'USA',coins:d(5000),rate:d('.015'),fee:d('.25'),minimum:d(5),amount:d('56.25'),currency:'USD',destination:crypto,providerData:{request:{},sourceRequired:'60'},receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),status:'QUOTED',stage:'PREPARED',providerId:null,createdAt:new Date(),completedAt:null,reviewRequiredAt:null,processingAttempts:0,processingUntil:null};}
function apply(data:any){for(const [key,value]of Object.entries(data))fixture.row[key]=value&&typeof value==='object'&&'increment'in value?fixture.row[key]+(value as any).increment:value;return {...fixture.row};}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('FLUTTERWAVE_SECK','FLWSECK_TEST_fixture');vi.stubEnv('BACHS_API_KEY','sk_sandbox_test');
 fixture.row=makeRow();fixture.other=null;fixture.wallet={id:'wallet',userId:'user',coins:d(10000),bonus:d(100),credit:d(100),isLocked:false};fixture.user={id:'user',name:'Test User',country:{iso3:'USA',iso2:'US'},wallet:fixture.wallet};fixture.rates={price:d('.015'),ngnPrice:d(18),fee:d('.25'),ngnFee:d('.2'),minWithdrawal:d(5),minNgnWithdrawal:d(1000)};
 db.user.findUnique.mockImplementation(async()=>fixture.user);db.user.findUniqueOrThrow.mockImplementation(async()=>fixture.user);db.chargeRate.findUnique.mockImplementation(async()=>fixture.rates);
 db.wallet.findUniqueOrThrow.mockImplementation(async()=>fixture.wallet);db.wallet.update.mockImplementation(async({data}:any)=>{if(data.coins?.increment)fixture.wallet.coins=fixture.wallet.coins.add(data.coins.increment);if(data.coins?.decrement)fixture.wallet.coins=fixture.wallet.coins.sub(data.coins.decrement);return fixture.wallet;});
 db.coinWithdrawal.findFirst.mockImplementation(async({where}:any)=>where.id&&typeof where.id==='string'?fixture.row&&where.id===fixture.row.id&&(!where.userId||where.userId===fixture.row.userId)?{...fixture.row}:null:fixture.other);
 db.coinWithdrawal.findUniqueOrThrow.mockImplementation(async()=>({...fixture.row}));db.coinWithdrawal.findMany.mockImplementation(async()=>fixture.row?[{...fixture.row}]:[]);
 db.coinWithdrawal.create.mockImplementation(async({data}:any)=>{fixture.row={...makeRow(),...data};return {...fixture.row};});db.coinWithdrawal.update.mockImplementation(async({data}:any)=>apply(data));db.coinWithdrawal.updateMany.mockImplementation(async({data}:any)=>{apply(data);return {count:1};});
 db.transaction.create.mockResolvedValue({});db.transaction.updateMany.mockResolvedValue({count:1});fixture.operation.mockImplementation(async(_scope,_key,_payload,_ids,work)=>await work(db));
 fixture.prepare.mockResolvedValue({receiveAmount:'56.25',receiveCurrency:'USDC',expiresAt:new Date(Date.now()+60000),data:{request:{},sourceRequired:'60'}});fixture.run.mockResolvedValue({status:'PROCESSING'});
});
const quote=()=>quoteCoinWithdrawal('user',{coins:5000,gateway:'FLUTTERWAVE',destination:crypto});
const confirm=()=>confirmCoinWithdrawal('user','withdraw-fixture','withdraw-test-key');
it('returns regional settings and provider availability',async()=>{
 expect(await withdrawalSettings('user')).toMatchObject({currency:'USD',rate:'0.015',exchangeFeePercent:25,minimum:5});
 fixture.user.country.iso3='NGA';expect(await withdrawalSettings('user')).toMatchObject({currency:'NGN',rate:'18',exchangeFeePercent:20,minimum:1000});
 vi.stubEnv('FLUTTERWAVE_SECK','');vi.stubEnv('BACHS_API_KEY','');expect((await withdrawalSettings('user')).providers.every(p=>!p.enabled)).toBe(true);
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
 fixture.user=null;await expect(quote()).rejects.toThrow('country');fixture.user={country:{iso3:'USA'},wallet:null};await expect(quote()).rejects.toThrow('wallet');fixture.user.wallet=fixture.wallet;
 fixture.wallet.isLocked=true;await expect(quote()).rejects.toThrow('locked');fixture.wallet.isLocked=false;
 await expect(quoteCoinWithdrawal('user',{coins:5000,gateway:'UNKNOWN' as any,destination:crypto})).rejects.toThrow('Unsupported');
 fixture.rates=null;await expect(quote()).rejects.toThrow('rates');fixture.rates={price:d('.015'),fee:d('.25'),minWithdrawal:d(5)};fixture.wallet.coins=d(1);await expect(quote()).rejects.toThrow('Insufficient');fixture.wallet.coins=d(10000);fixture.other={};await expect(quote()).rejects.toThrow('in progress');
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
