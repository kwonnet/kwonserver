import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
it('backfills email methods only for matching consumed withdrawal challenges',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  await client.query('CREATE SCHEMA withdrawal_auth_probe');await client.query('SET search_path TO withdrawal_auth_probe');
  await client.query('CREATE TABLE "CoinWithdrawal" (id text,"userId" text,"authorizationMethod" text,"otpVerifiedAt" timestamp,"authorizationFactorVersion" text,"authorizationCodeHash" text,"otpChallengeId" text)');
  await client.query('CREATE TABLE "AuthEmailToken" (id text,"userId" text,"subjectId" text,purpose text,"usedAt" timestamp)');
  for(const id of ['verified','unused','unverified','wrong-user','wrong-subject','wrong-purpose','authenticator','missing','proof']){
   await client.query('INSERT INTO "CoinWithdrawal" VALUES ($1,$2,$3,$4,$5,$6,$1)',[id,'user',id==='authenticator'?'AUTHENTICATOR':null,id==='unverified'?null:new Date(),id==='proof'?'factor':null,id==='proof'?'hash':null]);
   if(id!=='missing')await client.query('INSERT INTO "AuthEmailToken" VALUES ($1,$2,$3,$4,$5)',[id,id==='wrong-user'?'other':'user',id==='wrong-subject'?'other':id,id==='wrong-purpose'?'VERIFY_EMAIL':'WITHDRAWAL_OTP',id==='unused'?null:new Date()]);
  }
  const migration=readFileSync('prisma/migrations/20261023160000_withdrawal_email_authorization/migration.sql','utf8');
  await client.query(migration);await client.query(migration);
  const rows=(await client.query('SELECT id,"authorizationMethod" FROM "CoinWithdrawal"')).rows;
  expect(rows.find(row=>row.id==='verified').authorizationMethod).toBe('EMAIL');
  expect(rows.find(row=>row.id==='authenticator').authorizationMethod).toBe('AUTHENTICATOR');
  for(const row of rows.filter(row=>!['verified','authenticator'].includes(row.id)))expect(row.authorizationMethod).toBeNull();
 }finally{await client.query('SET search_path TO public');await client.query('DROP SCHEMA IF EXISTS withdrawal_auth_probe CASCADE');await client.end();}
});
