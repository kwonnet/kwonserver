-- Give every current task a fresh weekly draw; clamping old daily rewards biased
-- the catalog toward 10. Duplicate random rewards across tasks are valid.
-- Apply modest weekly goals, preserving custom admin goals.
UPDATE "EngagementTask"
SET reward = floor(random() * 6)::integer + 5,
    target = CASE
      WHEN action = 'LIKE' AND target = 20 THEN 30
      WHEN action = 'COMMENT' AND target = 20 THEN 25
      WHEN action = 'REPOST' AND target = 10 THEN 15
      WHEN action = 'QUOTE' AND target = 5 THEN 7
      WHEN action = 'FOLLOW' AND target = 5 THEN 7
      WHEN action = 'FOLLOWERS' AND target = 3 THEN 5
      WHEN action = 'BOOKMARK' AND target = 10 THEN 15
      WHEN action = 'PUBLISH' AND target = 2 THEN 4
      WHEN action = 'LIKES_RECEIVED' AND target = 10 THEN 15
      WHEN action = 'COMMENTS_RECEIVED' AND target = 5 THEN 7
      ELSE target
    END,
    "rewardDay" = date_trunc('week', NOW() AT TIME ZONE 'UTC')::date,
    "updatedAt" = CURRENT_TIMESTAMP;
