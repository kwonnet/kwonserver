import prisma from "@/db";
import { gameIntegrityQueue } from "@/cron/jobs/queue";
import { PromisePool } from "@supercharge/promise-pool";
import logger from "@/logger";

/** Durable evidence is written with the game debit, never on the UI critical path. */
export async function recoverGameIntegrityCases() {
  const cases = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "GameIntegrityCase" SET "nextAttemptAt"=NOW()+INTERVAL '5 minutes'
    WHERE id IN (SELECT id FROM "GameIntegrityCase" WHERE status='PENDING' AND "nextAttemptAt"<=NOW()
      ORDER BY "nextAttemptAt",id LIMIT 200 FOR UPDATE SKIP LOCKED) RETURNING id`;
  const { errors } = await PromisePool.for(cases)
    .withConcurrency(4)
    .process(async (item) => {
      try {
        const existing = await gameIntegrityQueue.getJob(item.id);
        if (existing && (await existing.getState()) === "failed")
          await existing.remove();
        await gameIntegrityQueue.add(
          "prepare-review",
          { caseId: item.id },
          {
            jobId: item.id,
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { age: 7 * 86400, count: 10000 },
            removeOnFail: { age: 30 * 86400, count: 10000 },
          },
        );
        await prisma.gameIntegrityCase.update({
          where: { id: item.id },
          data: { queuedAt: new Date() },
        });
      } catch (error) {
        logger.error(
          { event: "game_integrity_enqueue_failed", caseId: item.id, error },
          "Review evidence remains pending",
        );
        throw error;
      }
    });
  if (errors.length)
    throw new Error(`${errors.length} game integrity cases remain pending`);
}

/** Queue processing prepares a human review, never automatically labels/bans an account. */
export async function prepareGameIntegrityReview(caseId: unknown) {
  if (typeof caseId !== "string" || !/^[a-f0-9]{64}$/.test(caseId))
    throw new Error("Invalid game integrity case");
  await prisma.gameIntegrityCase.updateMany({
    where: { id: caseId, status: "PENDING" },
    data: { status: "AWAITING_REVIEW", reviewReadyAt: new Date() },
  });
}
