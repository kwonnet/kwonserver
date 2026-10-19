import {it,expect} from 'vitest';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
it('archives obsolete reward groups without losing historical money or guessing missing audit values',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  await client.query('BEGIN; CREATE SCHEMA monthly_reward_audit_probe; SET LOCAL search_path TO monthly_reward_audit_probe');
  await client.query(`CREATE TABLE "GameMonthRewardStat" (
   id text PRIMARY KEY,"catId" text,mode text,year int,month int,
   "coinsShareAmount" numeric,"topCoinsShareAmount" numeric,"bonusShareAmount" numeric,
   "coinsRewardParticipants" float,"topCoinsRewardParticipants" float,"bonusRewardParticipants" float,
   "coinsParticipantsScore" float,"topCoinsParticipantsScore" float,"bonusParticipantsScore" float
  ); INSERT INTO "GameMonthRewardStat" VALUES ('old','cat','MULTI',2026,8,5,12,3,2,1,3,20,10,30),('duplicate','cat','MULTI',2026,8,0,0,0,0,0,0,0,0,0);`);
  await client.query('ALTER TABLE "GameMonthRewardStat" ADD COLUMN "rewardParticipants" float DEFAULT 100');
  await client.query(readFileSync('prisma/migrations/20261019100000_monthly_reward_audit/migration.sql','utf8'));
  const row=(await client.query(`SELECT * FROM "GameMonthRewardStat" WHERE id='old'`)).rows[0];
  expect(Number(row.coinsShareAmount)).toBe(17);expect(row.coinsRewardParticipants).toBe(3);
  expect(row.coinsParticipantsScore).toBe(30);expect(row.status).toBe('LEGACY_COMPLETED');
  expect(row.legacyBreakdown).toMatchObject({topCoinsShareAmount:'12',bonusShareAmount:'3',coinsShareAmount:'5'});
  expect(row.rewardPercentage).toBeNull();expect(row.rewardPoolAmount).toBeNull();expect(row.fullyAllocated).toBeNull();
  expect(row).not.toHaveProperty('bonusShareAmount');expect(row).not.toHaveProperty('topCoinsRewardParticipants');
  expect((await client.query('SELECT COUNT(*)::int AS count FROM "GameMonthRewardStat"')).rows[0].count).toBe(2);
  await client.query(`INSERT INTO "GameMonthRewardStat" (id,"catId",mode,year,month,"policyVersion") VALUES ('new','cat','MULTI',2026,9,'monthly-90-v2')`);
  await expect(client.query(`INSERT INTO "GameMonthRewardStat" (id,"catId",mode,year,month,"policyVersion") VALUES ('new2','cat','MULTI',2026,9,'monthly-90-v2')`)).rejects.toMatchObject({code:'23505'});
 } finally {await client.query('ROLLBACK');await client.end();}
});
