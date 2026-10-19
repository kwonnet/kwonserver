import "dotenv/config";
import prisma from "@/db";
import logger from "@/logger";
import redis from "@/redis";
import { ensureRewardRanking } from "./periodRecovery";
import { gamePeriod, isoGameWeek } from "@/utils/game-periods";

/** Run with legacy game writers and reward workers stopped during the v2 cutover. */
async function main() {
  if (!process.argv.includes("--writers-stopped"))
    throw new Error(
      "Stop game writers and reward workers first; then pass --writers-stopped",
    );
  const now = new Date(),
    current = gamePeriod(now),
    previousMonth = new Date(Date.UTC(current.year, current.month - 2, 1));
  const previousWeek = isoGameWeek(new Date(now.getTime() - 7 * 86400000));
  const categories = await prisma.gameCategory.findMany({
    include: { game: { select: { modes: true } } },
    orderBy: { id: "asc" },
  });
  let repaired = 0;
  for (const category of categories)
    for (const mode of category.game.modes) {
      const periods: Parameters<typeof ensureRewardRanking>[2][] = [
        { kind: "month", year: current.year, month: current.month },
        {
          kind: "month",
          year: previousMonth.getUTCFullYear(),
          month: previousMonth.getUTCMonth() + 1,
        },
        { kind: "week", year: current.weekYear, week: current.week },
        { kind: "week", year: previousWeek.year, week: previousWeek.week },
        {
          kind: "today",
          year: current.year,
          month: current.month,
          day: current.day,
        },
      ];
      for (const period of periods)
        for (;;) {
          try {
            await ensureRewardRanking(category.id, mode, period, {
              rebuildCurrent: true,
            });
            break;
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "Legacy ranking migration is still in progress"
            )
              continue;
            logger.error(
              {
                event: "game_ranking_repair_failed",
                category: category.id,
                mode,
                period,
                error,
              },
              "Ranking repair stopped",
            );
            throw error;
          }
        }
      console.log(
        JSON.stringify({ category: category.id, mode, repaired: ++repaired }),
      );
    }
}
async function run() {
  try {
    await main();
  } catch (error) {
    logger.error(
      { event: "game_ranking_repair_failed", error },
      "Game ranking repair failed",
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    if (redis.isOpen) await redis.quit();
  }
}
run().catch((error) => {
  logger.error(
    { event: "game_ranking_repair_shutdown_failed", error },
    "Game ranking repair shutdown failed",
  );
  process.exitCode = 1;
});
