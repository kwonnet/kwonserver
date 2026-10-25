-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "providerCustomerId" TEXT,
ADD COLUMN     "providerEnvironment" TEXT,
ADD COLUMN     "providerGateway" "TxnGatewayEnum",
ADD COLUMN     "providerPlanId" TEXT,
ADD COLUMN     "providerState" TEXT,
ADD COLUMN     "providerSubscriptionId" TEXT,
ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "renewalCancelledAt" TIMESTAMP(3),
ADD COLUMN     "renewalCoinAmount" DECIMAL(20,2),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionProviderPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL DEFAULT '',
    "billingCycle" "BillingCycleEnum" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "environment" TEXT NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "request" JSONB NOT NULL,
    "remoteId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "processingUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionProviderPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL DEFAULT '',
    "billingCycle" "BillingCycleEnum" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "environment" TEXT NOT NULL,
    "providerPlanId" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL,
    "offerId" TEXT,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "request" JSONB NOT NULL,
    "checkoutId" TEXT,
    "checkoutUrl" TEXT,
    "subscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionTrialOffer" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "countryIso3" TEXT,
    "days" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTrialOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionTrialUse" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkoutId" TEXT,
    "subscriptionId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionTrialUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionProviderEvent" (
    "id" TEXT NOT NULL,
    "gateway" "TxnGatewayEnum" NOT NULL,
    "environment" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionProviderPlan_planId_tierId_billingCycle_currenc_idx" ON "SubscriptionProviderPlan"("planId", "tierId", "billingCycle", "currency", "gateway");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionProviderPlan_gateway_environment_remoteId_key" ON "SubscriptionProviderPlan"("gateway", "environment", "remoteId");

-- CreateIndex
CREATE INDEX "SubscriptionCheckout_userId_status_createdAt_idx" ON "SubscriptionCheckout"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionCheckout_subscriptionId_idx" ON "SubscriptionCheckout"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCheckout_gateway_environment_checkoutId_key" ON "SubscriptionCheckout"("gateway", "environment", "checkoutId");

-- CreateIndex
CREATE INDEX "SubscriptionTrialOffer_userId_countryIso3_enabled_idx" ON "SubscriptionTrialOffer"("userId", "countryIso3", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTrialUse_checkoutId_key" ON "SubscriptionTrialUse"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTrialUse_offerId_userId_key" ON "SubscriptionTrialUse"("offerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionProviderEvent_gateway_environment_paymentId_key" ON "SubscriptionProviderEvent"("gateway", "environment", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerGateway_providerEnvironment_providerSu_key" ON "Subscription"("providerGateway", "providerEnvironment", "providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "SubscriptionProviderPlan" ADD CONSTRAINT "SubscriptionProviderPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionTrialOffer" ADD CONSTRAINT "SubscriptionTrialOffer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionTrialUse" ADD CONSTRAINT "SubscriptionTrialUse_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SubscriptionTrialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

