-- Separate non-transactional migration: keep game writes available during index build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GameMonthStat_year_mode_catId_playerId_idx" ON "GameMonthStat"(year,mode,"catId","playerId");
