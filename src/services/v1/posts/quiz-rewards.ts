import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/db";
import { cents } from "@/services/walletLedger";
import { logServiceError } from "@/logger/events";

const unlockedWallet: Prisma.WalletWhereInput = {
  OR: [{ isLocked: false }, { isLocked: null }],
};

// Selection commits once. Payout batches lock the quiz and wallets, so a crash
// either commits both balance/ledger writes or leaves the awards pending.
export async function settleQuizRewardBatch(quizId: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Quiz" WHERE id=${quizId} FOR UPDATE`;
      const quiz = await tx.quiz.findUniqueOrThrow({
        where: { id: quizId },
        include: { post: true },
      });
      if (
        !["FUNDED", "SELECTED"].includes(quiz.settlementStatus) ||
        quiz.expireAt > new Date()
      )
        return { done: true, paid: 0 };
      if (!quiz.fundedAmount || !quiz.fundingTxnRef) {
        await tx.quiz.update({
          where: { id: quizId },
          data: { settlementStatus: "REVIEW" },
        });
        return { done: true, paid: 0 };
      }
      const pool = cents(quiz.fundedAmount);
      if (quiz.settlementStatus === "FUNDED") {
        const funding = await tx.transaction.findFirst({
          where: {
            txnRef: quiz.fundingTxnRef!,
            postId: quiz.postId,
            userId: quiz.post.userId,
            type: "DEBIT",
            status: "COMPLETED",
            category: "QUIZ_POST",
            currency: "COINS",
          },
        });
        if (
          !funding ||
          cents(funding.amount) !==
            pool + cents(quiz.feeAmount ?? new Prisma.Decimal(0), true) ||
          (await tx.quizReward.count({ where: { quizId } }))
        ) {
          await tx.quiz.update({
            where: { id: quizId },
            data: { settlementStatus: "REVIEW" },
          });
          return { done: true, paid: 0 };
        }
        const seed = randomBytes(32).toString("hex"),
          limit = Math.min(quiz.maxWinners, pool);
        const candidates =
          quiz.post.status === "PUBLISHED" && !quiz.post.deletedAt && limit > 0
            ? await tx.$queryRaw<
                { userId: string }[]
              >`SELECT p."userId" FROM "QuizParticipant" p
          JOIN "User" u ON u.id=p."userId" JOIN "Wallet" w ON w.user_id=u.id
          WHERE p."quizId"=${quizId} AND p."isCorrect"=true AND p."createdAt"<=${quiz.expireAt}
          AND p."userId"<>${quiz.post.userId} AND u.status IN ('ACTIVE','PRIVATE') AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL
          ORDER BY md5(p."userId" || ${seed}),p.id LIMIT ${limit}`
            : [];
        if (!candidates.length) {
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE user_id=${quiz.post.userId} FOR UPDATE`;
          const wallet = await tx.wallet.update({
            where: { userId: quiz.post.userId },
            data: { coins: { increment: pool / 100 } },
          });
          await tx.transaction.create({
            data: {
              userId: quiz.post.userId,
              walletId: wallet.id,
              postId: quiz.postId,
              txnRef: `quiz-refund-${quizId}`,
              amount: pool / 100,
              type: "CREDIT",
              status: "COMPLETED",
              category: "COIN_REFUND",
              source: "COINS",
              currency: "COINS",
              gateway: "WALLET",
              description: "Unawarded quiz pool returned",
              metadata: {
                quizId,
                platformFeeCoins: Number(quiz.feeAmount ?? 0),
              },
            },
          });
          await tx.notification.create({
            data: {
              sourceKey: `quiz-reward:refund:${quizId}`,
              recipientId: quiz.post.userId,
              type: "NONE",
              postId: quiz.postId,
              meta: { kind: "quiz-refund", quizId },
              title: "Quiz pool returned",
              message: `Your quiz duration has elapsed. No winners qualified, so your ${pool / 100} coin reward pool was returned. The creation fee is retained.`,
            },
          });
          await tx.quiz.update({
            where: { id: quizId },
            data: {
              settlementStatus: "REFUNDED",
              settledAt: new Date(),
              selectionSeed: seed,
            },
          });
          return { done: true, paid: 0 };
        }
        await tx.notification.create({
          data: {
            sourceKey: `quiz-reward:elapsed:${quizId}`,
            recipientId: quiz.post.userId,
            postId: quiz.postId,
            type: "NONE",
            title: "Quiz duration elapsed",
            message: `Your quiz has ended. The ${pool / 100} coin reward pool will be shared among ${candidates.length} selected correct-answer winners. View all winners in your post engagements.`,
            meta: {
              kind: "quiz-ended",
              quizId,
              winnerCount: candidates.length,
              poolCoins: pool / 100,
            },
          },
        });
        const share = Math.floor(pool / candidates.length),
          remainder = pool % candidates.length;
        for (let start = 0; start < candidates.length; start += 1000)
          await tx.quizReward.createMany({
            data: candidates.slice(start, start + 1000).map((candidate, i) => ({
              id: createHash("sha256")
                .update(`${quizId}:${candidate.userId}`)
                .digest("hex"),
              quizId,
              userId: candidate.userId,
              amount: (share + (start + i < remainder ? 1 : 0)) / 100,
              status: "PENDING",
            })),
          });
        await tx.quiz.update({
          where: { id: quizId },
          data: { settlementStatus: "SELECTED", selectionSeed: seed },
        });
      }
      const pending = await tx.quizReward.findMany({
        where: {
          quizId,
          status: "PENDING",
          user: { wallet: { is: unlockedWallet } },
        },
        take: 100,
        orderBy: { id: "asc" },
      });
      let paid = 0;
      if (pending.length) {
        const ids = pending.map((award) => award.userId).sort();
        await tx.$queryRaw`SELECT id FROM "Wallet" WHERE user_id IN (${Prisma.join(ids)}) ORDER BY user_id FOR UPDATE`;
        const unlocked = await tx.wallet.findMany({
          where: { userId: { in: ids }, ...unlockedWallet },
          select: { id: true, userId: true },
        });
        const wallets = new Map(
          unlocked.map((wallet) => [wallet.userId, wallet.id]),
        );
        const awards = pending.filter((award) => wallets.has(award.userId));
        paid = awards.length;
        if (awards.length) {
          const values = Prisma.join(
            awards.map(
              (award) => Prisma.sql`(${award.userId},${award.amount}::numeric)`,
            ),
          );
          await tx.$executeRaw`UPDATE "Wallet" w SET coins=w.coins+v.amount,"updatedAt"=NOW() FROM (VALUES ${values}) AS v(user_id,amount) WHERE w.user_id=v.user_id`;
          await tx.transaction.createMany({
            data: awards.map((award) => ({
              userId: award.userId,
              walletId: wallets.get(award.userId)!,
              postId: quiz.postId,
              txnRef: `quiz-award-${award.id}`,
              amount: award.amount,
              type: "CREDIT" as const,
              status: "COMPLETED" as const,
              category: "QUIZ_POST" as const,
              source: "COINS" as const,
              currency: "COINS" as const,
              gateway: "WALLET" as const,
              description: "Reward quiz winnings",
              metadata: { quizId, awardId: award.id },
            })),
          });
          await tx.notification.createMany({
            data: awards.map((award) => ({
              sourceKey: `quiz-reward:${award.id}`,
              recipientId: award.userId,
              postId: quiz.postId,
              meta: {
                kind: "quiz-reward",
                quizId,
                awardId: award.id,
                coins: award.amount.toString(),
              },
              type: "NONE" as const,
              title: "Quiz reward received",
              message: `You won ${award.amount.toString()} coins in a rewarded quiz.`,
            })),
          });
          await tx.quizReward.updateMany({
            where: {
              id: { in: awards.map((award) => award.id) },
              status: "PENDING",
            },
            data: { status: "COMPLETED", paidAt: new Date() },
          });
        }
      }
      const remaining = await tx.quizReward.count({
        where: { quizId, status: "PENDING" },
      });
      if (!remaining)
        await tx.quiz.update({
          where: { id: quizId },
          data: { settlementStatus: "COMPLETED", settledAt: new Date() },
        });
      return { done: !remaining, paid };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

export async function settleDueQuizRewards() {
  const due = await prisma.quiz.findMany({
    where: {
      expireAt: { lte: new Date() },
      OR: [
        { settlementStatus: "FUNDED" },
        {
          settlementStatus: "SELECTED",
          winners: {
            some: {
              status: "PENDING",
              user: { wallet: { is: unlockedWallet } },
            },
          },
        },
      ],
    },
    select: { id: true },
    orderBy: [{ expireAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  const failures: unknown[] = [];
  for (const quiz of due)
    try {
      for (let batch = 0; batch < 20; batch++) {
        const result = await settleQuizRewardBatch(quiz.id);
        if (result.done || !result.paid) break;
      }
    } catch (error) {
      logServiceError("v1/posts/quiz-rewards", "settleDueQuizRewards", error);
      failures.push(error);
    }
  if (failures.length)
    throw new Error(
      `${failures.length} quiz settlements need retry; pending awards retained`,
    );
}
