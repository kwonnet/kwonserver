-- CreateEnum
CREATE TYPE "CryptoName" AS ENUM ('TON');

-- CreateEnum
CREATE TYPE "CoinStatus" AS ENUM ('FAILED', 'PAID', 'REFUNDED', 'ERROR');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('MULTIPLAYER', 'SINGLE');

-- CreateEnum
CREATE TYPE "RewardReasonEnum" AS ENUM ('TOP_OF_THE_YEAR', 'YEAR_VERIFICATION', 'FIRST_RUNNER_UP_YEAR', 'SECOND_RUNNER_UP_YEAR', 'TOP_OF_THE_MONTH', 'SECOND_RUNNER_UP_MONTH', 'FIRST_RUNNER_UP_MONTH', 'MONTH_VERIFICATION', 'TOP_WEEK_ONE', 'FIRST_RUNNER_UP_WEEK_ONE', 'SECOND_RUNNER_UP_WEEK_ONE', 'TOP_WEEK_TWO', 'FIRST_RUNNER_UP_WEEK_TWO', 'SECOND_RUNNER_UP_WEEK_TWO', 'TOP_WEEK_THREE', 'FIRST_RUNNER_UP_WEEK_THREE', 'SECOND_RUNNER_UP_WEEK_THREE', 'TOP_WEEK_FOUR', 'FIRST_RUNNER_UP_WEEK_FOUR', 'SECOND_RUNNER_UP_WEEK_FOUR', 'TOP_WEEK_FIVE', 'FIRST_RUNNER_UP_WEEK_FIVE', 'SECOND_RUNNER_UP_WEEK_FIVE', 'HIGHER_RANKING', 'GAME_CREDIT_REWARD', 'FIVE_WINNING_STREAK', 'TEN_WINNING_STREAK', 'TWENTY_WINNING_STREAK', 'FIFTY_WINNING_STREAK', 'HUNDRED_WINNING_STREAK', 'THREE_MONTHS_WINNING_STREAK', 'SIX_MONTHS_WINNING_STREAK', 'NINE_MONTHS_WINNING_STREAK', 'TWELVE_MONTHS_WINNING_STREAK', 'CHAMP_OF_THE_YEAR_CATEGORY');

-- CreateEnum
CREATE TYPE "RewardTypeEnum" AS ENUM ('COINS', 'BONUS', 'CREDIT', 'OTHERS');

-- CreateEnum
CREATE TYPE "RevenueSourceEnum" AS ENUM ('ADS_REVENUE', 'GAME_REVENUE', 'CONTEST_REVENUE');

-- CreateEnum
CREATE TYPE "TxnCurrencyEnum" AS ENUM ('TZX', 'TON', 'XTR', 'USDT', 'USD', 'FIAT', 'NONE');

-- CreateEnum
CREATE TYPE "TxnTypeEnum" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TxnSourceEnum" AS ENUM ('COINS', 'BONUS', 'COINS_BONUS', 'STARS', 'CREDIT', 'FIAT', 'CRYPTO');

-- CreateEnum
CREATE TYPE "TxnCategoryEnum" AS ENUM ('GAME_DEDUCTION', 'GAME_BONUS', 'GAME_REVENUE', 'COIN_PURCHASE', 'COIN_TRANSFER', 'COIN_WITHDRAWAL', 'GIFT_PURCHASE', 'GIFT_SENT', 'GIFT_RECEIVED', 'APP_SUBSCRIPTION', 'GAME_SUBSCRIPTION', 'GAME_REWARD');

-- CreateEnum
CREATE TYPE "TxnGatewayEnum" AS ENUM ('WALLET', 'FLUTTERWAVE', 'PAYSTACK', 'CRYPTO', 'VIRTUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revenue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "bonus" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "CoinPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "user_id" TEXT NOT NULL,
    "isLocked" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TxnTypeEnum" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" "TxnSourceEnum" NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TxnCategoryEnum" NOT NULL,
    "metadata" JSONB,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "currency" "TxnCurrencyEnum" NOT NULL,
    "walletId" TEXT,
    "coinPackageId" TEXT,
    "achievementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "gameId" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "user_id" TEXT NOT NULL,
    "cat_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMonthStat" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "numPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMonthStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameYearStat" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "numPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameYearStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAchievement" (
    "id" TEXT NOT NULL,
    "reason" "RewardReasonEnum" NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "meta" JSONB,
    "amount" DOUBLE PRECISION NOT NULL,
    "rewardType" "RewardTypeEnum" NOT NULL,
    "txnId" TEXT,
    "catId" TEXT,
    "playerId" TEXT NOT NULL,
    "month_stat_id" TEXT,
    "year_stat_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePower" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "gauge" INTEGER NOT NULL,
    "turbo" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "cat_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTask" (
    "id" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameUserTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "performedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameUserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoAddress" (
    "id" TEXT NOT NULL,
    "name" "CryptoName" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAddress" (
    "id" TEXT NOT NULL,
    "name" "CryptoName" NOT NULL,
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "metadata" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "isRewarded" BOOLEAN NOT NULL DEFAULT false,
    "rewardAmount" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_user_id_key" ON "Wallet"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_achievementId_key" ON "Transaction"("achievementId");

-- CreateIndex
CREATE INDEX "GameMonthStat_catId_year_month_idx" ON "GameMonthStat"("catId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "GameMonthStat_playerId_catId_year_month_key" ON "GameMonthStat"("playerId", "catId", "year", "month");

-- CreateIndex
CREATE INDEX "GameYearStat_catId_year_idx" ON "GameYearStat"("catId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "GameYearStat_playerId_catId_year_key" ON "GameYearStat"("playerId", "catId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "GameAchievement_txnId_key" ON "GameAchievement"("txnId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referrerId_refereeId_key" ON "Referral"("referrerId", "refereeId");

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPackage" ADD CONSTRAINT "CoinPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coinPackageId_fkey" FOREIGN KEY ("coinPackageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCategory" ADD CONSTRAINT "GameCategory_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCategory" ADD CONSTRAINT "GameCategory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMonthStat" ADD CONSTRAINT "GameMonthStat_catId_fkey" FOREIGN KEY ("catId") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMonthStat" ADD CONSTRAINT "GameMonthStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameYearStat" ADD CONSTRAINT "GameYearStat_catId_fkey" FOREIGN KEY ("catId") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameYearStat" ADD CONSTRAINT "GameYearStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_catId_fkey" FOREIGN KEY ("catId") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_month_stat_id_fkey" FOREIGN KEY ("month_stat_id") REFERENCES "GameMonthStat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_year_stat_id_fkey" FOREIGN KEY ("year_stat_id") REFERENCES "GameYearStat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePower" ADD CONSTRAINT "GamePower_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePower" ADD CONSTRAINT "GamePower_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "GameCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTask" ADD CONSTRAINT "GameTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameUserTask" ADD CONSTRAINT "GameUserTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameUserTask" ADD CONSTRAINT "GameUserTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GameTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoAddress" ADD CONSTRAINT "CryptoAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
