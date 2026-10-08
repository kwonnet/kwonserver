ALTER TABLE "E2Conversation" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "E2Conversation" c SET "lastActivityAt" = COALESCE((SELECT MAX(m."createdAt") FROM "E2Message" m WHERE m."conversationId" = c.id), c."createdAt");
CREATE INDEX "E2Conversation_lastActivityAt_id_idx" ON "E2Conversation"("lastActivityAt", "id");
