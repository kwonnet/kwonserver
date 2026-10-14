import {it,expect} from 'vitest';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
it('discards only legacy balances and pending rewards, preserves coin funds and gift history',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{
  await client.query('CREATE SCHEMA coin_retirement_probe');await client.query('SET search_path TO coin_retirement_probe');
  await client.query(`
   CREATE TYPE "TxnCurrencyEnum" AS ENUM ('TZX','COINS');CREATE TYPE "TxnSourceEnum" AS ENUM ('CREDIT','COINS');CREATE TYPE "RewardTypeEnum" AS ENUM ('CREDIT','COINS','BONUS');CREATE TYPE "TipSource" AS ENUM ('POST');
   CREATE TABLE "Wallet" (credit NUMERIC,coins NUMERIC,bonus NUMERIC,CONSTRAINT "Wallet_nonnegative_finite" CHECK(credit>=0 AND coins>=0 AND bonus>=0));
   CREATE TABLE "Transaction" (id TEXT,currency "TxnCurrencyEnum",source "TxnSourceEnum",status TEXT,description TEXT,"updatedAt" TIMESTAMP,"subscriptionId" TEXT,gateway TEXT);
   CREATE TABLE "RewardTip" ("txnId" TEXT,status TEXT,"updatedAt" TIMESTAMP);CREATE TABLE "Subscription"(id TEXT,"isRecurring" BOOLEAN,"updatedAt" TIMESTAMP);
   CREATE TABLE "GameMilestone"("rewardType" "RewardTypeEnum");CREATE TABLE "Task"("rewardType" "RewardTypeEnum");CREATE TABLE "GameAchievement"("rewardType" "RewardTypeEnum",amount NUMERIC);
   CREATE TABLE "GameMonthRewardStat"("creditRewardParticipants" FLOAT,"creditParticipantsScore" FLOAT,"creditShareAmount" NUMERIC);
   CREATE TABLE "TipPackage"(id TEXT PRIMARY KEY,name TEXT,thumbnail TEXT,price NUMERIC);
   CREATE TABLE "PostTip"("tipId" TEXT NOT NULL,"coinsAmount" NUMERIC,CONSTRAINT "PostTip_tipId_fkey" FOREIGN KEY("tipId") REFERENCES "TipPackage"(id) ON DELETE CASCADE);
   INSERT INTO "Wallet" VALUES(1000,80,5);
   INSERT INTO "Transaction" VALUES('pending','TZX','CREDIT','PENDING','old',NOW(),'sub','WALLET'),('completed','TZX','CREDIT','COMPLETED','old',NOW(),NULL,'WALLET'),('coins','COINS','COINS','PENDING','coins',NOW(),NULL,'WALLET');
   INSERT INTO "RewardTip" VALUES('pending','PENDING',NOW());INSERT INTO "Subscription" VALUES('sub',true,NOW());
   INSERT INTO "GameMilestone" VALUES('CREDIT');INSERT INTO "Task" VALUES('CREDIT');INSERT INTO "GameAchievement" VALUES('CREDIT',10);
   INSERT INTO "TipPackage" VALUES('old','Old Star','/old.png',20);INSERT INTO "PostTip" VALUES('old',NULL);
  `);
  await client.query(readFileSync('prisma/migrations/20261014150000_coin_only_gifts/migration.sql','utf8'));
  expect((await client.query('SELECT * FROM "Wallet"')).rows[0]).toEqual({coins:'80',bonus:'5'});
  expect((await client.query('SELECT status FROM "RewardTip"')).rows[0].status).toBe('EXPIRED');
  expect((await client.query('SELECT "isRecurring" FROM "Subscription"')).rows[0].isRecurring).toBe(false);
  expect((await client.query('SELECT currency,status FROM "Transaction" WHERE id=\'pending\'')).rows[0]).toEqual({currency:'RETIRED',status:'FAILED'});
  expect((await client.query('SELECT currency,status FROM "Transaction" WHERE id=\'coins\'')).rows[0]).toEqual({currency:'COINS',status:'PENDING'});
  await client.query('DELETE FROM "TipPackage"');expect((await client.query('SELECT * FROM "PostTip"')).rows[0]).toMatchObject({tipId:null,giftName:'Old Star',giftThumbnail:'/old.png',giftCoinsSnapshot:'20.00',coinsAmount:null});
 }finally{await client.query('ROLLBACK');await client.query('DROP SCHEMA IF EXISTS coin_retirement_probe CASCADE');await client.end();}
});
