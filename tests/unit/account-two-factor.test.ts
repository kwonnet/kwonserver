import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {TOTP, Secret} from 'otpauth';
const mocks=vi.hoisted(()=>({limit:vi.fn(),compare:vi.fn(),disconnect:vi.fn(),db:{
 $queryRaw:vi.fn(),$transaction:vi.fn(),user:{findUniqueOrThrow:vi.fn()},
 userTwoFactor:{findUnique:vi.fn(),upsert:vi.fn(),update:vi.fn()},
 authTwoFactorChallenge:{findUnique:vi.fn(),create:vi.fn(),update:vi.fn(),deleteMany:vi.fn()},
 userSession:{findFirst:vi.fn(),findMany:vi.fn(),updateMany:vi.fn(),update:vi.fn(),create:vi.fn()},
 authIdentity:{upsert:vi.fn()},loginEvent:{findFirst:vi.fn(),create:vi.fn()},
}}));
vi.mock('@/db',()=>({default:mocks.db}));
vi.mock('bcrypt',()=>({default:{compare:mocks.compare}}));
vi.mock('@/utils/auth-session-sockets',()=>({disconnectAuthSession:mocks.disconnect}));
vi.mock('@/utils/auth-security',async original=>({...await original<any>(),consumeAuthRateLimit:mocks.limit}));
import {beginTwoFactorLogin,twoFactorChallengeIdentity,beginTwoFactorSetup,confirmTwoFactorSetup,changeTwoFactor,startAuthSession} from '@/services/v1/auth';
import {encryptTwoFactorSecret,decryptTwoFactorSecret,hashEmailToken,twoFactorRecoveryHash} from '@/utils/auth-security';
const db=mocks.db, secret='JBSWY3DPEHPK3PXP', now=new Date('2026-10-16T12:00:00Z');
let account:any,factor:any,session:any,challenge:any;
function otp(){return new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:Date.now()});}
const metadata:any={location:null};
const proof=()=>({challengeToken:'challenge',code:otp()});
const login=()=>startAuthSession('u','PASSWORD',metadata,'SIGN_IN',undefined,proof());
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','unit-test-only-master-secret-32-characters');
 factor={userId:'u',secret:encryptTwoFactorSecret('u',secret),enabledAt:new Date(now.getTime()-60000),version:'v1',lastUsedStep:null,recoveryCodeHashes:[twoFactorRecoveryHash('u','ABCDE-FGHIJ-KLMNO-PQRST'),twoFactorRecoveryHash('u','unused')],pendingAttempts:0};
 account={id:'u',email:'ada@example.test',emailVerifiedAt:now,status:'ACTIVE',deletedAt:null,deactivatedAt:null,password:'hash',passwordChangedAt:null,googleSubject:'subject',twoFactor:factor};
 session={id:'current',provider:'PASSWORD',createdAt:now,twoFactorVerifiedAt:now};
 challenge={id:'challenge-id',userId:'u',provider:'PASSWORD',kind:'SIGN_IN',factorVersion:'v1',passwordVersion:null,expiresAt:new Date(now.getTime()+300000),attempts:0,usedAt:null};
 mocks.limit.mockResolvedValue({allowed:true});mocks.compare.mockResolvedValue(true);
 db.$transaction.mockImplementation(async work=>work(db));db.user.findUniqueOrThrow.mockImplementation(async()=>account);
 db.userTwoFactor.findUnique.mockImplementation(async()=>factor);db.userSession.findFirst.mockImplementation(async()=>session);
 db.userSession.findMany.mockResolvedValue([{id:'other'}]);db.loginEvent.findFirst.mockResolvedValue({id:'event'});
 db.userTwoFactor.upsert.mockImplementation(async args=>{factor={...factor,...args.update};account.twoFactor=factor;return factor;});
 db.userTwoFactor.update.mockImplementation(async args=>{for(const [key,value] of Object.entries(args.data)){factor[key]=value&&typeof value==='object'&&'increment' in value?factor[key]+(value as any).increment:value;}return factor;});
 db.authTwoFactorChallenge.findUnique.mockImplementation(async()=>challenge);
 db.authTwoFactorChallenge.update.mockImplementation(async args=>{if(args.data.attempts)challenge.attempts++;if(args.data.usedAt)challenge.usedAt=args.data.usedAt;return challenge;});
 db.authIdentity.upsert.mockResolvedValue({id:'identity',providerAccountId:'u'});db.userSession.create.mockResolvedValue({id:'new-session'});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('leaves accounts without enabled 2FA on their existing login flow',async()=>{account.twoFactor=null;expect(await beginTwoFactorLogin('u','PASSWORD')).toBeNull();expect(db.authTwoFactorChallenge.create).not.toHaveBeenCalled();});
