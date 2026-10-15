import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "pg";
it("recovers only legacy pools with exactly one proven debit and no historical winners", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("CREATE SCHEMA quiz_fee_migration_probe");
    await client.query("SET search_path TO quiz_fee_migration_probe");
    await client.query(`CREATE TYPE "TxnStatusEnum" AS ENUM ('PENDING','COMPLETED');
   CREATE TABLE "ChargeRate"(id TEXT PRIMARY KEY);
   CREATE TABLE "Post"(id TEXT PRIMARY KEY,"userId" TEXT);
   CREATE TABLE "Quiz"(id TEXT PRIMARY KEY,"postId" TEXT,"isPaid" BOOLEAN,"rewardAmount" DECIMAL(20,2),"maxWinners" INTEGER,"expireAt" TIMESTAMP);
   CREATE TABLE "Transaction"(id TEXT,"txnRef" TEXT,"postId" TEXT,user_id TEXT,type TEXT,category TEXT,currency TEXT,status TEXT,amount DECIMAL(20,2));
   CREATE TABLE "QuizReward"(id TEXT,"userId" TEXT,"quizId" TEXT);CREATE UNIQUE INDEX "QuizReward_userId_key" ON "QuizReward"("userId");
   CREATE TABLE "QuizParticipant"("quizId" TEXT,"isCorrect" BOOLEAN,"createdAt" TIMESTAMP);
   INSERT INTO "Post" VALUES ('good','creator'),('unfunded','creator'),('ambiguous','creator'),('already-paid','creator'),('draft','creator');
   INSERT INTO "Quiz" SELECT id,id,true,1000,2000,NOW() FROM "Post";
   INSERT INTO "QuizReward" VALUES ('old-win','winner','already-paid');
   INSERT INTO "Transaction" SELECT 't-'||id,'ref-'||id,id,'creator','DEBIT','QUIZ_POST','COINS','COMPLETED',1000 FROM "Post" WHERE id IN ('good','ambiguous','already-paid');
   INSERT INTO "Transaction" VALUES ('duplicate','second-ref','ambiguous','creator','DEBIT','QUIZ_POST','COINS','COMPLETED',1000);`);
    await client.query(
      readFileSync(
        "prisma/migrations/20261015060000_quiz_fees_rewards/migration.sql",
        "utf8",
      ),
    );
    const rows = (
      await client.query(
        'SELECT id,"settlementStatus","fundedAmount","feeAmount","fundingTxnRef" FROM "Quiz"',
      )
    ).rows;
    expect(rows.find((row) => row.id === "good")).toMatchObject({
      settlementStatus: "FUNDED",
      fundedAmount: "1000.00",
      feeAmount: "0.00",
      fundingTxnRef: "ref-good",
    });
    expect(
      rows
        .filter((row) => row.id !== "good")
        .every(
          (row) =>
            row.settlementStatus === "REVIEW" && row.fundedAmount === null,
        ),
    ).toBe(true);
    await client.query(`INSERT INTO "ChargeRate" (id) VALUES ('default')`);
    expect(
      (await client.query('SELECT "tipFee","quizFee" FROM "ChargeRate"'))
        .rows[0],
    ).toEqual({ tipFee: "0.500000", quizFee: "0.150000" });
    await expect(
      client.query(`UPDATE "ChargeRate" SET "tipFee"=1`),
    ).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK");
    await client.query(
      "DROP SCHEMA IF EXISTS quiz_fee_migration_probe CASCADE",
    );
    await client.end();
  }
});
