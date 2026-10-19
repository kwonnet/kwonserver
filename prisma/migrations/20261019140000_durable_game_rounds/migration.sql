CREATE TABLE "GameRoundRecord" (
 id TEXT PRIMARY KEY, "roomId" TEXT NOT NULL, generation TEXT NOT NULL, "catId" TEXT NOT NULL,
 mode "GameMode" NOT NULL, "playedAt" TIMESTAMP(3) NOT NULL, question JSONB NOT NULL,
 snapshot JSONB, scores JSONB, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED')),
 "projectionPending" BOOLEAN NOT NULL DEFAULT true, "effectsPending" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GameRoundRecord_status_projectionPending_updatedAt_idx" ON "GameRoundRecord"(status,"projectionPending","updatedAt");
CREATE INDEX "GameRoundRecord_catId_mode_playedAt_idx" ON "GameRoundRecord"("catId",mode,"playedAt");
CREATE INDEX "GameRoundRecord_roomId_playedAt_idx" ON "GameRoundRecord"("roomId","playedAt");
CREATE TABLE "GameRoomRuntime" (
 id TEXT PRIMARY KEY, generation TEXT NOT NULL, config JSONB NOT NULL, phase TEXT NOT NULL,
 deadline TIMESTAMP(3) NOT NULL, "roundId" TEXT, active BOOLEAN NOT NULL DEFAULT true, revision INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GameRoomRuntime_active_updatedAt_idx" ON "GameRoomRuntime"(active,"updatedAt");
-- Concurrent joins previously could create duplicate energy balances. Keep one
-- existing balance (do not sum duplicated grants), retaining the greatest values.
WITH totals AS (
 SELECT "playerId","cat_id", MIN(id) AS keep, MAX(amount) AS amount, MAX(gauge) AS gauge, MAX(turbo) AS turbo
 FROM "GameEnergy" GROUP BY "playerId","cat_id"
)
UPDATE "GameEnergy" e SET amount=GREATEST(0,t.amount), gauge=LEAST(100,GREATEST(0,t.gauge)),turbo=LEAST(100,GREATEST(0,t.turbo))
FROM totals t WHERE e.id=t.keep;
DELETE FROM "GameEnergy" e USING "GameEnergy" keep WHERE e."playerId"=keep."playerId" AND e."cat_id"=keep."cat_id" AND e.id>keep.id;
CREATE UNIQUE INDEX "GameEnergy_playerId_cat_id_key" ON "GameEnergy"("playerId","cat_id");

CREATE TABLE "GamePeriodStat" (
 id TEXT PRIMARY KEY,"playerId" TEXT NOT NULL,"catId" TEXT NOT NULL,mode "GameMode" NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('week','today')),"periodStart" TIMESTAMP(3) NOT NULL,
 score INTEGER NOT NULL DEFAULT 0,"numPlayed" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY("playerId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY("catId") REFERENCES "GameCategory"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GamePeriodStat_playerId_catId_mode_kind_periodStart_key" ON "GamePeriodStat"("playerId","catId",mode,kind,"periodStart");
CREATE INDEX "GamePeriodStat_catId_mode_kind_periodStart_score_playerId_idx" ON "GamePeriodStat"("catId",mode,kind,"periodStart",score DESC,"playerId" DESC);
CREATE INDEX "GamePeriodStat_playerId_idx" ON "GamePeriodStat"("playerId");

ALTER TABLE "GameWalletAction" ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN failures INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "GameWalletAction_status_nextAttemptAt_createdAt_idx" ON "GameWalletAction"(status,"nextAttemptAt","createdAt");
CREATE INDEX "GameWalletAction_userId_roomId_roundId_createdAt_idx" ON "GameWalletAction"("userId","roomId","roundId","createdAt");

ALTER TABLE "GameWalletAction" ADD COLUMN sequence BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "GameWalletAction_sequence_key" ON "GameWalletAction"(sequence);
