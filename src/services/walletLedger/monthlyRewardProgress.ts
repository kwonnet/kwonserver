import {Prisma} from '@prisma/client';
import prisma from '@/db';

/** Actual committed progress, not queue length or the local test benchmark. */
export async function getMonthlyRewardProgress(period?: {year: number; month: number}, includeNotifications = false) {
  if (period && (!Number.isInteger(period.year) || !Number.isInteger(period.month) || period.year < 1970 || period.month < 1 || period.month > 12)) {
    throw new Error('Invalid monthly reward period');
  }
  const rows = await prisma.$queryRaw<{
    year: number; month: number; settlements: number; completed: number; failed: number; unplanned: number;
    qualifying: number; processed: number; notificationBatchesPending: number | null; notificationBatchesCompleted: number | null; startedAt: Date | null; completedAt: Date | null;
  }[]>(Prisma.sql`
    SELECT s.year, s.month, COUNT(*)::int AS settlements,
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE s.status = 'FAILED')::int AS failed,
      COUNT(*) FILTER (WHERE a.id IS NULL AND s.status <> 'COMPLETED')::int AS unplanned,
      COALESCE(SUM(a."rewardParticipants"),0)::float8 AS qualifying,
      COALESCE(SUM(a."processedParticipants"),0)::float8 AS processed,
      ${includeNotifications ? Prisma.sql`COALESCE(SUM(d.pending),0)::float8` : Prisma.sql`NULL::float8`} AS "notificationBatchesPending",
      ${includeNotifications ? Prisma.sql`COALESCE(SUM(d.completed),0)::float8` : Prisma.sql`NULL::float8`} AS "notificationBatchesCompleted",
      MIN(s."startedAt") AS "startedAt", MAX(s."completedAt") AS "completedAt"
    FROM "MonthlyRewardSettlement" s LEFT JOIN "GameMonthRewardStat" a ON a.id = s.id
    ${includeNotifications ? Prisma.sql`LEFT JOIN (SELECT "settlementId", COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
      COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed FROM "MonthlyRewardDelivery" GROUP BY "settlementId") d
      ON d."settlementId" = s.id` : Prisma.empty}
    ${period ? Prisma.sql`WHERE s.year = ${period.year} AND s.month = ${period.month}` : Prisma.empty}
    GROUP BY s.year, s.month
    ${period ? Prisma.empty : Prisma.sql`HAVING BOOL_OR(s.status <> 'COMPLETED') OR MAX(s."completedAt") > NOW() - INTERVAL '1 day' ${includeNotifications ? Prisma.sql`OR COALESCE(SUM(d.pending),0) > 0` : Prisma.empty}`}
    ORDER BY s.year, s.month`);
  return rows.map(row => {
    const remaining = Math.max(0, row.qualifying - row.processed);
    const end = row.completed === row.settlements ? row.completedAt?.getTime() ?? Date.now() : Date.now();
    const elapsedSeconds = row.startedAt ? Math.max(1, (end - row.startedAt.getTime()) / 1000) : 0;
    const measuredPerSecond = elapsedSeconds ? row.processed / elapsedSeconds : 0;
    return {...row, remaining, measuredPerSecond: Math.round(measuredPerSecond * 100) / 100,
      estimatedRemainingSeconds: !row.unplanned && remaining === 0 ? 0 : row.unplanned || !measuredPerSecond ? null : Math.ceil(remaining / measuredPerSecond)};
  });
}
