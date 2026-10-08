ALTER TABLE "E2Conversation" ADD COLUMN "requestSentAt" TIMESTAMP(3);
UPDATE "E2Conversation" c SET "requestSentAt" = first_message.sent_at
FROM (SELECT "conversationId", MIN("createdAt") AS sent_at FROM "E2Message" GROUP BY "conversationId") first_message
WHERE c.id = first_message."conversationId" AND c."acceptedAt" IS NULL;
