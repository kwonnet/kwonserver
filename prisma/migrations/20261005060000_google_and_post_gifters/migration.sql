ALTER TABLE "User" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User" ("googleSubject");
ALTER TABLE "PostTip" ADD COLUMN "coinsAmount" DECIMAL(20,2);
CREATE INDEX "PostTip_postId_createdAt_id_idx" ON "PostTip" ("postId", "createdAt" DESC, "id" DESC);
-- Historical package prices cannot be reconstructed safely. Legacy values remain null.
