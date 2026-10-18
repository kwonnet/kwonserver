import {it, expect} from 'vitest';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';

it('aligns catalog bonuses progressively while preserving prices, personal offers and repeatability', async () => {
 const client=new Client({connectionString:process.env.DATABASE_URL});
 await client.connect();
 try {
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA coin_bonus_probe');
  await client.query('SET LOCAL search_path TO coin_bonus_probe');
  await client.query(`CREATE TABLE "CoinPackage" (
   id text PRIMARY KEY, name text, bonus numeric, "ngnBonus" numeric,
   amount numeric DEFAULT 30, price numeric DEFAULT 0.42, "ngnPrice" numeric DEFAULT 560,
   "userId" text, "updatedAt" timestamp DEFAULT '2020-01-01'
  )`);
  const names=['Starter','Bronze','Silver','Gold','Elite','Pro','Mega','Ultra','Master','Legend','Titan','Giant','Colossal','Zenith','Infinity'];
  for(const [index,name] of names.entries()) {
   await client.query('INSERT INTO "CoinPackage" (id,name,bonus,"ngnBonus") VALUES ($1,$2,7432,5333)',[String(index),`${name} Pack`]);
  }
  await client.query(`INSERT INTO "CoinPackage" (id,name,bonus,"ngnBonus","userId") VALUES ('personal','Starter Pack',25,12,'user'),('custom','Custom Pack',7,3,NULL)`);
  const sql=readFileSync('prisma/migrations/20261018070000_align_coin_package_bonuses/migration.sql','utf8');
  await client.query(sql);
  const rows=(await client.query('SELECT * FROM "CoinPackage" ORDER BY id')).rows;
  for(const [index] of names.entries()) {
   const row=rows.find(row=>row.id===String(index));
   expect(Number(row.bonus)).toBe((index+1)*10);
   expect(row.ngnBonus).toBe(row.bonus);
   expect([Number(row.amount),Number(row.price),Number(row.ngnPrice)]).toEqual([30,0.42,560]);
  }
  expect(rows.find(row=>row.id==='personal')).toMatchObject({bonus:'25',ngnBonus:'12'});
  expect(rows.find(row=>row.id==='custom')).toMatchObject({bonus:'7',ngnBonus:'3'});
  await client.query(sql);
  expect((await client.query('SELECT * FROM "CoinPackage" ORDER BY id')).rows).toEqual(rows);
 } finally {
  await client.query('ROLLBACK');
  await client.end();
 }
});
