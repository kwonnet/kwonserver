import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import bcrypt from 'bcrypt';
import {readFileSync} from 'node:fs';
vi.mock('@/services/email',()=>({enqueueEmailMessage:vi.fn()}));
import {createUser,loginUser,requestAuthEmail,consumeAuthEmail,startAuthSession,validateAuthSession} from '@/services/v1/auth';
import {decryptEmailToken,hashEmailToken} from '@/utils/auth-security';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const prefix='auth-email-actions-';let credential:string,provider:string;
const metadata:any={device:{type:'unknown',browser:null,browserVersion:null,os:null,osVersion:null},location:null,ipAddress:null,ipHash:null,metadataSource:'API_REQUEST'};
beforeAll(async()=>{
 const created=await createUser({name:'Verification User',email:`${prefix}credential@test.invalid`,password:'old-password'});
 expect(created.status).toBe(200);credential=(created.data as any).id;
 provider=(await db.user.create({data:{name:'Google user',username:prefix+'google',email:prefix+'google@test.invalid',googleSubject:prefix+'subject',emailVerifiedAt:new Date()}})).id;
});
afterAll(async()=>{await db.transaction.deleteMany({where:{userId:credential}});await db.user.deleteMany({where:{id:{in:[credential,provider]}}});await db.$disconnect();});
it('creates credentials without verification, queues verification, rejects login, and consumes the link exactly once',async()=>{
 const user=await db.user.findUniqueOrThrow({where:{id:credential}});expect(user.emailVerifiedAt).toBeNull();
 expect((await loginUser({email:user.email,password:'old-password'})).status).toBe(403);
 const mail=await db.emailMessage.findFirstOrThrow({where:{userId:credential}});expect(mail.kind).toBe('VERIFY_EMAIL');
 const action=await db.authEmailToken.findUniqueOrThrow({where:{id:mail.actionTokenId!}});
 const token=decryptEmailToken(action.encryptedToken);expect(action.tokenHash).toBe(hashEmailToken(token));expect(action.encryptedToken).not.toContain(token);
 expect((await consumeAuthEmail(token,'PASSWORD_RESET','new-password')).status).toBe(400);
 const results=await Promise.all([consumeAuthEmail(token,'VERIFY_EMAIL'),consumeAuthEmail(token,'VERIFY_EMAIL')]);expect(results.map(result=>result.status).sort()).toEqual([200,400]);
 expect((await db.user.findUniqueOrThrow({where:{id:credential}})).emailVerifiedAt).toBeInstanceOf(Date);
 expect((await loginUser({email:user.email,password:'old-password'})).status).toBe(200);
 expect(await db.emailMessage.count({where:{userId:credential,kind:'WELCOME'}})).toBe(1);
});
it('resets accounts with a password, revokes sessions and rejects expired, reused and provider-only links',async()=>{
 expect((await requestAuthEmail(prefix+'google@test.invalid','PASSWORD_RESET')).status).toBe(400);
 expect(await db.authEmailToken.count({where:{userId:provider}})).toBe(0);
 expect((await requestAuthEmail('unknown@test.invalid','PASSWORD_RESET')).status).toBe(202);
 const session=await startAuthSession(credential,'PASSWORD',metadata);
 expect((await requestAuthEmail(prefix+'credential@test.invalid','PASSWORD_RESET')).status).toBe(202);
 const action=await db.authEmailToken.findFirstOrThrow({where:{userId:credential,purpose:'PASSWORD_RESET'}}),token=decryptEmailToken(action.encryptedToken);
 await requestAuthEmail(prefix+'credential@test.invalid','PASSWORD_RESET');expect(await db.authEmailToken.count({where:{userId:credential,purpose:'PASSWORD_RESET'}})).toBe(1);
 expect((await consumeAuthEmail(token,'PASSWORD_RESET','new-password')).status).toBe(200);
 expect((await consumeAuthEmail(token,'PASSWORD_RESET','another-password')).status).toBe(400);
 expect(await validateAuthSession({id:credential,sessionId:session})).toBe(false);
 expect(await bcrypt.compare('new-password',(await db.user.findUniqueOrThrow({where:{id:credential}})).password!)).toBe(true);
 expect(await db.emailMessage.count({where:{userId:credential,kind:'PASSWORD_CHANGED'}})).toBe(1);
 await db.authEmailToken.updateMany({where:{userId:credential,purpose:'PASSWORD_RESET'},data:{createdAt:new Date(Date.now()-61000)}});
 await requestAuthEmail(prefix+'credential@test.invalid','PASSWORD_RESET');
 const expired=await db.authEmailToken.findFirstOrThrow({where:{userId:credential,purpose:'PASSWORD_RESET',usedAt:null}});
 await db.authEmailToken.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1000)}});
 expect((await consumeAuthEmail(decryptEmailToken(expired.encryptedToken),'PASSWORD_RESET','again-password')).status).toBe(400);
});

it('migrates legacy verification flags without losing existing dates and verifies all pre-existing emails at account creation',async()=>{
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe(`CREATE TEMP TABLE "User" (id TEXT, "createdAt" TIMESTAMP(3), "googleSubject" TEXT, "isVerified" BOOLEAN, "identityVerified" BOOLEAN, "accountVerified" BOOLEAN, "verifiedAt" TIMESTAMP(3), "identityVerifiedAt" TIMESTAMP(3), "accountVerifiedAt" TIMESTAMP(3)) ON COMMIT DROP`);
  await tx.$executeRawUnsafe(`INSERT INTO "User" VALUES ('verified','2025-01-01',NULL,true,true,true,'2025-02-01',NULL,'2025-03-01'), ('unverified','2025-01-01',NULL,false,false,false,NULL,NULL,NULL), ('oauth','2025-01-01','subject',false,false,false,NULL,NULL,NULL)`);
  const prefix=readFileSync('prisma/migrations/20261008000000_auth_email_verification/migration.sql','utf8').split('CREATE TABLE')[0];
  for(const statement of prefix.split(';').map(text=>text.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
  const rows=await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "User" ORDER BY id`);
  expect(rows[0].emailVerifiedAt).toBeInstanceOf(Date);
  expect(rows[1]).toMatchObject({id:'unverified',identityVerifiedAt:null,accountVerifiedAt:null});
  expect(rows[1].emailVerifiedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  expect(rows[2].emailVerifiedAt.toISOString()).toBe('2025-02-01T00:00:00.000Z');
  expect(rows[2].accountVerifiedAt.toISOString()).toBe('2025-03-01T00:00:00.000Z');
  expect(rows[2].identityVerifiedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  expect(rows[2]).not.toHaveProperty('isVerified');
 });
});
