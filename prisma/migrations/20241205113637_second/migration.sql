/*
  Warnings:

  - The values [NONE] on the enum `TxnCurrencyEnum` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `userId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the `GamePower` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId]` on the table `WalletAddress` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `status` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `txnRef` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TxnStatusEnum" AS ENUM ('COMPLETED', 'PROCESSING', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "TxnCategoryEnum" ADD VALUE 'COIN_RECEIVED';

-- AlterEnum
BEGIN;
CREATE TYPE "TxnCurrencyEnum_new" AS ENUM ('TZX', 'TON', 'XTR', 'USDT', 'USD', 'FIAT', 'COINS');
ALTER TABLE "Transaction" ALTER COLUMN "currency" TYPE "TxnCurrencyEnum_new" USING ("currency"::text::"TxnCurrencyEnum_new");
ALTER TYPE "TxnCurrencyEnum" RENAME TO "TxnCurrencyEnum_old";
ALTER TYPE "TxnCurrencyEnum_new" RENAME TO "TxnCurrencyEnum";
DROP TYPE "TxnCurrencyEnum_old";
COMMIT;

-- AlterEnum
ALTER TYPE "TxnSourceEnum" ADD VALUE 'VIRTUAL';

-- DropForeignKey
ALTER TABLE "GamePower" DROP CONSTRAINT "GamePower_cat_id_fkey";

-- DropForeignKey
ALTER TABLE "GamePower" DROP CONSTRAINT "GamePower_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "userId",
ADD COLUMN     "recipientId" TEXT,
ADD COLUMN     "senderId" TEXT,
ADD COLUMN     "status" "TxnStatusEnum" NOT NULL,
ADD COLUMN     "txnRef" TEXT NOT NULL,
ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" TEXT,
ADD COLUMN     "metadata" JSONB[] DEFAULT ARRAY[]::JSONB[],
ADD COLUMN     "status" "UserStatus" DEFAULT 'ACTIVE',
ADD COLUMN     "telId" TEXT NOT NULL;

-- DropTable
DROP TABLE "GamePower";

-- CreateTable
CREATE TABLE "GameEnergy" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "gauge" INTEGER NOT NULL,
    "turbo" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "cat_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameEnergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAddress_userId_key" ON "WalletAddress"("userId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "GameCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
