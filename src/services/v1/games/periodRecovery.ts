import { createHash, randomUUID } from "node:crypto";
import { walletOperation } from "@/services/walletLedger";
import { GameMode, Prisma } from "@prisma/client";
import prisma from "@/db";
import redis from "@/redis";
import logger from "@/logger";
import {
  isoGameWeek,
  isoWeekStart,
  rankingKeysAt,
  playerKeysAt,
  GAME_PERIOD_RETENTION_SECONDS,
} from "@/utils/game-periods";
import { recoverRoundProjections } from "./rounds";

type Period = {
  kind: "month" | "week" | "today";
  year: number;
  month?: number;
  week?: number;
  day?: number;
};
export function periodBounds(period: Period) {
  const start =
    period.kind === "week"
      ? isoWeekStart(period.year, period.week!)
      : new Date(
          Date.UTC(
            period.year,
            period.month! - 1,
            period.kind === "today" ? period.day! : 1,
          ),
        );
  const end =
    period.kind === "month"
      ? new Date(Date.UTC(period.year, period.month!, 1))
      : new Date(start.getTime() + (period.kind === "week" ? 7 : 1) * 86400000);
  return { start, end };
}
/** Stable per-batch receipts migrate immutable legacy input without re-adding it. */
export async function migrateLegacyRanking(
  source: string,
  catId: string,
  mode: "single" | "multi",
  period: Period,
) {
  if (!(await redis.exists(source))) return;
  const hash = createHash("sha256").update(source).digest("hex"),
    progress = `game:migrate:v2:${hash}`,
    snapshot = `${progress}:source`;
  if (await redis.hGet(progress, "done")) return;
  await redis.eval(
    "if redis.call('EXISTS',KEYS[2])==0 then redis.call('COPY',KEYS[1],KEYS[2]);redis.call('PERSIST',KEYS[2]) end;return 1",
    { keys: [source, snapshot], arguments: [] },
  );
  const { start, end } = periodBounds(period),
    target = rankingKeysAt(catId, mode, start)[period.kind];
  let cursor = Number((await redis.hGet(progress, "offset")) ?? 0);
  // Bounded work per invocation; the watchdog continues this source on retry.
  const total = await redis.zCard(snapshot);
  for (let batch = 0; cursor < total && batch < 20; batch++) {
    const entries = await redis.zRangeWithScores(
      snapshot,
      cursor,
      cursor + 499,
    );
    if (!entries.length) throw new Error("Legacy ranking snapshot incomplete");
    const oldStats = await Promise.all(
      entries.map(async (entry) => {
        const prefix = source.replace(
          "ranking:cat:",
          `player:${entry.value}:cat:`,
        );
        return await redis.hGetAll(prefix);
      }),
    );
    const unknown = entries
      .filter((e, i) => e.score === 0 && !Number(oldStats[i].numPlayed))
      .map((e) => e.value);
    const accepted = unknown.length
      ? await prisma.gameWalletAction.findMany({
          where: {
            userId: { in: unknown },
            status: "DELIVERED",
            kind: { in: ["ANSWER", "ACRONYM", "WORDMAKER"] },
            createdAt: { gte: start, lt: end },
            payload: { path: ["catId"], equals: catId },
          },
          select: { userId: true },
          distinct: ["userId"],
        })
      : [];
    const confirmed = new Set(accepted.map((a) => a.userId));
    const players = entries.flatMap((entry, i) => {
      if (!Number.isSafeInteger(entry.score))
        throw new Error("Legacy ranking has an invalid score");
      if (
        entry.score === 0 &&
        !Number(oldStats[i].numPlayed) &&
        !confirmed.has(entry.value)
      )
        return [];
      const keys = playerKeysAt(entry.value, catId, mode, start);
      return [
        {
          id: entry.value,
          score: entry.score,
          numPlayed: Math.max(1, Number(oldStats[i].numPlayed) || 1),
          stat: keys[period.kind],
        },
      ];
    });
    await hydrateProfiles(
      players.map((p) => p.id),
      catId,
      mode,
      start,
    );
    if (period.kind !== "month" && players.length)
      await walletOperation(
        "game-ranking-migration",
        `${source}:${cursor}`,
        {},
        [],
        async (tx) => {
          await tx.$executeRaw(Prisma.sql`INSERT INTO "GamePeriodStat" (id,"playerId","catId",mode,kind,"periodStart",score,"numPlayed","updatedAt") VALUES
        ${Prisma.join(players.map((p) => Prisma.sql`(${randomUUID()},${p.id},${catId},${mode.toUpperCase()}::"GameMode",${period.kind},${start},${p.score},${p.numPlayed},NOW())`))}
        ON CONFLICT("playerId","catId",mode,kind,"periodStart") DO UPDATE SET score="GamePeriodStat".score+EXCLUDED.score,"numPlayed"="GamePeriodStat"."numPlayed"+EXCLUDED."numPlayed","updatedAt"=NOW()`);
          return { migrated: players.length };
        },
      );
    const next = cursor + entries.length;
    await redis.eval(
      `if tonumber(redis.call('HGET',KEYS[1],'offset') or '0')~=tonumber(ARGV[1]) then return 0 end
      local rows=cjson.decode(ARGV[3]);for _,p in ipairs(rows) do redis.call('ZINCRBY',KEYS[2],p.score,p.id);redis.call('HINCRBY',p.stat,'score',p.score);redis.call('HINCRBY',p.stat,'numPlayed',p.numPlayed);redis.call('EXPIRE',p.stat,ARGV[4]) end
      redis.call('EXPIRE',KEYS[2],ARGV[4]);redis.call('HSET',KEYS[1],'offset',ARGV[2]);return 1`,
      {
        keys: [progress, target],
        arguments: [
          String(cursor),
          String(next),
          JSON.stringify(players),
          String(GAME_PERIOD_RETENTION_SECONDS),
        ],
      },
    );
    cursor = Number(await redis.hGet(progress, "offset"));
  }
  if (cursor < total)
    throw new Error("Legacy ranking migration is still in progress");
  await redis.hSet(progress, "done", "1");
  await redis.expire(progress, GAME_PERIOD_RETENTION_SECONDS);
  await redis.unlink(snapshot);
  // Existing frozen payment snapshots remain independent and are never renamed.
  await redis.expire(source, GAME_PERIOD_RETENTION_SECONDS);
}

