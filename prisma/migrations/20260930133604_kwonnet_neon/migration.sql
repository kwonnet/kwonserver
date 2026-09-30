/*
  Warnings:

  - You are about to drop the column `contentEmbedding` on the `Post` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Post_contentEmbedding_idx";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "contentEmbedding",
ADD COLUMN     "topic" TEXT;

-- CreateTable
CREATE TABLE "PostTrendingEvent" (
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "countryId" TEXT,
    "isHashtag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PostTrendingEvent_pkey" PRIMARY KEY ("postId","keyword","createdAt")
);

-- CreateIndex
CREATE INDEX "PostTrendingEvent_createdAt_idx" ON "PostTrendingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PostTrendingEvent_keyword_createdAt_idx" ON "PostTrendingEvent"("keyword", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostTrendingEvent_authorId_createdAt_idx" ON "PostTrendingEvent"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostTrendingEvent_countryId_createdAt_idx" ON "PostTrendingEvent"("countryId", "createdAt" DESC);
