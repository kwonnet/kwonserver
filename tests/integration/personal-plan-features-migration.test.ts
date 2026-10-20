import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';

it('updates Personal plan features, fills missing groups and preserves other plans on replay',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});
 await client.connect();
 try {
  await client.query('CREATE SCHEMA personal_features_probe');
  await client.query('SET search_path TO personal_features_probe');
  await client.query('CREATE TABLE "SubscriptionPlan" (id TEXT PRIMARY KEY, name TEXT, "accountType" TEXT, price NUMERIC, level INTEGER)');
  await client.query('CREATE TABLE "PlanFeature" (id TEXT PRIMARY KEY, name TEXT, items JSONB[], "planId" TEXT REFERENCES "SubscriptionPlan"(id))');
  await client.query(`INSERT INTO "SubscriptionPlan" VALUES ('starter','Starter','PERSONAL',3.99,1),('premium','Premium','PERSONAL',8.99,2),('supreme','Supreme','PERSONAL',35.99,3),('business','Premium','BUSINESS',229.99,2),('government','Pro','GOVERNMENT',67.99,3)`);
  await client.query(`INSERT INTO "PlanFeature" VALUES ('existing-starter','Exclusive Experience',ARRAY['{"id":"old","title":"Old feature","label":"Small"}'::jsonb],'starter'),('existing-business','Exclusive Experience',ARRAY['{"id":"business-item","title":"Priority support","label":""}'::jsonb],'business')`);
  const plans=(await client.query('SELECT * FROM "SubscriptionPlan" ORDER BY id')).rows;
  const business=(await client.query('SELECT * FROM "PlanFeature" WHERE "planId" = $1',['business'])).rows;
  const sql=readFileSync('prisma/migrations/20261020140000_personal_plan_features/migration.sql','utf8');
  await client.query(sql);
  const first=(await client.query('SELECT * FROM "PlanFeature" ORDER BY id')).rows;
  for(const [id,exposure,share,fee,boost] of [['starter','Standard','High','Low','5%'],['premium','Enhanced','Higher','Lower','10%'],['supreme','Maximum','Highest','Lowest','15%']]) {
   const groups=first.filter(row=>row.planId===id);
   expect(groups).toHaveLength(1);
   expect(groups[0].items.map(({title,label}:any)=>({title,label}))).toEqual([
    {title:'Post exposure',label:exposure}, {title:'Receive post tips',label:share},
    {title:'Receive account gifts',label:share}, {title:'Receive chat gifts',label:share},
    {title:'Post quiz fees',label:fee}, {title:'Characters per post',label:'Extended'},
    {title:'Game points boost',label:boost},
   ]);
   expect(new Set(groups[0].items.map((item:any)=>item.id)).size).toBe(7);
  }
  expect(first.find(row=>row.planId==='starter').id).toBe('existing-starter');
  expect(first.filter(row=>row.planId==='business')).toEqual(business);
  expect((await client.query('SELECT * FROM "SubscriptionPlan" ORDER BY id')).rows).toEqual(plans);
  await client.query(sql);
  expect((await client.query('SELECT * FROM "PlanFeature" ORDER BY id')).rows).toEqual(first);
 } finally {
  await client.query('ROLLBACK');
  await client.query('SET search_path TO public');
  await client.query('DROP SCHEMA IF EXISTS personal_features_probe CASCADE');
  await client.end();
 }
});