export async function ensureRewardRanking(
  catId: string,
  mode: GameMode,
  period: Period,
  options?: { rebuildCurrent?: boolean },
) {
  const { start, end } = periodBounds(period),
    lower = mode === "SINGLE" ? "single" : "multi";
  const canonical = rankingKeysAt(catId, lower, start)[period.kind];
  // Old weekly keys used the calendar month/year of each individual day.
  const legacy = new Set<string>();
  for (
    let day = new Date(start);
    day < end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const year = day.getUTCFullYear(),
      month = day.getUTCMonth() + 1;
    const number =
      period.kind === "week"
        ? isoGameWeek(day).week
        : period.kind === "today"
          ? day.getUTCDate()
          : month;
    legacy.add(
      `ranking:cat:${catId}:mode:${lower}:${year}:${month}:${period.kind}:${number}`,
    );
    if (period.kind === "month") break;
  }
  let hasLegacy = false;
  for (const source of legacy) {
    if (await redis.exists(source)) hasLegacy = true;
    await migrateLegacyRanking(source, catId, lower, period);
  }
  await recoverRoundProjections();
  const pending = await prisma.gameRoundRecord.count({
    where: {
      catId,
      mode,
      playedAt: { gte: start, lt: end },
      OR: [{ status: "PENDING" }, { projectionPending: true }],
    },
  });
  if (pending)
    throw new Error(
      "Closed-period rounds still require recovery before rewards",
    );
  const recorded = await prisma.gameRoundRecord.count({
    where: { catId, mode, playedAt: { gte: start, lt: end } },
  });
  const replaceClosed =
    !hasLegacy &&
    (options?.rebuildCurrent === true ||
      (recorded > 0 && end.getTime() <= Date.now()));
  if (!replaceClosed && (await redis.exists(canonical))) return canonical;
  // Never derive a daily or weekly ranking from monthly totals.
  const temp = `${canonical}:rebuild:${randomUUID()}`;
  let cursor: string | undefined,
    count = 0;
  for (;;) {
    const rows =
      period.kind === "month"
        ? await prisma.gameMonthStat.findMany({
            where: {
              catId,
              mode,
              year: period.year,
              month: period.month,
              numPlayed: { gt: 0 },
              ...(cursor ? { playerId: { gt: cursor } } : {}),
            },
            orderBy: { playerId: "asc" },
            take: 500,
            select: { playerId: true, score: true, numPlayed: true },
          })
        : await prisma.gamePeriodStat.findMany({
            where: {
              catId,
              mode,
              kind: period.kind,
              periodStart: start,
              numPlayed: { gt: 0 },
              ...(cursor ? { playerId: { gt: cursor } } : {}),
            },
            orderBy: { playerId: "asc" },
            take: 500,
            select: { playerId: true, score: true, numPlayed: true },
          });
    if (!rows.length) break;
    await redis.zAdd(
      temp,
      rows.map((row) => ({ value: row.playerId, score: row.score })),
    );
    await hydrateProfiles(
      rows.map((row) => row.playerId),
      catId,
      lower,
      start,
    );
    const pipeline = redis.multi();
    for (const row of rows) {
      const key = playerKeysAt(row.playerId, catId, lower, start)[period.kind];
      if (replaceClosed)
        pipeline.hSet(key, { score: row.score, numPlayed: row.numPlayed });
      else {
        pipeline.hSetNX(key, "score", String(row.score));
        pipeline.hSetNX(key, "numPlayed", String(row.numPlayed));
      }
      pipeline.expire(key, GAME_PERIOD_RETENTION_SECONDS);
    }
    await pipeline.exec();
    await redis.expire(temp, GAME_PERIOD_RETENTION_SECONDS);
    count += rows.length;
    cursor = rows.at(-1)!.playerId;
  }
  if (count) {
    await redis.expire(temp, GAME_PERIOD_RETENTION_SECONDS);
    await redis.eval(
      "if ARGV[1]=='1' or redis.call('EXISTS',KEYS[2])==0 then redis.call('RENAME',KEYS[1],KEYS[2]) else redis.call('DEL',KEYS[1]) end;return 1",
      { keys: [temp, canonical], arguments: [replaceClosed ? "1" : "0"] },
    );
  } else {
    const accepted = await prisma.gameWalletAction.count({
      where: {
        status: "DELIVERED",
        kind: { in: ["ANSWER", "ACRONYM", "WORDMAKER"] },
        createdAt: { gte: start, lt: end },
        payload: { path: ["catId"], equals: catId },
      },
    });
    if (accepted)
      throw new Error(
        "Ranking missing despite accepted paid answers; reconcile before rewarding",
      );
    if (replaceClosed) await redis.unlink(canonical);
  }
  return canonical;
}

export async function archiveClosedGameMonth(year: number, month: number) {
  // Rank the authoritative rows, retaining every input until settlement succeeds.
  await prisma.$executeRaw`WITH ranked AS (
    SELECT id,ROW_NUMBER() OVER(PARTITION BY "catId",mode ORDER BY score DESC,"playerId" DESC)::int AS rank
    FROM "GameMonthStat" WHERE year=${year} AND month=${month}
  ) UPDATE "GameMonthStat" s SET rank=r.rank FROM ranked r WHERE s.id=r.id`;
}

/** Rank caches must not lose names/avatars when a player has not rejoined yet. */
async function hydrateProfiles(
  ids: string[],
  catId: string,
  mode: "single" | "multi",
  date: Date,
) {
  if (!ids.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, avatar: true },
  });
  const pipeline = redis.multi();
  for (const user of users) {
    const key = playerKeysAt(user.id, catId, mode, date).info;
    pipeline.hSetNX(key, "id", user.id);
    pipeline.hSetNX(key, "name", user.username);
    pipeline.hSetNX(key, "avatar", user.avatar ?? "");
    pipeline.expire(key, GAME_PERIOD_RETENTION_SECONDS);
  }
  await pipeline.exec();
}
