import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {once} from 'node:events';
import bcrypt from 'bcrypt';
import {TOTP,Secret} from 'otpauth';
const verifyGoogle=vi.hoisted(()=>vi.fn());
vi.mock('google-auth-library',()=>({OAuth2Client:class{verifyIdToken=verifyGoogle;}}));
vi.mock('@/services/email',()=>({enqueueEmailMessage:vi.fn()}));
vi.mock('@/utils/auth-session-sockets',()=>({disconnectAuthSession:vi.fn()}));
vi.mock('@/utils/webpush',()=>({default:{}}));
import prisma from '@/db';
import redis from '@/redis';
import {beginTwoFactorLogin,beginTwoFactorSetup,confirmTwoFactorSetup,changeTwoFactor,startAuthSession,validateAuthSession,twoFactorChallengeIdentity,getAccountSettings} from '@/services/v1/auth';
import {googleSignInController,signInController,refreshTokenController,verifyTwoFactorLoginController} from '@/controllers/v1/auth';
import {generateToken} from '@/utils';
import {hashEmailToken,decryptTwoFactorSecret} from '@/utils/auth-security';
import {response} from '../unit/fixtures';
let userId:string,current:string,other:string,passwordHash:string;
const prefix='integration-2fa-',password='correct-password';
const metadata={device:{type:'unknown',browser:null,browserVersion:null,os:null,osVersion:null},location:null,ipAddress:null,ipHash:null,metadataSource:'API_REQUEST'};
function token(secret:string,offset=0){return new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:Date.now()+offset*30000});}
async function enroll(){const setup=await beginTwoFactorSetup(userId,current,password);const result=await confirmTwoFactorSetup(userId,current,setup.setupId,token(setup.secret));return {...setup,...result};}
async function challenge(provider:'PASSWORD'|'GOOGLE'='PASSWORD',kind='SIGN_IN',source?:string){return (await beginTwoFactorLogin(userId,provider,kind,source))!;}
async function finish(challengeToken:string,code:string,provider:'PASSWORD'|'GOOGLE'='PASSWORD',kind='SIGN_IN'){return await startAuthSession(userId,provider,metadata,kind,randomUUID(),{challengeToken,code});}
beforeAll(async()=>{vi.stubEnv('AUTH_GOOGLE_ID','integration-client');passwordHash=await bcrypt.hash(password,4);if(!redis.isReady)await once(redis,'ready');});
beforeEach(async()=>{
 const id=randomUUID();userId=(await prisma.user.create({data:{name:'Security Test',username:prefix+id,email:prefix+id+'@test.invalid',password:passwordHash,googleSubject:id,emailVerifiedAt:new Date()}})).id;
 current=await startAuthSession(userId,'PASSWORD',metadata);other=await startAuthSession(userId,'GOOGLE',metadata);
});
afterAll(async()=>{await prisma.user.deleteMany({where:{username:{startsWith:prefix}}});await prisma.$disconnect();await redis.quit();vi.unstubAllEnvs();});
it('is off by default and does not challenge password or Google accounts until enrollment is confirmed',async()=>{
 expect((await getAccountSettings(userId,current)).twoFactor.enabled).toBe(false);
 expect(await beginTwoFactorLogin(userId,'PASSWORD')).toBeNull();expect(await beginTwoFactorLogin(userId,'GOOGLE')).toBeNull();
 const setup=await beginTwoFactorSetup(userId,current,password);
 expect(await beginTwoFactorLogin(userId,'PASSWORD')).toBeNull();
 const factor=await prisma.userTwoFactor.findUniqueOrThrow({where:{userId}});
 expect(factor.enabledAt).toBeNull();expect(factor.pendingSecret).not.toContain(setup.secret);expect(setup.uri).toMatch(/^otpauth:\/\/totp\/Kwonnet/);
 expect(()=>decryptTwoFactorSecret('another-account',factor.pendingSecret!)).toThrow();
});
it('requires primary reauthentication, binds pending setup to its session, and persists failed setup attempts',async()=>{
 await expect(beginTwoFactorSetup(userId,current,'wrong')).rejects.toThrow('password');
 const setup=await beginTwoFactorSetup(userId,current,password);
 await expect(confirmTwoFactorSetup(userId,other,setup.setupId,token(setup.secret))).rejects.toThrow('expired');
 await expect(confirmTwoFactorSetup(userId,current,setup.setupId,'not-a-code')).rejects.toThrow('Invalid');
 expect((await prisma.userTwoFactor.findUniqueOrThrow({where:{userId}})).pendingAttempts).toBe(1);
 await prisma.userTwoFactor.update({where:{userId},data:{pendingExpiresAt:new Date(0)}});
 await expect(confirmTwoFactorSetup(userId,current,setup.setupId,token(setup.secret))).rejects.toThrow('expired');
});
it('enables atomically, stores only recovery hashes, revokes other sessions and blocks legacy tokens',async()=>{
 const result=await enroll();expect(result.recoveryCodes).toHaveLength(10);
 const factor=await prisma.userTwoFactor.findUniqueOrThrow({where:{userId}});
 expect(factor.enabledAt).toBeInstanceOf(Date);expect(factor.pendingSecret).toBeNull();expect(factor.recoveryCodeHashes).toHaveLength(10);
 expect(JSON.stringify(factor)).not.toContain(result.recoveryCodes[0]);expect(JSON.stringify(factor)).not.toContain(result.secret);
 expect(await validateAuthSession({id:userId,sessionId:current})).toBe(true);expect(await validateAuthSession({id:userId,sessionId:other})).toBe(false);expect(await validateAuthSession({id:userId})).toBe(false);
 await expect(startAuthSession(userId,'PASSWORD',metadata)).rejects.toThrow('required');await expect(startAuthSession(userId,'GOOGLE',metadata)).rejects.toThrow('required');
});
it('returns a password-login challenge without access tokens, cookies or new sessions, then issues only after proof',async()=>{
 const setup=await enroll(),before=await prisma.userSession.count({where:{userId}});
 const res=response();await signInController({body:{email:(await prisma.user.findUniqueOrThrow({where:{id:userId}})).email,password},ip:'127.0.0.1'} as any,res);
 expect(res.statusCode).toBe(202);expect(res.body.twoFactorRequired).toBe(true);expect(res.body.accessToken).toBeUndefined();expect(res.cookie).not.toHaveBeenCalled();expect(await prisma.userSession.count({where:{userId}})).toBe(before);
 const verified=response();await verifyTwoFactorLoginController({body:{challengeToken:res.body.challengeToken,code:token(setup.secret,1)},ip:'127.0.0.1'} as any,verified);
 expect(verified.statusCode).toBe(200);expect(verified.body.accessToken).toEqual(expect.any(String));expect(verified.body.user.id).toBe(userId);
 expect(await validateAuthSession({id:userId,sessionId:verified.body.user.sessionId})).toBe(true);
});
it('enforces Google challenges, rejects authenticator replay across challenges and stores no raw challenge tokens',async()=>{
 const setup=await enroll(),first=await challenge('GOOGLE'),second=await challenge('GOOGLE');
 expect((await prisma.authTwoFactorChallenge.findUniqueOrThrow({where:{tokenHash:hashEmailToken(first.challengeToken)}})).tokenHash).not.toBe(first.challengeToken);
 await finish(first.challengeToken,token(setup.secret,1),'GOOGLE');
 await expect(finish(second.challengeToken,token(setup.secret,1),'GOOGLE')).rejects.toThrow('already used');
 await expect(finish(first.challengeToken,setup.recoveryCodes[0],'GOOGLE')).rejects.toThrow('already used');
});
it('consumes a recovery code once under concurrent sign-ins and consumes each challenge once',async()=>{
 const setup=await enroll(),a=await challenge(),b=await challenge();
 const results=await Promise.allSettled([finish(a.challengeToken,setup.recoveryCodes[0]),finish(b.challengeToken,setup.recoveryCodes[0])]);
 expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect(results.filter(row=>row.status==='rejected')).toHaveLength(1);
 expect((await getAccountSettings(userId,current)).twoFactor.recoveryCodesRemaining).toBe(9);
});
it('rejects expired challenges and commits failed-attempt counters without creating sessions',async()=>{
 await enroll();const bad=await challenge(),before=await prisma.userSession.count({where:{userId}});
 for(let i=0;i<5;i++)await expect(finish(bad.challengeToken,'invalid-recovery')).rejects.toThrow('Invalid');
 expect((await prisma.authTwoFactorChallenge.findUniqueOrThrow({where:{tokenHash:hashEmailToken(bad.challengeToken)}})).attempts).toBe(5);
 await expect(twoFactorChallengeIdentity(bad.challengeToken)).rejects.toThrow('expired');expect(await prisma.userSession.count({where:{userId}})).toBe(before);
 const expired=await challenge();await prisma.authTwoFactorChallenge.update({where:{tokenHash:hashEmailToken(expired.challengeToken)},data:{expiresAt:new Date(0)}});await expect(twoFactorChallengeIdentity(expired.challengeToken)).rejects.toThrow('expired');
});
it('requires 2FA for saved-account switching while allowing refresh of an already verified session',async()=>{
 const setup=await enroll(),apiToken=generateToken({id:userId,sessionId:current},{expiresIn:'24h'});
 const refresh=response();await refreshTokenController({body:{token:apiToken},ip:'127.0.0.1'} as any,refresh);expect(refresh.statusCode).toBe(200);expect(refresh.body.accessToken).toEqual(expect.any(String));
 const switched=response();await refreshTokenController({body:{token:apiToken,newSession:true},ip:'127.0.0.1'} as any,switched);expect(switched.statusCode).toBe(202);expect(switched.body.accessToken).toBeUndefined();
 await prisma.userSession.update({where:{id:current},data:{revokedAt:new Date()}});
 await expect(finish(switched.body.challengeToken,setup.recoveryCodes[0],'PASSWORD','ACCOUNT_SWITCH')).rejects.toThrow('Invalid');
});
it('invalidates pending challenges after password or factor changes',async()=>{
 const setup=await enroll(),a=await challenge();await prisma.user.update({where:{id:userId},data:{passwordChangedAt:new Date()}});
 await expect(finish(a.challengeToken,setup.recoveryCodes[0])).rejects.toThrow('Invalid');
 const b=await challenge();await prisma.userTwoFactor.update({where:{userId},data:{version:randomUUID()}});await expect(finish(b.challengeToken,setup.recoveryCodes[1])).rejects.toThrow('Invalid');
});
it('regenerates recovery codes only with both identity and factor proof, invalidating previous codes',async()=>{
 const setup=await enroll(),pending=await challenge();
 await expect(changeTwoFactor(userId,current,'recovery-codes',setup.recoveryCodes[0],'wrong')).rejects.toThrow('password');
 const changed=await changeTwoFactor(userId,current,'recovery-codes',setup.recoveryCodes[0],password);expect(changed.recoveryCodes).toHaveLength(10);expect(changed.enabled).toBe(true);
 await expect(twoFactorChallengeIdentity(pending.challengeToken)).rejects.toThrow('expired');
 const fresh=await challenge();await expect(finish(fresh.challengeToken,setup.recoveryCodes[1])).rejects.toThrow('Invalid');await finish(fresh.challengeToken,changed.recoveryCodes![0]);
});
it('disables only with a valid password and unused factor, deletes secrets and challenges, and keeps other sessions revoked',async()=>{
 const setup=await enroll(),pending=await challenge();await expect(changeTwoFactor(userId,current,'disable','invalid',password)).rejects.toThrow('Invalid');
 await changeTwoFactor(userId,current,'disable',setup.recoveryCodes[0],password);
 const stored=await prisma.userTwoFactor.findUniqueOrThrow({where:{userId}});expect(stored.secret).toBeNull();expect(stored.enabledAt).toBeNull();expect(stored.recoveryCodeHashes).toEqual([]);
 expect(await beginTwoFactorLogin(userId,'GOOGLE')).toBeNull();expect(await validateAuthSession({id:userId,sessionId:other})).toBe(false);await expect(twoFactorChallengeIdentity(pending.challengeToken)).rejects.toThrow('expired');
});
it('supports passwordless accounts only after a recent verified Google sign-in',async()=>{
 await prisma.user.update({where:{id:userId},data:{password:null}});
 await expect(beginTwoFactorSetup(userId,current)).rejects.toThrow('Google');
 const setup=await beginTwoFactorSetup(userId,other);await confirmTwoFactorSetup(userId,other,setup.setupId,token(setup.secret));
 await prisma.userSession.update({where:{id:other},data:{createdAt:new Date(Date.now()-6*60000)}});
 await expect(changeTwoFactor(userId,other,'disable',token(setup.secret,1))).rejects.toThrow('Google');
});

it('Google primary authentication also returns a challenge before issuing any account session',async()=>{
 const setup=await enroll(),user=await prisma.user.findUniqueOrThrow({where:{id:userId}}),before=await prisma.userSession.count({where:{userId}});
 verifyGoogle.mockResolvedValue({getPayload:()=>({sub:user.googleSubject,email:user.email,email_verified:true,name:user.name})});
 const result=response();await googleSignInController({body:{idToken:'signed-google-id-token'},ip:'127.0.0.1'} as any,result);
 expect(result.statusCode).toBe(202);expect(result.body.twoFactorRequired).toBe(true);expect(result.body.accessToken).toBeUndefined();expect(await prisma.userSession.count({where:{userId}})).toBe(before);
 const verified=response();await verifyTwoFactorLoginController({body:{challengeToken:result.body.challengeToken,code:setup.recoveryCodes[0]},ip:'127.0.0.1'} as any,verified);
 expect(verified.statusCode).toBe(200);expect((await prisma.userSession.findUniqueOrThrow({where:{id:verified.body.user.sessionId}})).provider).toBe('GOOGLE');
});
