-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'CONNECTED', 'ENDED', 'MISSED');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('IMAGE', 'VIDEO', 'TEXT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'SUSPENDED', 'PRIVATE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "UserTypeEnum" AS ENUM ('PERSONAL', 'BUSINESS', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "BillingCycleEnum" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubStatusEnum" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'TRIAL', 'PAYMENT_ERROR', 'PAUSED', 'REVIEW');

-- CreateEnum
CREATE TYPE "CryptoName" AS ENUM ('TON');

-- CreateEnum
CREATE TYPE "CoinStatus" AS ENUM ('FAILED', 'PAID', 'REFUNDED', 'ERROR');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "RewardReasonEnum" AS ENUM ('FIVE_WINNING_STREAK', 'TEN_WINNING_STREAK', 'TWENTY_WINNING_STREAK', 'FIFTY_WINNING_STREAK', 'HUNDRED_WINNING_STREAK', 'TOP_OF_THE_WEEK', 'FIRST_RUNNER_UP_OF_THE_WEEK', 'SECOND_RUNNER_UP_OF_THE_WEEK', 'TOP_OF_THE_MONTH', 'FIRST_RUNNER_UP_OF_THE_MONTH', 'SECOND_RUNNER_UP_OF_THE_MONTH', 'THREE_MONTHS_WINNING_STREAK', 'SIX_MONTHS_WINNING_STREAK', 'NINE_MONTHS_WINNING_STREAK', 'TWELVE_MONTHS_WINNING_STREAK', 'TOP_OF_THE_YEAR', 'FIRST_RUNNER_UP_OF_THE_YEAR', 'SECOND_RUNNER_UP_OF_THE_YEAR', 'CHAMP_OF_THE_YEAR', 'GRAND_CHAMP_OF_THE_YEAR');

-- CreateEnum
CREATE TYPE "RewardTypeEnum" AS ENUM ('COINS', 'BONUS', 'CREDIT');

-- CreateEnum
CREATE TYPE "MilestoneNameEnum" AS ENUM ('ROOM_STREAK', 'WEEK', 'YEAR', 'MONTH', 'CHAMP', 'GRAND_CHAMP', 'MONTH_STREAK');

-- CreateEnum
CREATE TYPE "RevenueSourceEnum" AS ENUM ('ADS_REVENUE', 'GAME_REVENUE', 'CONTEST_REVENUE');

-- CreateEnum
CREATE TYPE "TxnCurrencyEnum" AS ENUM ('TZX', 'TON', 'XTR', 'USDT', 'USD', 'NGN', 'FIAT', 'COINS');

-- CreateEnum
CREATE TYPE "TxnTypeEnum" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TxnSourceEnum" AS ENUM ('COINS', 'BONUS', 'COINS_BONUS', 'STARS', 'CREDIT', 'FIAT', 'CRYPTO', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "TxnCategoryEnum" AS ENUM ('GAME_DEDUCTION', 'GAME_BONUS', 'GAME_REVENUE', 'COIN_PURCHASE', 'COIN_TRANSFER', 'COIN_RECEIVED', 'COIN_WITHDRAWAL', 'GIFT_PURCHASE', 'GIFT_SENT', 'GIFT_RECEIVED', 'APP_SUBSCRIPTION', 'GAME_SUBSCRIPTION', 'GAME_WEEKLY_REWARD', 'GAME_MONTHLY_REWARD', 'GAME_YEARLY_REWARD', 'DAILY_BONUS', 'APP_TASK', 'QUIZ_POST', 'POST_TIP', 'SPARK_TIP');

-- CreateEnum
CREATE TYPE "TxnGatewayEnum" AS ENUM ('WALLET', 'FLUTTERWAVE', 'PAYSTACK', 'CRYPTO', 'VIRTUAL', 'SMART_GLOCAL', 'UNLIMINT', 'STARS');

-- CreateEnum
CREATE TYPE "TxnStatusEnum" AS ENUM ('COMPLETED', 'PROCESSING', 'PENDING', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UserRoleEnum" AS ENUM ('SUPER', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "PostScopeEnum" AS ENUM ('ANYONE', 'VERIFIED', 'FOLLOWED', 'MENTIONS', 'COUNTRY', 'CONTINENT');

-- CreateEnum
CREATE TYPE "ScopeEnum" AS ENUM ('NONE', 'COUNTRY', 'CONTINENT');

-- CreateEnum
CREATE TYPE "PostKindEnum" AS ENUM ('ROOT', 'THREAD', 'REPLY', 'REPOST', 'QUOTE');

-- CreateEnum
CREATE TYPE "PostTypeEnum" AS ENUM ('CONTENT', 'POLL', 'QUIZ');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PUBLISHED', 'DRAFT', 'SCHEDULED', 'REPORTED', 'DELETED');

-- CreateEnum
CREATE TYPE "NotifTypeEnum" AS ENUM ('USER', 'POST', 'NONE');

-- CreateEnum
CREATE TYPE "NotifAction" AS ENUM ('NONE', 'LIKE', 'COMMENT', 'QUOTE', 'REPOST');

-- CreateEnum
CREATE TYPE "FollowAction" AS ENUM ('FOLLOW', 'UNFOLLOW');

-- CreateEnum
CREATE TYPE "BlockAction" AS ENUM ('BLOCK', 'UNBLOCK');

-- CreateEnum
CREATE TYPE "MuteAction" AS ENUM ('MUTE', 'UNMUTE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('HATE', 'ABUSE', 'VIOLENCE', 'CHILD_SAFETY', 'PRIVACY', 'SPAM', 'SELF_HARM', 'SENSITIVE_MEDIA', 'IMPERSONATION', 'VIOLENT_ENTITIES', 'COPYRIGHT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PostContext" AS ENUM ('PROFILE', 'COMMUNITY', 'GLOBAL');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PostAction" AS ENUM ('DELETE', 'RESTORE', 'HIDDEN', 'UNHIDDEN');

-- CreateEnum
CREATE TYPE "PostMediaAction" AS ENUM ('VIEW', 'WATCH', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "PostMediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "PostMetricSource" AS ENUM ('FORYOU', 'FOLLOWING', 'FRIENDS', 'LATEST', 'SEARCH', 'TRENDING');

-- CreateEnum
CREATE TYPE "PostMetricAction" AS ENUM ('CONTENT', 'FOLLOW', 'PROFILE', 'OPTION', 'REPOST', 'REPLY', 'TIP');

-- CreateEnum
CREATE TYPE "TipKindEnum" AS ENUM ('ALL', 'POST', 'SPARK', 'CHAT', 'LIVE');

-- CreateEnum
CREATE TYPE "TipSource" AS ENUM ('POST', 'SPARK', 'LIVE', 'CHAT');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'SETTLED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bio" TEXT,
    "avatar" TEXT,
    "password" TEXT,
    "phone" TEXT,
    "telId" TEXT,
    "countryId" TEXT,
    "role" "UserRoleEnum" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "userType" "UserTypeEnum" NOT NULL DEFAULT 'PERSONAL',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "accountVerified" BOOLEAN NOT NULL DEFAULT false,
    "accountVerifiedAt" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "meta" JSONB DEFAULT '{"type": "LEGACY", "status": "INACTIVE", "color": "blue"}',
    "metadata" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "deactivatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityKeyPub" BYTEA NOT NULL,
    "signedPrekeyPub" BYTEA NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimePrekey" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "keyPub" BYTEA NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneTimePrekey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoMembership" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvoMessage" (
    "id" TEXT NOT NULL,
    "cipherText" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "metaEnc" BYTEA,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConvoMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "cipherKey" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "CallStatus" NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileVisit" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "userId" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "device" JSONB,
    "meta" JSONB,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "status" "FollowStatus" NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowHistory" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "action" "FollowAction" NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockUser" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockHistory" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "action" "BlockAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuteUser" (
    "id" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MuteUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuteHistory" (
    "id" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "action" "MuteAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MuteHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLocation" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "type" "StoryType" NOT NULL DEFAULT 'IMAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryViewer" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryViewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryMention" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryReaction" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "content" TEXT,
    "contentEmbedding" vector(348),
    "scheduleAt" TIMESTAMP(3),
    "location" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "type" "PostTypeEnum" NOT NULL,
    "kind" "PostKindEnum" NOT NULL,
    "scope" "PostScopeEnum" NOT NULL DEFAULT 'ANYONE',
    "totalViews" BIGINT NOT NULL DEFAULT 0,
    "totalLikes" BIGINT NOT NULL DEFAULT 0,
    "totalReplies" BIGINT NOT NULL DEFAULT 0,
    "totalShares" BIGINT NOT NULL DEFAULT 0,
    "totalBookmarks" BIGINT NOT NULL DEFAULT 0,
    "totalReposts" BIGINT NOT NULL DEFAULT 0,
    "totalQuotes" BIGINT NOT NULL DEFAULT 0,
    "totalImpressions" BIGINT NOT NULL DEFAULT 0,
    "totalTips" BIGINT NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "rootId" TEXT,
    "userId" TEXT NOT NULL,
    "countryId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReplyCountry" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostReplyCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReplyContinent" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "continentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostReplyContinent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostClick" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "source" "PostMetricSource" NOT NULL,
    "action" "PostMetricAction" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "referer" TEXT,
    "meta" JSONB,
    "device" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostImpression" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "meta" JSONB,
    "device" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostImpression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostShare" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "meta" JSONB,
    "device" JSONB,
    "kind" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "meta" JSONB,
    "device" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHistory" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PostAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPin" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contextType" "PostContext" NOT NULL DEFAULT 'PROFILE',
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHighlight" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contextType" "PostContext" NOT NULL DEFAULT 'PROFILE',
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostDisinterest" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostDisinterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "rewardAmount" DOUBLE PRECISION NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "maxWinners" INTEGER NOT NULL,
    "scope" "ScopeEnum" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizOption" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizParticipant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizCountry" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizContinent" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "continentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizContinent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTopic" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "altText" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB,
    "totalViews" BIGINT NOT NULL DEFAULT 0,
    "totalDownloads" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMediaLog" (
    "id" TEXT NOT NULL,
    "action" "PostMediaAction" NOT NULL DEFAULT 'VIEW',
    "kind" "PostMediaKind" NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT true,
    "playbackRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "device" JSONB,
    "meta" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "referer" TEXT,
    "mediaId" TEXT NOT NULL,
    "postId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMediaLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "isMultiVote" BOOLEAN NOT NULL DEFAULT false,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "scope" "ScopeEnum" NOT NULL DEFAULT 'NONE',
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "votes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVoter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollVoter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollCountry" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollContinent" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "continentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollContinent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMention" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostMention_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "PostUserTag" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostUserTag_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "PostTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHashTag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostHashTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LikedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LikedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Continent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Continent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iso2" CHAR(2) NOT NULL,
    "iso3" CHAR(3) NOT NULL,
    "emoji" TEXT NOT NULL,
    "continentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ngnPrice" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL,
    "accountType" "UserTypeEnum" NOT NULL,
    "metadata" JSONB,
    "tier" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB[],
    "planId" TEXT NOT NULL,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "billingCycle" "BillingCycleEnum" NOT NULL DEFAULT 'MONTHLY',
    "status" "SubStatusEnum" NOT NULL DEFAULT 'ACTIVE',
    "meta" JSONB,
    "metadata" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "type" "NotifTypeEnum" NOT NULL DEFAULT 'NONE',
    "action" "NotifAction" NOT NULL DEFAULT 'NONE',
    "isSeen" BOOLEAN DEFAULT false,
    "isRead" BOOLEAN DEFAULT false,
    "senderId" TEXT,
    "recipientId" TEXT,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushNotification" (
    "id" TEXT NOT NULL,
    "config" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "TipPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "kind" "TipKindEnum" NOT NULL DEFAULT 'ALL',
    "thumbnail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "TipPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTip" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT,
    "tipId" TEXT NOT NULL,
    "message" TEXT,
    "isAnon" BOOLEAN NOT NULL DEFAULT false,
    "referer" TEXT,
    "meta" JSONB,
    "device" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardTip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "postTipId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" "TipSource" NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "bonus" DOUBLE PRECISION NOT NULL,
    "ngnPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ngnBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "coins" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "txnRef" TEXT NOT NULL,
    "exTxnRef" TEXT,
    "user_id" TEXT,
    "senderId" TEXT,
    "recipientId" TEXT,
    "type" "TxnTypeEnum" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" "TxnSourceEnum" NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TxnCategoryEnum" NOT NULL,
    "metadata" JSONB,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "currency" "TxnCurrencyEnum" NOT NULL,
    "status" "TxnStatusEnum" NOT NULL,
    "walletId" TEXT,
    "coinPackageId" TEXT,
    "tipPackageId" TEXT,
    "achievementId" TEXT,
    "subscriptionId" TEXT,
    "subPlanId" TEXT,
    "taskId" TEXT,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLogs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "coinPackageId" TEXT,
    "tipPackageId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTaskSettings" (
    "id" TEXT NOT NULL,
    "dailyBonusDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adsBonusDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTaskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "user_id" TEXT,
    "modes" "GameMode"[],
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
    "user_id" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
    "user_id" TEXT,
    "cat_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMonthStat" (
    "id" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "catId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
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
    "mode" "GameMode" NOT NULL,
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
CREATE TABLE "GameMonthRewardStat" (
    "id" TEXT NOT NULL,
    "totalParticipants" DOUBLE PRECISION NOT NULL,
    "rewardParticipants" DOUBLE PRECISION NOT NULL,
    "coinsRewardParticipants" DOUBLE PRECISION NOT NULL,
    "creditRewardParticipants" DOUBLE PRECISION NOT NULL,
    "bonusRewardParticipants" DOUBLE PRECISION NOT NULL,
    "creditParticipantsScore" DOUBLE PRECISION NOT NULL,
    "coinsParticipantsScore" DOUBLE PRECISION NOT NULL,
    "bonusParticipantsScore" DOUBLE PRECISION NOT NULL,
    "numPlayed" DOUBLE PRECISION NOT NULL,
    "coinsSpent" DOUBLE PRECISION NOT NULL,
    "bonusSpent" DOUBLE PRECISION NOT NULL,
    "creditShareAmount" DOUBLE PRECISION NOT NULL,
    "coinsShareAmount" DOUBLE PRECISION NOT NULL,
    "bonusShareAmount" DOUBLE PRECISION NOT NULL,
    "rewardParticipantsScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "catId" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMonthRewardStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMilestone" (
    "id" TEXT NOT NULL,
    "name" "MilestoneNameEnum" NOT NULL,
    "reason" "RewardReasonEnum" NOT NULL,
    "thumbnail" TEXT,
    "milestone" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "rewardType" "RewardTypeEnum" NOT NULL,
    "user_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAchievement" (
    "id" TEXT NOT NULL,
    "reason" "RewardReasonEnum" NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "metadata" JSONB,
    "amount" DOUBLE PRECISION NOT NULL,
    "rewardType" "RewardTypeEnum" NOT NULL,
    "mode" "GameMode",
    "txnId" TEXT,
    "catId" TEXT,
    "playerId" TEXT NOT NULL,
    "month_stat_id" TEXT,
    "year_stat_id" TEXT,
    "milestoneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAchievement_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "rewardType" "RewardTypeEnum" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
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
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConvoMembership_userId_key" ON "ConvoMembership"("userId");

-- CreateIndex
CREATE INDEX "ProfileVisit_createdAt_idx" ON "ProfileVisit"("createdAt");

-- CreateIndex
CREATE INDEX "UserReport_createdAt_idx" ON "UserReport"("createdAt");

-- CreateIndex
CREATE INDEX "Follow_createdAt_idx" ON "Follow"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "FollowHistory_createdAt_idx" ON "FollowHistory"("createdAt");

-- CreateIndex
CREATE INDEX "BlockUser_createdAt_idx" ON "BlockUser"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockUser_blockerId_blockedId_key" ON "BlockUser"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "BlockHistory_createdAt_idx" ON "BlockHistory"("createdAt");

-- CreateIndex
CREATE INDEX "MuteUser_createdAt_idx" ON "MuteUser"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MuteUser_muterId_mutedId_key" ON "MuteUser"("muterId", "mutedId");

-- CreateIndex
CREATE INDEX "MuteHistory_createdAt_idx" ON "MuteHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserLocation_userId_key" ON "UserLocation"("userId");

-- CreateIndex
CREATE INDEX "UserLocation_createdAt_idx" ON "UserLocation"("createdAt");

-- CreateIndex
CREATE INDEX "Story_createdAt_idx" ON "Story"("createdAt");

-- CreateIndex
CREATE INDEX "StoryViewer_createdAt_idx" ON "StoryViewer"("createdAt");

-- CreateIndex
CREATE INDEX "StoryViewer_viewedAt_idx" ON "StoryViewer"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryViewer_storyId_userId_key" ON "StoryViewer"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryMention_createdAt_idx" ON "StoryMention"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryMention_storyId_userId_key" ON "StoryMention"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryReaction_createdAt_idx" ON "StoryReaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_storyId_userId_key" ON "StoryReaction"("storyId", "userId");

-- CreateIndex
CREATE INDEX "Post_userId_createdAt_kind_status_idx" ON "Post"("userId", "createdAt", "kind", "status");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_contentEmbedding_idx" ON "Post"("contentEmbedding");

-- CreateIndex
CREATE INDEX "PostReplyCountry_createdAt_idx" ON "PostReplyCountry"("createdAt");

-- CreateIndex
CREATE INDEX "PostReplyContinent_createdAt_idx" ON "PostReplyContinent"("createdAt");

-- CreateIndex
CREATE INDEX "PostClick_postId_userId_idx" ON "PostClick"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostClick_userId_postId_idx" ON "PostClick"("userId", "postId");

-- CreateIndex
CREATE INDEX "PostClick_userId_createdAt_idx" ON "PostClick"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostClick_userId_timestamp_idx" ON "PostClick"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "PostClick_createdAt_idx" ON "PostClick"("createdAt");

-- CreateIndex
CREATE INDEX "PostImpression_postId_userId_idx" ON "PostImpression"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostImpression_userId_postId_idx" ON "PostImpression"("userId", "postId");

-- CreateIndex
CREATE INDEX "PostImpression_userId_createdAt_idx" ON "PostImpression"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostImpression_postId_createdAt_idx" ON "PostImpression"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostImpression_userId_timestamp_idx" ON "PostImpression"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "PostImpression_postId_timestamp_idx" ON "PostImpression"("postId", "timestamp");

-- CreateIndex
CREATE INDEX "PostImpression_createdAt_idx" ON "PostImpression"("createdAt");

-- CreateIndex
CREATE INDEX "PostShare_postId_userId_idx" ON "PostShare"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostShare_userId_postId_idx" ON "PostShare"("userId", "postId");

-- CreateIndex
CREATE INDEX "PostShare_userId_createdAt_idx" ON "PostShare"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostShare_postId_createdAt_idx" ON "PostShare"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostShare_userId_timestamp_idx" ON "PostShare"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "PostShare_postId_timestamp_idx" ON "PostShare"("postId", "timestamp");

-- CreateIndex
CREATE INDEX "PostShare_createdAt_idx" ON "PostShare"("createdAt");

-- CreateIndex
CREATE INDEX "PostView_postId_userId_idx" ON "PostView"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostView_userId_postId_idx" ON "PostView"("userId", "postId");

-- CreateIndex
CREATE INDEX "PostView_userId_createdAt_idx" ON "PostView"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostView_postId_createdAt_idx" ON "PostView"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostView_userId_timestamp_idx" ON "PostView"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "PostView_postId_timestamp_idx" ON "PostView"("postId", "timestamp");

-- CreateIndex
CREATE INDEX "PostView_createdAt_idx" ON "PostView"("createdAt");

-- CreateIndex
CREATE INDEX "PostHistory_createdAt_idx" ON "PostHistory"("createdAt");

-- CreateIndex
CREATE INDEX "PostPin_postId_contextType_contextId_idx" ON "PostPin"("postId", "contextType", "contextId");

-- CreateIndex
CREATE INDEX "PostPin_createdAt_idx" ON "PostPin"("createdAt");

-- CreateIndex
CREATE INDEX "PostHighlight_postId_contextType_contextId_idx" ON "PostHighlight"("postId", "contextType", "contextId");

-- CreateIndex
CREATE INDEX "PostHighlight_createdAt_idx" ON "PostHighlight"("createdAt");

-- CreateIndex
CREATE INDEX "PostDisinterest_createdAt_idx" ON "PostDisinterest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostDisinterest_postId_userId_key" ON "PostDisinterest"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostReport_createdAt_idx" ON "PostReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostReport_userId_postId_key" ON "PostReport"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_postId_key" ON "Quiz"("postId");

-- CreateIndex
CREATE INDEX "Quiz_createdAt_idx" ON "Quiz"("createdAt");

-- CreateIndex
CREATE INDEX "QuizOption_createdAt_idx" ON "QuizOption"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizReward_userId_key" ON "QuizReward"("userId");

-- CreateIndex
CREATE INDEX "QuizReward_createdAt_idx" ON "QuizReward"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizReward_userId_quizId_key" ON "QuizReward"("userId", "quizId");

-- CreateIndex
CREATE INDEX "QuizParticipant_userId_createdAt_idx" ON "QuizParticipant"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuizParticipant_createdAt_idx" ON "QuizParticipant"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizParticipant_userId_quizId_key" ON "QuizParticipant"("userId", "quizId");

-- CreateIndex
CREATE INDEX "QuizCountry_createdAt_idx" ON "QuizCountry"("createdAt");

-- CreateIndex
CREATE INDEX "QuizContinent_createdAt_idx" ON "QuizContinent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_word_key" ON "Topic"("word");

-- CreateIndex
CREATE INDEX "Topic_createdAt_idx" ON "Topic"("createdAt");

-- CreateIndex
CREATE INDEX "PostTopic_createdAt_idx" ON "PostTopic"("createdAt");

-- CreateIndex
CREATE INDEX "PostMedia_createdAt_idx" ON "PostMedia"("createdAt");

-- CreateIndex
CREATE INDEX "PostMediaLog_createdAt_idx" ON "PostMediaLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_postId_key" ON "Poll"("postId");

-- CreateIndex
CREATE INDEX "Poll_createdAt_idx" ON "Poll"("createdAt");

-- CreateIndex
CREATE INDEX "PollOption_createdAt_idx" ON "PollOption"("createdAt");

-- CreateIndex
CREATE INDEX "PollVoter_userId_createdAt_idx" ON "PollVoter"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PollVoter_createdAt_idx" ON "PollVoter"("createdAt");

-- CreateIndex
CREATE INDEX "PollCountry_createdAt_idx" ON "PollCountry"("createdAt");

-- CreateIndex
CREATE INDEX "PollContinent_createdAt_idx" ON "PollContinent"("createdAt");

-- CreateIndex
CREATE INDEX "PostMention_userId_createdAt_idx" ON "PostMention"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostMention_createdAt_idx" ON "PostMention"("createdAt");

-- CreateIndex
CREATE INDEX "PostUserTag_userId_createdAt_idx" ON "PostUserTag"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostUserTag_createdAt_idx" ON "PostUserTag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostTag_name_key" ON "PostTag"("name");

-- CreateIndex
CREATE INDEX "PostTag_createdAt_idx" ON "PostTag"("createdAt");

-- CreateIndex
CREATE INDEX "PostHashTag_createdAt_idx" ON "PostHashTag"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostHashTag_postId_tagId_key" ON "PostHashTag"("postId", "tagId");

-- CreateIndex
CREATE INDEX "LikedPost_userId_createdAt_idx" ON "LikedPost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LikedPost_createdAt_idx" ON "LikedPost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LikedPost_userId_postId_key" ON "LikedPost"("userId", "postId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "Bookmark"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_createdAt_idx" ON "Bookmark"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_postId_key" ON "Bookmark"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Continent_code_key" ON "Continent"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Continent_name_key" ON "Continent"("name");

-- CreateIndex
CREATE INDEX "Continent_code_idx" ON "Continent"("code");

-- CreateIndex
CREATE INDEX "Continent_createdAt_idx" ON "Continent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso3_key" ON "Country"("iso3");

-- CreateIndex
CREATE UNIQUE INDEX "Country_emoji_key" ON "Country"("emoji");

-- CreateIndex
CREATE INDEX "Country_iso2_idx" ON "Country"("iso2");

-- CreateIndex
CREATE INDEX "Country_iso3_idx" ON "Country"("iso3");

-- CreateIndex
CREATE INDEX "Country_continentId_idx" ON "Country"("continentId");

-- CreateIndex
CREATE INDEX "Country_createdAt_idx" ON "Country"("createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_createdAt_idx" ON "SubscriptionPlan"("createdAt");

-- CreateIndex
CREATE INDEX "Subscription_createdAt_idx" ON "Subscription"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "PushNotification_createdAt_idx" ON "PushNotification"("createdAt");

-- CreateIndex
CREATE INDEX "Revenue_createdAt_idx" ON "Revenue"("createdAt");

-- CreateIndex
CREATE INDEX "TipPackage_createdAt_idx" ON "TipPackage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardTip_postTipId_key" ON "RewardTip"("postTipId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardTip_txnId_key" ON "RewardTip"("txnId");

-- CreateIndex
CREATE INDEX "RewardTip_userId_idx" ON "RewardTip"("userId");

-- CreateIndex
CREATE INDEX "RewardTip_availableAt_idx" ON "RewardTip"("availableAt");

-- CreateIndex
CREATE INDEX "RewardTip_settledAt_idx" ON "RewardTip"("settledAt");

-- CreateIndex
CREATE INDEX "CoinPackage_createdAt_idx" ON "CoinPackage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_user_id_key" ON "Wallet"("user_id");

-- CreateIndex
CREATE INDEX "Wallet_createdAt_idx" ON "Wallet"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_achievementId_key" ON "Transaction"("achievementId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "TransactionLogs_createdAt_idx" ON "TransactionLogs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserTaskSettings_user_id_key" ON "UserTaskSettings"("user_id");

-- CreateIndex
CREATE INDEX "UserTaskSettings_createdAt_idx" ON "UserTaskSettings"("createdAt");

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt");

-- CreateIndex
CREATE INDEX "GameMonthStat_catId_year_month_mode_idx" ON "GameMonthStat"("catId", "year", "month", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "GameMonthStat_playerId_catId_year_month_mode_key" ON "GameMonthStat"("playerId", "catId", "year", "month", "mode");

-- CreateIndex
CREATE INDEX "GameYearStat_catId_year_mode_idx" ON "GameYearStat"("catId", "year", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "GameYearStat_playerId_catId_year_mode_key" ON "GameYearStat"("playerId", "catId", "year", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "GameAchievement_txnId_key" ON "GameAchievement"("txnId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAddress_userId_key" ON "WalletAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referrerId_refereeId_key" ON "Referral"("referrerId", "refereeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoDevice" ADD CONSTRAINT "ConvoDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimePrekey" ADD CONSTRAINT "OneTimePrekey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ConvoDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoMembership" ADD CONSTRAINT "ConvoMembership_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoMembership" ADD CONSTRAINT "ConvoMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoMessage" ADD CONSTRAINT "ConvoMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvoMessage" ADD CONSTRAINT "ConvoMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConvoMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowHistory" ADD CONSTRAINT "FollowHistory_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowHistory" ADD CONSTRAINT "FollowHistory_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockUser" ADD CONSTRAINT "BlockUser_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockUser" ADD CONSTRAINT "BlockUser_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockHistory" ADD CONSTRAINT "BlockHistory_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockHistory" ADD CONSTRAINT "BlockHistory_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuteUser" ADD CONSTRAINT "MuteUser_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuteUser" ADD CONSTRAINT "MuteUser_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuteHistory" ADD CONSTRAINT "MuteHistory_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuteHistory" ADD CONSTRAINT "MuteHistory_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryViewer" ADD CONSTRAINT "StoryViewer_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryViewer" ADD CONSTRAINT "StoryViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryMention" ADD CONSTRAINT "StoryMention_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryMention" ADD CONSTRAINT "StoryMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReplyCountry" ADD CONSTRAINT "PostReplyCountry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReplyCountry" ADD CONSTRAINT "PostReplyCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReplyContinent" ADD CONSTRAINT "PostReplyContinent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReplyContinent" ADD CONSTRAINT "PostReplyContinent_continentId_fkey" FOREIGN KEY ("continentId") REFERENCES "Continent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostClick" ADD CONSTRAINT "PostClick_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostClick" ADD CONSTRAINT "PostClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImpression" ADD CONSTRAINT "PostImpression_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImpression" ADD CONSTRAINT "PostImpression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostShare" ADD CONSTRAINT "PostShare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostShare" ADD CONSTRAINT "PostShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHistory" ADD CONSTRAINT "PostHistory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHistory" ADD CONSTRAINT "PostHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPin" ADD CONSTRAINT "PostPin_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPin" ADD CONSTRAINT "PostPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHighlight" ADD CONSTRAINT "PostHighlight_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHighlight" ADD CONSTRAINT "PostHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDisinterest" ADD CONSTRAINT "PostDisinterest_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDisinterest" ADD CONSTRAINT "PostDisinterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizReward" ADD CONSTRAINT "QuizReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizReward" ADD CONSTRAINT "QuizReward_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizParticipant" ADD CONSTRAINT "QuizParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizParticipant" ADD CONSTRAINT "QuizParticipant_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuizOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizParticipant" ADD CONSTRAINT "QuizParticipant_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizCountry" ADD CONSTRAINT "QuizCountry_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizCountry" ADD CONSTRAINT "QuizCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizContinent" ADD CONSTRAINT "QuizContinent_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizContinent" ADD CONSTRAINT "QuizContinent_continentId_fkey" FOREIGN KEY ("continentId") REFERENCES "Continent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTopic" ADD CONSTRAINT "PostTopic_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTopic" ADD CONSTRAINT "PostTopic_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMediaLog" ADD CONSTRAINT "PostMediaLog_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "PostMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMediaLog" ADD CONSTRAINT "PostMediaLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMediaLog" ADD CONSTRAINT "PostMediaLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVoter" ADD CONSTRAINT "PollVoter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVoter" ADD CONSTRAINT "PollVoter_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCountry" ADD CONSTRAINT "PollCountry_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollCountry" ADD CONSTRAINT "PollCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollContinent" ADD CONSTRAINT "PollContinent_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollContinent" ADD CONSTRAINT "PollContinent_continentId_fkey" FOREIGN KEY ("continentId") REFERENCES "Continent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMention" ADD CONSTRAINT "PostMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMention" ADD CONSTRAINT "PostMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostUserTag" ADD CONSTRAINT "PostUserTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostUserTag" ADD CONSTRAINT "PostUserTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashTag" ADD CONSTRAINT "PostHashTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashTag" ADD CONSTRAINT "PostHashTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PostTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikedPost" ADD CONSTRAINT "LikedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikedPost" ADD CONSTRAINT "LikedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_continentId_fkey" FOREIGN KEY ("continentId") REFERENCES "Continent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotification" ADD CONSTRAINT "PushNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipPackage" ADD CONSTRAINT "TipPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTip" ADD CONSTRAINT "PostTip_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTip" ADD CONSTRAINT "PostTip_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTip" ADD CONSTRAINT "PostTip_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTip" ADD CONSTRAINT "PostTip_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "TipPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTip" ADD CONSTRAINT "RewardTip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTip" ADD CONSTRAINT "RewardTip_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTip" ADD CONSTRAINT "RewardTip_postTipId_fkey" FOREIGN KEY ("postTipId") REFERENCES "PostTip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTip" ADD CONSTRAINT "RewardTip_txnId_fkey" FOREIGN KEY ("txnId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPackage" ADD CONSTRAINT "CoinPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coinPackageId_fkey" FOREIGN KEY ("coinPackageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tipPackageId_fkey" FOREIGN KEY ("tipPackageId") REFERENCES "TipPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subPlanId_fkey" FOREIGN KEY ("subPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLogs" ADD CONSTRAINT "TransactionLogs_coinPackageId_fkey" FOREIGN KEY ("coinPackageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLogs" ADD CONSTRAINT "TransactionLogs_tipPackageId_fkey" FOREIGN KEY ("tipPackageId") REFERENCES "TipPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLogs" ADD CONSTRAINT "TransactionLogs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskSettings" ADD CONSTRAINT "UserTaskSettings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "GameMonthRewardStat" ADD CONSTRAINT "GameMonthRewardStat_catId_fkey" FOREIGN KEY ("catId") REFERENCES "GameCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMilestone" ADD CONSTRAINT "GameMilestone_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "GameAchievement" ADD CONSTRAINT "GameAchievement_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "GameMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "GameCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoAddress" ADD CONSTRAINT "CryptoAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
