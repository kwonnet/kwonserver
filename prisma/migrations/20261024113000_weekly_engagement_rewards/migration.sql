-- Current task configuration only: preserve all previously credited claims/transactions.
-- The original catalog seeds 10 coins, which is within the new 5-10 range.
UPDATE "EngagementTask"
SET reward = GREATEST(5, LEAST(10, reward)),
    "rewardDay" = date_trunc('week', NOW() AT TIME ZONE 'UTC')::date,
    "updatedAt" = CURRENT_TIMESTAMP;
