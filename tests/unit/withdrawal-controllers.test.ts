import {beforeEach,expect,it,vi} from 'vitest';
const service=vi.hoisted(()=>Object.fromEntries(['withdrawalSettings','quoteCoinWithdrawal','confirmCoinWithdrawal','listCoinWithdrawals','processCoinWithdrawal','withdrawalBanks','resolveWithdrawalBank','requestWithdrawalOtp','getWithdrawalAdminPolicy','updateWithdrawalAdminPolicy','restrictUserWithdrawal','listWithdrawalAdminQueue','getWithdrawalAdminDetails','decideWithdrawal'].map(name=>[name,vi.fn()])) as any);
vi.mock('@/services/v1/wallets',()=>service);
vi.mock('@/services/v1/wallets/withdrawal-provider',()=>service);
vi.mock('@/services/v1/wallets/refunds',()=>({}));
import {WalletError} from '@/services/walletLedger';
import {withdrawalSettingsController,withdrawalBanksController,resolveWithdrawalBankController,quoteCoinWithdrawalController,confirmCoinWithdrawalController,listCoinWithdrawalsController,withdrawalStatusController,withdrawalOtpController,withdrawalAdminPolicyController,updateWithdrawalAdminPolicyController,restrictWithdrawalUserController,withdrawalAdminQueueController,withdrawalAdminDetailsController,withdrawalAdminDecisionController} from '@/controllers/v1/wallets';
const request=(body:any={},user=true):any=>({body,user:user?{id:'user'}:undefined,params:{id:'withdraw'},query:{gateway:'BACHS'},get:vi.fn(()=> 'withdraw-test-key')});
const response=():any=>{const res:any={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
beforeEach(()=>{vi.clearAllMocks();for(const value of Object.values(service) as any[])value.mockResolvedValue({ok:true});service.withdrawalSettings.mockResolvedValue({nigerian:true});});
it('binds settings, list and status to the authenticated user',async()=>{
 for(const [controller,name]of [[withdrawalSettingsController,'withdrawalSettings'],[listCoinWithdrawalsController,'listCoinWithdrawals'],[withdrawalStatusController,'processCoinWithdrawal']]as const){const res=response();await controller(request(),res);expect(service[name]).toHaveBeenCalledWith(...(name==='processCoinWithdrawal'?['withdraw','user']:name==='listCoinWithdrawals'?['user',undefined]:['user']));expect(res.json).toHaveBeenCalled();}
});
it('validates provider and resolves Nigerian bank accounts only',async()=>{
 const res=response();await withdrawalBanksController(request(),res);expect(service.withdrawalBanks).toHaveBeenCalledWith('BACHS');
 const req=request();req.query.gateway='OTHER';await withdrawalBanksController(req,res);expect(res.status).toHaveBeenCalledWith(400);
 service.withdrawalSettings.mockResolvedValue({nigerian:false});await withdrawalBanksController(request(),res);expect(res.status).toHaveBeenCalledWith(400);
});
it('checks bank request shape and never accepts global bank destinations',async()=>{
 const res=response();await resolveWithdrawalBankController(request(),res);expect(res.status).toHaveBeenCalledWith(400);
 const payload={gateway:'BACHS',bankCode:'058',accountNumber:'0123456789'};await resolveWithdrawalBankController(request(payload),res);expect(service.resolveWithdrawalBank).toHaveBeenCalledWith('BACHS','058','0123456789');
 service.withdrawalSettings.mockResolvedValue({nigerian:false});await resolveWithdrawalBankController(request(payload),res);expect(res.status).toHaveBeenCalledWith(400);
});
it('rejects untrusted amount/currency/user overrides and unconfirmed crypto addresses',async()=>{
 const payload={coins:5000,gateway:'BACHS',destination:{type:'crypto',asset:'USDC_BASE',address:'0x'+'a'.repeat(40),confirmed:true}};
 const res=response();await quoteCoinWithdrawalController(request(payload),res);expect(service.quoteCoinWithdrawal).toHaveBeenCalledWith('user',payload);
 for(const extra of [{userId:'other'},{amount:100000},{currency:'NGN'}]){await quoteCoinWithdrawalController(request({...payload,...extra}),res);expect(res.status).toHaveBeenLastCalledWith(400);}
 await quoteCoinWithdrawalController(request({...payload,destination:{...payload.destination,confirmed:false}}),res);expect(res.status).toHaveBeenLastCalledWith(400);
});
it('confirms only an intent-bound OTP body, server quote ID and explicit key',async()=>{
 const res=response();await confirmCoinWithdrawalController(request({challengeId:'11111111-1111-4111-8111-111111111111',code:'123456'}),res);expect(service.confirmCoinWithdrawal).toHaveBeenCalledWith('user','withdraw','withdraw-test-key',{challengeId:'11111111-1111-4111-8111-111111111111',code:'123456'});await confirmCoinWithdrawalController(request({amount:1}),res);expect(res.status).toHaveBeenCalledWith(400);
});
it('returns useful wallet errors but hides unexpected failure details for every endpoint',async()=>{
 const cases=[
  [withdrawalSettingsController,'withdrawalSettings',{}],
  [withdrawalBanksController,'withdrawalBanks',{}],
  [resolveWithdrawalBankController,'resolveWithdrawalBank',{gateway:'BACHS',bankCode:'058',accountNumber:'0123456789'}],
  [quoteCoinWithdrawalController,'quoteCoinWithdrawal',{coins:5000,gateway:'BACHS',destination:{type:'bank',bankCode:'058',accountNumber:'0123456789'}}],
  [confirmCoinWithdrawalController,'confirmCoinWithdrawal',{challengeId:'11111111-1111-4111-8111-111111111111',code:'123456'}],
  [listCoinWithdrawalsController,'listCoinWithdrawals',{}],
  [withdrawalStatusController,'processCoinWithdrawal',{}],
 ] as const;
 for(const [controller,name,body]of cases){
  service.withdrawalSettings.mockResolvedValue({nigerian:true});service[name].mockRejectedValueOnce(new WalletError('Not enough funds',409));const res=response();await controller(request(body),res);expect(res.status).toHaveBeenLastCalledWith(409);expect(res.json).toHaveBeenLastCalledWith({message:'Not enough funds'});
  service.withdrawalSettings.mockResolvedValue({nigerian:true});service[name].mockRejectedValueOnce(new Error('PRIVATE TOKEN'));await controller(request(body),res);expect(res.status).toHaveBeenLastCalledWith(503);expect(res.json).toHaveBeenLastCalledWith({message:expect.not.stringContaining('PRIVATE')});
 }
});
it('handles missing request identity without using a client-supplied user',async()=>{
 await withdrawalSettingsController(request({},false),response());expect(service.withdrawalSettings).toHaveBeenCalledWith('undefined');
});
it('binds all security and admin handlers to the authenticated actor and validates strict inputs',async()=>{
 const policy={withdrawalsEnabled:false,maxWithdrawal:5000,maxNgnWithdrawal:5000000,reviewWithdrawal:2500,reviewNgnWithdrawal:2500000};
 const cases=[
  [withdrawalOtpController,'requestWithdrawalOtp',{},['user','withdraw']],
  [withdrawalAdminPolicyController,'getWithdrawalAdminPolicy',{},['user']],
  [updateWithdrawalAdminPolicyController,'updateWithdrawalAdminPolicy',policy,['user',policy]],
  [restrictWithdrawalUserController,'restrictUserWithdrawal',{restricted:true,reason:'fraud review'},['user','withdraw',true,'fraud review']],
  [withdrawalAdminQueueController,'listWithdrawalAdminQueue',{},['user',1,'AWAITING_APPROVAL']],
  [withdrawalAdminDetailsController,'getWithdrawalAdminDetails',{},['user','withdraw',1]],
  [withdrawalAdminDecisionController,'decideWithdrawal',{decision:'APPROVE',note:'earnings checked'},['user','withdraw','APPROVE','earnings checked','withdraw-test-key']],
 ]as const;
 for(const [controller,name,body,args]of cases){const res=response();await controller(request(body),res);expect(service[name]).toHaveBeenCalledWith(...args);expect(res.json).toHaveBeenCalled();service[name].mockRejectedValueOnce(new WalletError('Denied',403));await controller(request(body),res);expect(res.status).toHaveBeenLastCalledWith(403);}
 for(const [controller,body]of [[withdrawalOtpController,{code:'123456'}],[updateWithdrawalAdminPolicyController,{...policy,maxWithdrawal:-1}],[restrictWithdrawalUserController,{restricted:true}],[withdrawalAdminDecisionController,{decision:'SEND',note:'checked'}]]as const){const res=response();await controller(request(body),res);expect(res.status).toHaveBeenCalledWith(400);}
 const req=request();req.query={page:'2',status:'BLOCKED'};await withdrawalAdminQueueController(req,response());expect(service.listWithdrawalAdminQueue).toHaveBeenLastCalledWith('user',2,'BLOCKED');await withdrawalAdminDetailsController(req,response());expect(service.getWithdrawalAdminDetails).toHaveBeenLastCalledWith('user','withdraw',2);await listCoinWithdrawalsController(req,response());expect(service.listCoinWithdrawals).toHaveBeenLastCalledWith('user',2);
});

it('accepts an explicit authenticator proof and rejects mixed authorization bodies',async()=>{
 const res=response();await confirmCoinWithdrawalController(request({method:'AUTHENTICATOR',code:'123456'}),res);
 expect(service.confirmCoinWithdrawal).toHaveBeenCalledWith('user','withdraw','withdraw-test-key',{method:'AUTHENTICATOR',code:'123456'});
 service.confirmCoinWithdrawal.mockClear();await confirmCoinWithdrawalController(request({method:'AUTHENTICATOR',challengeId:'11111111-1111-4111-8111-111111111111',code:'123456'}),res);
 expect(res.status).toHaveBeenLastCalledWith(400);expect(service.confirmCoinWithdrawal).not.toHaveBeenCalled();
});