it('issues only a hashed, expiring challenge bound to the first factor and source session',async()=>{
 const result=await beginTwoFactorLogin('u','GOOGLE','ACCOUNT_SWITCH','source');
 expect(result?.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(db.authTwoFactorChallenge.create).toHaveBeenCalledWith({data:expect.objectContaining({tokenHash:hashEmailToken(result!.challengeToken),provider:'GOOGLE',kind:'ACCOUNT_SWITCH',sourceSessionId:'source',factorVersion:'v1',expiresAt:new Date(now.getTime()+300000)})});
 expect(await twoFactorChallengeIdentity('challenge')).toEqual({userId:'u',provider:'PASSWORD',kind:'SIGN_IN'});
});
it.each(['challenge','verify','manage'])('fails closed on account rate limits for %s',async action=>{
 mocks.limit.mockResolvedValue({allowed:false,retryAfter:45});
 const call=action==='challenge'?()=>beginTwoFactorLogin('u','PASSWORD'):action==='verify'?login:()=>changeTwoFactor('u','current','disable',otp(),'password');
 await expect(call()).rejects.toMatchObject({status:429,retryAfter:45});expect(db.$transaction).not.toHaveBeenCalled();
});
it.each(['missing','used','attempts','expired'])('rejects %s challenge identities',async state=>{
 if(state==='missing')challenge=null;else if(state==='used')challenge.usedAt=now;else if(state==='attempts')challenge.attempts=5;else challenge.expiresAt=now;
 await expect(twoFactorChallengeIdentity('challenge')).rejects.toMatchObject({status:401});
});
it('requires a proof before creating a session on an enabled account',async()=>{await expect(startAuthSession('u','PASSWORD',metadata)).rejects.toMatchObject({status:401});expect(db.userSession.create).not.toHaveBeenCalled();});
it('consumes an authenticator challenge once and stamps the new session',async()=>{
 expect(await login()).toBe('new-session');expect(challenge.usedAt).toEqual(now);expect(factor.lastUsedStep).toBe(Math.floor(+now/30000));
 expect(db.userSession.create).toHaveBeenCalledWith({data:expect.objectContaining({twoFactorVerifiedAt:now})});
 await expect(login()).rejects.toMatchObject({status:401});expect(db.userSession.create).toHaveBeenCalledTimes(1);
});
it('accepts a recovery code once, removing only its hash',async()=>{
 await startAuthSession('u','PASSWORD',metadata,'SIGN_IN',undefined,{challengeToken:'challenge',code:'ABCDE-FGHIJ-KLMNO-PQRST'});
 expect(factor.recoveryCodeHashes).toEqual([twoFactorRecoveryHash('u','unused')]);
 challenge.usedAt=null;await expect(startAuthSession('u','PASSWORD',metadata,'SIGN_IN',undefined,{challengeToken:'challenge',code:'ABCDE-FGHIJ-KLMNO-PQRST'})).rejects.toMatchObject({status:401});
});
it.each(['missing','owner','provider','kind','used','attempts','expired','disabled','version','password','unverified','status','deleted','deactivated','source'])('rejects invalid challenge binding: %s',async reason=>{
 if(reason==='missing')challenge=null;
 else if(reason==='owner')challenge.userId='other';else if(reason==='provider')challenge.provider='GOOGLE';else if(reason==='kind')challenge.kind='ACCOUNT_SWITCH';
 else if(reason==='used')challenge.usedAt=now;else if(reason==='attempts')challenge.attempts=5;else if(reason==='expired')challenge.expiresAt=now;
 else if(reason==='disabled')factor.enabledAt=null;else if(reason==='version')factor.version='changed';else if(reason==='password')account.passwordChangedAt=now;
 else if(reason==='unverified')account.emailVerifiedAt=null;else if(reason==='status')account.status='BANNED';else if(reason==='deleted')account.deletedAt=now;else if(reason==='deactivated')account.deactivatedAt=now;
 else {challenge.sourceSessionId='old';session=null;}
 await expect(login()).rejects.toMatchObject({status:401});expect(db.userSession.create).not.toHaveBeenCalled();
});
it('accepts a valid account switch source but rejects replayed authenticator steps and missing secrets',async()=>{
 challenge.sourceSessionId='current';expect(await login()).toBe('new-session');challenge.usedAt=null;
 await expect(login()).rejects.toMatchObject({status:401});factor.secret=null;await expect(login()).rejects.toMatchObject({status:401});
});
it('sets up encrypted pending credentials without enabling enforcement',async()=>{
 factor.enabledAt=null;const result=await beginTwoFactorSetup('u','current','password');
 expect(result.uri).toContain('otpauth://totp/');expect(decryptTwoFactorSecret('u',factor.pendingSecret)).toBe(result.secret);
 expect(factor.pendingSecret).not.toBe(result.secret);expect(factor.enabledAt).toBeNull();expect(factor.pendingSessionId).toBe('current');
});
it.each(['session','missing-session','unverified','status','deleted','deactivated','unstamped','oldstamp','password','wrong-password','already-enabled'])('requires a healthy reauthenticated session to configure 2FA: %s',async reason=>{
 if(reason==='session')session=null;else if(reason==='unverified')account.emailVerifiedAt=null;else if(reason==='status')account.status='BANNED';else if(reason==='deleted')account.deletedAt=now;else if(reason==='deactivated')account.deactivatedAt=now;
 else if(reason==='unstamped')session.twoFactorVerifiedAt=null;else if(reason==='oldstamp')session.twoFactorVerifiedAt=new Date(0);else if(reason==='wrong-password')mocks.compare.mockResolvedValue(false);
 await expect(beginTwoFactorSetup('u',reason==='missing-session'?undefined:'current',reason==='password'?undefined:'password')).rejects.toMatchObject({status:reason==='already-enabled'?409:['password','wrong-password'].includes(reason)?403:401});
});
it.each(['provider','old','event','valid'])('requires a fresh Google sign-in for passwordless accounts: %s',async reason=>{
 account.password=null;factor.enabledAt=null;session.provider=reason==='provider'?'PASSWORD':'GOOGLE';
 if(reason==='old')session.createdAt=new Date(0);if(reason==='event')db.loginEvent.findFirst.mockResolvedValue(null);
 if(reason==='valid')expect(await beginTwoFactorSetup('u','current')).toHaveProperty('setupId');else await expect(beginTwoFactorSetup('u','current')).rejects.toMatchObject({status:403});
});
async function pending(){factor.enabledAt=null;factor.pendingSecret=encryptTwoFactorSecret('u',secret);factor.pendingId='setup';factor.pendingSessionId='current';factor.pendingExpiresAt=new Date(+now+600000);}
it('enables only after confirmation, hashes recovery codes and revokes other sessions',async()=>{
 await pending();const result=await confirmTwoFactorSetup('u','current','setup',otp());
 expect(result.enabled).toBe(true);expect(result.recoveryCodes).toHaveLength(10);expect(factor.recoveryCodeHashes).toEqual(result.recoveryCodes.map(code=>twoFactorRecoveryHash('u',code)));
 expect(factor.pendingSecret).toBeNull();expect(factor.enabledAt).toEqual(now);expect(mocks.disconnect).toHaveBeenCalledWith('other');expect(db.userSession.update).toHaveBeenCalledWith({where:{id:'current'},data:{twoFactorVerifiedAt:now}});
});
it.each(['session','missing-session','factor','secret','setup','owner','expiry','expired','attempts','enabled','code','malformed'])('rejects invalid setup confirmation: %s',async reason=>{
 await pending();if(reason==='session')session=null;else if(reason==='factor')factor=null;else if(reason==='secret')factor.pendingSecret=null;else if(reason==='setup')factor.pendingId='different';else if(reason==='owner')factor.pendingSessionId='other';else if(reason==='expiry')factor.pendingExpiresAt=null;else if(reason==='expired')factor.pendingExpiresAt=now;else if(reason==='attempts')factor.pendingAttempts=5;else if(reason==='enabled')factor.enabledAt=now;
 await expect(confirmTwoFactorSetup('u',reason==='missing-session'?undefined:'current','setup',reason==='code'?'000000':reason==='malformed'?'invalid':otp())).rejects.toMatchObject({status:400});expect(db.userSession.update).not.toHaveBeenCalled();
});
it.each(['disable','recovery-codes'] as const)('reauthenticates and applies %s, disconnecting other sessions',async action=>{
 const old=factor.recoveryCodeHashes.slice();const result=await changeTwoFactor('u','current',action,otp(),'password');
 expect(result.enabled).toBe(action!=='disable');expect(mocks.disconnect).toHaveBeenCalledWith('other');
 if(action==='disable'){expect(factor.secret).toBeNull();expect(factor.recoveryCodeHashes).toEqual([]);}else{expect(result.recoveryCodes).toHaveLength(10);expect(factor.recoveryCodeHashes).not.toEqual(old);}
});
it('refuses disabled factors or invalid codes without revoking sessions',async()=>{
 factor.enabledAt=null;await expect(changeTwoFactor('u','current','disable',otp(),'password')).rejects.toMatchObject({status:409});
 factor.enabledAt=new Date(+now-60000);await expect(changeTwoFactor('u','current','disable','invalid','password')).rejects.toMatchObject({status:400});expect(db.userSession.updateMany).not.toHaveBeenCalled();
});
