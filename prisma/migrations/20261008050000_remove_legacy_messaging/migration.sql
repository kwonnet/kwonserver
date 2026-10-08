-- DropForeignKey
ALTER TABLE "ConvoDevice" DROP CONSTRAINT "ConvoDevice_userId_fkey";

-- DropForeignKey
ALTER TABLE "OneTimePrekey" DROP CONSTRAINT "OneTimePrekey_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "ConvoMembership" DROP CONSTRAINT "ConvoMembership_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "ConvoMembership" DROP CONSTRAINT "ConvoMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "ConvoMessage" DROP CONSTRAINT "ConvoMessage_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "ConvoMessage" DROP CONSTRAINT "ConvoMessage_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_messageId_fkey";

-- DropForeignKey
ALTER TABLE "CallLog" DROP CONSTRAINT "CallLog_conversationId_fkey";

-- DropTable
DROP TABLE "ConvoDevice";

-- DropTable
DROP TABLE "OneTimePrekey";

-- DropTable
DROP TABLE "Conversation";

-- DropTable
DROP TABLE "ConvoMembership";

-- DropTable
DROP TABLE "ConvoMessage";

-- DropTable
DROP TABLE "Attachment";

-- DropTable
DROP TABLE "CallLog";

-- DropEnum
DROP TYPE "CallStatus";

