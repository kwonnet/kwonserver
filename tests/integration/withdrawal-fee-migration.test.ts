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

it('converts withdrawal receive amounts exactly and rolls back incompatible historical values',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 const migration=readFileSync('prisma/migrations/20261023150000_withdrawal_receive_amount_decimal/migration.sql','utf8');
 try {
  await client.query('CREATE SCHEMA withdrawal_amount_probe');
  await client.query('SET search_path TO withdrawal_amount_probe');
  await client.query('CREATE TABLE "CoinWithdrawal" ("receiveAmount" text NOT NULL)');
  for(const value of ['14.62','8640.00','0.000000000000000001','99999999999999999999.123456789012345678'])await client.query('INSERT INTO "CoinWithdrawal" ("receiveAmount") VALUES ($1)',[value]);
  await client.query(migration);
  expect((await client.query('SELECT "receiveAmountNumeric" AS "receiveAmount" FROM "CoinWithdrawal" ORDER BY "receiveAmountNumeric"')).rows.map(row=>row.receiveAmount)).toEqual(['0.000000000000000001','14.620000000000000000','8640.000000000000000000','99999999999999999999.123456789012345678']);
  expect((await client.query('SELECT SUM("receiveAmountNumeric")::text AS total FROM "CoinWithdrawal" WHERE "receiveAmountNumeric" IN (14.62,8640)')).rows[0].total).toBe('8654.620000000000000000');
  // Both generations can insert and update while traffic rolls or rolls back.
  await client.query(`INSERT INTO "CoinWithdrawal" ("receiveAmount") VALUES ('22.50')`);
  await client.query(`UPDATE "CoinWithdrawal" SET "receiveAmount"='23.75' WHERE "receiveAmount"='22.50'`);
  expect((await client.query(`SELECT "receiveAmountNumeric" FROM "CoinWithdrawal" WHERE "receiveAmount"='23.75'`)).rows[0].receiveAmountNumeric).toBe('23.750000000000000000');
  await client.query('INSERT INTO "CoinWithdrawal" ("receiveAmountNumeric") VALUES (25.5)');
  await client.query('UPDATE "CoinWithdrawal" SET "receiveAmountNumeric"=26.5 WHERE "receiveAmountNumeric"=25.5');
  expect((await client.query('SELECT "receiveAmount" FROM "CoinWithdrawal" WHERE "receiveAmountNumeric"=26.5')).rows[0].receiveAmount).toBe('26.500000000000000000');
  await expect(client.query(`UPDATE "CoinWithdrawal" SET "receiveAmount"='1',"receiveAmountNumeric"=2`)).rejects.toThrow('Conflicting');
  await client.query('DROP TABLE "CoinWithdrawal"');
  for(const value of ['invalid','NaN','Infinity','100000000000000000000','0.0000000000000000001']){
   await client.query('CREATE TABLE "CoinWithdrawal" ("receiveAmount" text NOT NULL)');
   await client.query('INSERT INTO "CoinWithdrawal" ("receiveAmount") VALUES ($1)',[value]);
   await expect(client.query(migration)).rejects.toThrow();await client.query('ROLLBACK');
   expect((await client.query('SELECT "receiveAmount",pg_typeof("receiveAmount")::text AS type FROM "CoinWithdrawal"')).rows[0]).toEqual({receiveAmount:value,type:'text'});
   await client.query('DROP TABLE "CoinWithdrawal"');
  }
 } finally {await client.query('ROLLBACK');await client.query('SET search_path TO public');await client.query('DROP SCHEMA IF EXISTS withdrawal_amount_probe CASCADE');await client.end();}
});
