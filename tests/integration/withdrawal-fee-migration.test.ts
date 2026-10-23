import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
it('backfills only complete compatible fee evidence without casting malformed historic JSON',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  await client.query('CREATE SCHEMA withdrawal_fee_probe');
  await client.query('SET search_path TO withdrawal_fee_probe');
  await client.query('CREATE TABLE "CoinWithdrawal" (id text PRIMARY KEY,gateway text,status text,currency text,"providerData" jsonb,"receiveCurrency" text,"receiveAmount" text)');
  const rows: Array<[string,string,string,string,Record<string,unknown>,string,string]> = [
   ['bachs','BACHS','SUCCEEDED','USD',{fundingAmount:'8.25',sourceAmount:'6.18',recoveryAmount:'1.07',recovered:true},'USDT_BEP20','6.18'],
   ['pending','BACHS','PROCESSING','USD',{fundingAmount:'8.25',sourceAmount:'6.18',recoveryAmount:'1.07',recovered:false},'USDT_BEP20','6.18'],
   ['bad','BACHS','SUCCEEDED','USD',{fundingAmount:'oops',sourceAmount:'6.18',recoveryAmount:'1.07',recovered:true},'USDT_BEP20','6.18'],
   ['negative','BACHS','SUCCEEDED','USD',{fundingAmount:'1',sourceAmount:'6.18',recoveryAmount:'1.07',recovered:true},'USDT_BEP20','6.18'],
   ['native','FLUTTERWAVE','SUCCEEDED','USD',{request:{amount:16.12,currency:'USDC',debit_currency:'USDC'}},'USDC','14.62'],
   ['fx','FLUTTERWAVE','SUCCEEDED','USD',{request:{amount:14.62,currency:'USDC',debit_currency:'USD'}},'USDC','14.62'],
  ];
  for(const row of rows)await client.query({text:'INSERT INTO "CoinWithdrawal" VALUES ($1,$2,$3,$4,$5,$6,$7)',values:row});
  await client.query(readFileSync('prisma/migrations/20261023130000_withdrawal_provider_fees/migration.sql','utf8'));
  const result=(await client.query('SELECT * FROM "CoinWithdrawal" ORDER BY id')).rows;
  expect(result.find(row=>row.id==='bachs')).toMatchObject({providerFee:'1.000000000000',providerFeeCurrency:'USD',providerFeeSource:'RECOVERED_BALANCE'});
  for(const id of ['pending','bad','negative','fx'])expect(result.find(row=>row.id===id).providerFee).toBeNull();
  expect(result.find(row=>row.id==='native')).toMatchObject({providerFee:null,estimatedProviderFee:'1.500000000000',estimatedProviderFeeCurrency:'USDC'});
  expect(result.find(row=>row.id==='fx').estimatedProviderFee).toBeNull();
 } finally {await client.query('SET search_path TO public');await client.query('DROP SCHEMA IF EXISTS withdrawal_fee_probe CASCADE');await client.end();}
});
