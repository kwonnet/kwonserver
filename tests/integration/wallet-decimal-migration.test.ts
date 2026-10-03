import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
it('aborts the decimal migration rather than rounding a historical fractional-cent balance',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{
  await client.query('CREATE SCHEMA wallet_migration_probe');
  await client.query('SET search_path TO wallet_migration_probe');
  await client.query('CREATE TABLE "Wallet" (credit double precision, coins double precision, bonus double precision)');
  await client.query('INSERT INTO "Wallet" VALUES (1.001, 2, 0)');
  const sql=readFileSync('prisma/migrations/20261003110000_exact_wallet_amounts/migration.sql','utf8');
  await expect(client.query(sql)).rejects.toThrow('Reconcile Wallet.credit before decimal migration');
  await client.query('ROLLBACK');
  expect((await client.query('SELECT credit FROM "Wallet"')).rows[0].credit).toBe(1.001);
 }finally{
  await client.query('ROLLBACK');await client.query('DROP SCHEMA IF EXISTS wallet_migration_probe CASCADE');await client.end();
 }
});
