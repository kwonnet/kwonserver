import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
vi.mock("@/utils/webpush", () => ({ default: {} }));
vi.mock("@/cron/utils", () => ({
  enqueuePostTopic: vi.fn().mockResolvedValue(undefined),
}));
import {getNotificationStreamSnapshot} from "@/services/v1/notifications";
import { createPost, voteQuizPost, getPostQuizWinners,getPostEngagementsOverview } from "@/services/v1/posts";
import {
  settleQuizRewardBatch,
  settleDueQuizRewards,
} from "@/services/v1/posts/quiz-rewards";
import { PostCreateSchema } from "@/schema/post";
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 12,
  }),
});
const prefix = "reward-test-",
  owner = prefix + "owner",
  users = Array.from({ length: 4 }, (_, i) => prefix + "winner-" + i);
const body = (overrides: any = {}) =>
  PostCreateSchema.parse({
    expectedQuizFee: 0.15,
    isDraft: false,
    thread: [
      {
        type: "QUIZ",
        scope: "ANYONE",
        content: "Reward question",
        media: [],
        quiz: {
          scope: "NONE",
          isPaid: true,
          rewardAmount: 1000,
          maxWinners: 2000,
          duration: { days: 1, hours: 0, minutes: 0 },
          options: [
            { id: "yes", text: "Correct", isCorrect: true },
            { id: "no", text: "Incorrect", isCorrect: false },
          ],
        },
      },
    ],
    ...overrides,
  });
async function funded(key: string, pool = 1000, maxWinners = 2000) {
  await db.wallet.update({ where: { userId: owner }, data: { coins: 100000 } });
  const payload = body();
  payload.thread[0].quiz!.rewardAmount = pool;
  payload.thread[0].quiz!.maxWinners = maxWinners;
  const response = await createPost(payload, owner, "quiz-test-" + key);
  expect(response.status).toBe(200);
  return db.quiz.findUniqueOrThrow({
    where: { postId: (response.data as any).id },
    include: { options: true },
  });
}
async function expire(quizId: string) {
  await db.quiz.update({
    where: { id: quizId },
    data: { expireAt: new Date() },
  });
}
async function enter(quiz: any, user: string, correct = true) {
  const option = quiz.options.find((o: any) => o.isCorrect === correct)!;
  return voteQuizPost(quiz.postId, option.id, user);
}
beforeAll(async () => {
  await db.accountLevelBenefit.update({where:{level:0},data:{postQuizChargeBps:1500}});
  for (const id of [owner, ...users])
    await db.user.create({
      data: {
        id,
        name: id,
        email: id + "@test.invalid",
        username: id,
        status: "ACTIVE",
        wallet: { create: { coins: id === owner ? 100000 : 0 } },
      },
    });
});
// The scale test creates 50,000 accounts; await their FK cascades on CI.
afterAll(async () => {
  await db.accountLevelBenefit.update({where:{level:0},data:{postQuizChargeBps:2000}});
  try {
    const where = { quiz: { post: { userId: owner } } };
    await db.quizReward.deleteMany({ where });
    await db.quizParticipant.deleteMany({ where });
    await db.quizOption.deleteMany({ where });
    await db.quiz.deleteMany({ where: { post: { userId: owner } } });
    await db.transaction.deleteMany({ where: { post: { userId: owner } } });
    await db.notification.deleteMany({
      where: { recipientId: { startsWith: prefix } },
    });
    await db.post.deleteMany({ where: { userId: owner } });
    await db.walletOperation.deleteMany({
      where: { scope: { startsWith: "quiz-create:" + owner } },
    });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  } finally {
    await db.$disconnect();
  }
}, 120000);
it("charges pool plus dynamic fee once across concurrent creation retries and retains the original snapshot", async () => {
  await db.wallet.update({ where: { userId: owner }, data: { coins: 5000 } });
  const payload = body(),
    responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        createPost(payload, owner, "quiz-create-concurrent"),
      ),
    );
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(new Set(responses.map((r) => (r.data as any).id)).size).toBe(1);
  const quiz = await db.quiz.findUniqueOrThrow({
    where: { postId: (responses[0].data as any).id },
  });
  expect(Number(quiz.fundedAmount)).toBe(1000);
  expect(Number(quiz.feeAmount)).toBe(150);
  expect(Number(quiz.feeRate)).toBe(0.15);
  expect(quiz.settlementStatus).toBe("FUNDED");
  expect(
    Number(
      (await db.wallet.findUniqueOrThrow({ where: { userId: owner } })).coins,
    ),
  ).toBe(3850);
  expect(
    (
      await db.transaction.findFirstOrThrow({
        where: { txnRef: quiz.fundingTxnRef! },
      })
    ).metadata,
  ).toMatchObject({
    rewardPoolCoins: 1000,
    platformFeeCoins: 150,
    quizFeeRate: 0.15,
  });
  await db.accountLevelBenefit.update({where:{level:0},data:{postQuizChargeBps:2000}});
  try {
    expect(
      (await createPost(payload, owner, "quiz-create-concurrent")).status,
    ).toBe(200);
    expect(
      (await createPost(payload, owner, "quiz-new-stale-rate")).status,
    ).toBe(409);
    const result = await createPost(
      { ...payload, expectedQuizFee: 0.2 },
      owner,
      "quiz-new-current-rate",
    );
    expect(result.status).toBe(200);
    expect(
      Number(
        (await db.wallet.findUniqueOrThrow({ where: { userId: owner } })).coins,
      ),
    ).toBe(2650);
  } finally {
    await db.accountLevelBenefit.update({where:{level:0},data:{postQuizChargeBps:1500}});
  }
});
it("requires enough coins for the fee too and rejects blank choices without creating or debiting", async () => {
  await db.wallet.update({ where: { userId: owner }, data: { coins: 1100 } });
  const before = await db.post.count({ where: { userId: owner } });
  expect((await createPost(body(), owner, "quiz-too-poor-fee")).status).toBe(
    400,
  );
  const invalid = body();
  invalid.thread[0].quiz!.options[1].text = "  ";
  expect((await createPost(invalid, owner, "quiz-blank-option")).status).toBe(
    400,
  );
  expect(await db.post.count({ where: { userId: owner } })).toBe(before);
  expect(
    Number(
      (await db.wallet.findUniqueOrThrow({ where: { userId: owner } })).coins,
    ),
  ).toBe(1100);
});
it("does not fund drafts and calculates scheduled deadlines from publication time", async () => {
  const draft = await createPost(body({ isDraft: true }), owner);
  expect(draft.status).toBe(200);
  expect(
    (
      await db.quiz.findUniqueOrThrow({
        where: { postId: (draft.data as any).id },
      })
    ).settlementStatus,
  ).toBe("UNFUNDED");
  await db.wallet.update({ where: { userId: owner }, data: { coins: 5000 } });
  const scheduleAt = new Date(Date.now() + 3600000).toISOString();
  const result = await createPost(
    body({ scheduleAt }),
    owner,
    "quiz-scheduled-create",
  );
  expect(result.status).toBe(200);
  const quiz = await db.quiz.findUniqueOrThrow({
    where: { postId: (result.data as any).id },
  });
  expect(quiz.expireAt.getTime()).toBe(
    new Date(scheduleAt).getTime() + 86400000,
  );
  expect(await settleQuizRewardBatch(quiz.id)).toMatchObject({
    done: true,
    paid: 0,
  });
  expect(await db.quizReward.count({ where: { quizId: quiz.id } })).toBe(0);
});
it("records at most one answer, rejects creator, expired, and unrelated options", async () => {
  const quiz = await funded("votes"),
    other = await funded("other-option");
  expect((await enter(quiz, owner)).status).toBe(400);
  expect(
    (await voteQuizPost(quiz.postId, other.options[0].id, users[0])).status,
  ).toBe(400);
  expect((await enter(quiz, users[0])).status).toBe(200);
  expect((await enter(quiz, users[0])).status).toBe(200);
  expect((await enter(quiz, users[0], false)).status).toBe(409);
  expect(await db.quizParticipant.count({ where: { quizId: quiz.id } })).toBe(
    1,
  );
  expect(
    (
      await db.quizOption.findUniqueOrThrow({
        where: { id: quiz.options.find((o) => o.isCorrect)!.id },
      })
    ).votes,
  ).toBe(1);
  await expire(quiz.id);
  expect((await enter(quiz, users[1])).status).toBe(400);
});
it("splits every fractional coin among correct winners once under concurrent workers; a user can win multiple quizzes", async () => {
  const quiz = await funded("split", 1000, 3);
  for (const user of users)
    expect((await enter(quiz, user, user !== users[3])).status).toBe(200);
  await expire(quiz.id);
  const before = await db.wallet.findMany({
    where: { userId: { in: users } },
    orderBy: { userId: "asc" },
  });
  await Promise.all([
    settleQuizRewardBatch(quiz.id),
    settleQuizRewardBatch(quiz.id),
    settleQuizRewardBatch(quiz.id),
  ]);
  const awards = await db.quizReward.findMany({ where: { quizId: quiz.id } });
  expect(awards).toHaveLength(3);
  expect(awards.every((a) => a.status === "COMPLETED")).toBe(true);
  expect(
    awards.reduce((sum, a) => sum + Math.round(Number(a.amount) * 100), 0),
  ).toBe(100000);
  expect(awards.map((a) => Number(a.amount)).sort()).toEqual([
    333.33, 333.33, 333.34,
  ]);
  expect(awards.some((a) => a.userId === users[3])).toBe(false);
  const after = await db.wallet.findMany({
    where: { userId: { in: users } },
    orderBy: { userId: "asc" },
  });
  expect(
    after.reduce(
      (s, w, i) => s + Math.round(Number(w.coins.minus(before[i].coins)) * 100),
      0,
    ),
  ).toBe(100000);
  expect(
    await db.transaction.count({
      where: { postId: quiz.postId, type: "CREDIT" },
    }),
  ).toBe(3);
  expect(
    await db.notification.count({
      where: {
        recipientId: { in: users },
        sourceKey: { in: awards.map((a) => "quiz-reward:" + a.id) },
      },
    }),
  ).toBe(3);
  const ended=await db.notification.findMany({where:{sourceKey:`quiz-reward:elapsed:${quiz.id}`}});
  expect(ended).toHaveLength(1);expect(ended[0]).toMatchObject({recipientId:owner,postId:quiz.postId,title:'Quiz duration elapsed',meta:{kind:'quiz-ended',winnerCount:3,poolCoins:1000}});
  expect(await getNotificationStreamSnapshot(owner)).toMatchObject({userId:owner,latestNotificationId:ended[0].id});
  for(const award of awards){
    const notice=await db.notification.findUniqueOrThrow({where:{sourceKey:`quiz-reward:${award.id}`}});
    expect(notice).toMatchObject({recipientId:award.userId,postId:quiz.postId,meta:{kind:'quiz-reward',coins:award.amount.toString()}});
    expect(await getNotificationStreamSnapshot(award.userId)).toMatchObject({userId:award.userId,latestNotificationId:notice.id});
  }
  expect(await getNotificationStreamSnapshot(users[3])).toMatchObject({totalUnseenCount:0});
  expect((await getPostQuizWinners(quiz.postId,users[0])).status).toBe(403);
  const page1=(await getPostQuizWinners(quiz.postId,owner,1,2)).data as any,page2=(await getPostQuizWinners(quiz.postId,owner,2,2)).data as any;
  expect(page1).toMatchObject({ownerId:owner,totalWinners:3,paidWinners:3,hasMore:true,settlementStatus:'COMPLETED'});expect(page1.winners).toHaveLength(2);expect(page2.winners).toHaveLength(1);expect(page2.hasMore).toBe(false);
  expect(new Set([...page1.winners,...page2.winners].map(w=>w.id)).size).toBe(3);expect(JSON.stringify(page1)).not.toContain('@test.invalid');
  expect((await getPostQuizWinners(quiz.postId,owner,3,2)).data).toMatchObject({winners:[],hasMore:false});
  expect((await getPostQuizWinners(quiz.postId,owner,0)).status).toBe(400);
  expect(await getPostEngagementsOverview(quiz.postId,owner)).toMatchObject({data:{isOwner:true,isQuiz:true}});
  const again = await funded("second-win");
  expect((await enter(again, users[0])).status).toBe(200);
  await expire(again.id);
  await settleQuizRewardBatch(again.id);
  expect(
    await db.quizReward.count({
      where: { userId: users[0], status: "COMPLETED" },
    }),
  ).toBe(2);
});
it("returns only the pool when no correct participants qualify, and cannot repeat the refund", async () => {
  const quiz = await funded("empty");
  await enter(quiz, users[0], false);
  await expire(quiz.id);
  const before = await db.wallet.findUniqueOrThrow({
    where: { userId: owner },
  });
  await Promise.all([
    settleQuizRewardBatch(quiz.id),
    settleQuizRewardBatch(quiz.id),
  ]);
  expect(
    Number(
      (
        await db.wallet.findUniqueOrThrow({ where: { userId: owner } })
      ).coins.minus(before.coins),
    ),
  ).toBe(1000);
  expect(
    await db.quiz.findUniqueOrThrow({ where: { id: quiz.id } }),
  ).toMatchObject({ settlementStatus: "REFUNDED" });
  expect(
    await db.transaction.count({
      where: { postId: quiz.postId, type: "CREDIT" },
    }),
  ).toBe(1);
});
it("holds selected winnings for locked wallets and resumes without reselection or double payment", async () => {
  const quiz = await funded("locked");
  await enter(quiz, users[0]);
  await db.wallet.update({
    where: { userId: users[0] },
    data: { isLocked: true },
  });
  await expire(quiz.id);
  try {
    expect(await settleQuizRewardBatch(quiz.id)).toMatchObject({
      done: false,
      paid: 0,
    });
    expect(
      await db.quizReward.count({
        where: { quizId: quiz.id, status: "PENDING" },
      }),
    ).toBe(1);
  } finally {
    await db.wallet.update({
      where: { userId: users[0] },
      data: { isLocked: false },
    });
  }
  expect((await getPostQuizWinners(quiz.postId,owner)).data).toMatchObject({totalWinners:1,paidWinners:0,winners:[{status:'PENDING'}]});
  expect(await db.notification.count({where:{sourceKey:`quiz-reward:elapsed:${quiz.id}`}})).toBe(1);
  const selected = await db.quiz.findUniqueOrThrow({ where: { id: quiz.id } });
  await settleDueQuizRewards();
  await settleQuizRewardBatch(quiz.id);
  expect(
    await db.quiz.findUniqueOrThrow({ where: { id: quiz.id } }),
  ).toMatchObject({
    settlementStatus: "COMPLETED",
    selectionSeed: selected.selectionSeed,
  });
  expect(
    await db.transaction.count({
      where: { postId: quiz.postId, type: "CREDIT" },
    }),
  ).toBe(1);
});
it("rolls back selection, balance, and ledger writes together if the payout fails", async () => {
  const quiz = await funded("rollback");
  await enter(quiz, users[0]);
  await expire(quiz.id);
  const before = await db.wallet.findUniqueOrThrow({
    where: { userId: users[0] },
  });
  await db.$executeRawUnsafe(
    `CREATE FUNCTION quiz_payout_failure() RETURNS trigger AS $$ BEGIN IF NEW."postId"='${quiz.postId}' AND NEW.type='CREDIT' THEN RAISE EXCEPTION 'quiz payout failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER quiz_payout_failure BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION quiz_payout_failure()',
  );
  try {
    await expect(settleQuizRewardBatch(quiz.id)).rejects.toThrow();
    expect(
      (
        await db.wallet.findUniqueOrThrow({ where: { userId: users[0] } })
      ).coins.eq(before.coins),
    ).toBe(true);
    expect(await db.quizReward.count({ where: { quizId: quiz.id } })).toBe(0);
    expect(
      await db.transaction.count({
        where: { postId: quiz.postId, type: "CREDIT" },
      }),
    ).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER quiz_payout_failure ON "Transaction"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION quiz_payout_failure()");
  }
  await settleQuizRewardBatch(quiz.id);
  expect(
    await db.quizReward.count({
      where: { quizId: quiz.id, status: "COMPLETED" },
    }),
  ).toBe(1);
});
it("selects only 2,000 unique correct winners from 50,000 participants and pays the exact pool", async () => {
  const quiz = await funded("scale", 1000, 2000),
    correct = quiz.options.find((o) => o.isCorrect)!.id,
    wrong = quiz.options.find((o) => !o.isCorrect)!.id;
  await db.$executeRaw`INSERT INTO "User" (id,name,username,email,"updatedAt",status) SELECT ${prefix}||'load-'||n, 'Load player', ${prefix}||'load-'||n, ${prefix}||'load-'||n||'@test.invalid',NOW(),'ACTIVE' FROM generate_series(1,50000) n`;
  await db.$executeRaw`INSERT INTO "Wallet" (id,user_id,coins,bonus,"updatedAt") SELECT ${prefix}||'wallet-'||n, ${prefix}||'load-'||n,0,0,NOW() FROM generate_series(1,50000) n`;
  await db.$executeRaw`INSERT INTO "QuizParticipant" (id,"userId","quizId","optionId","isCorrect","createdAt","updatedAt") SELECT ${prefix}||'entry-'||n,${prefix}||'load-'||n,${quiz.id},CASE WHEN n<=30000 THEN ${correct} ELSE ${wrong} END,n<=30000,NOW(),NOW() FROM generate_series(1,50000) n`;
  await expire(quiz.id);
  await settleDueQuizRewards();
  const awards = await db.quizReward.findMany({
    where: { quizId: quiz.id },
    include: {
      user: {
        select: {
          participants: {
            where: { quizId: quiz.id },
            select: { isCorrect: true },
          },
        },
      },
    },
  });
  expect(awards).toHaveLength(2000);
  expect(new Set(awards.map((a) => a.userId)).size).toBe(2000);
  expect(
    awards.every(
      (a) => a.status === "COMPLETED" && a.user.participants[0].isCorrect,
    ),
  ).toBe(true);
  expect(awards.reduce((s, a) => s + Number(a.amount), 0)).toBe(1000);
  expect(
    (await db.quiz.findUniqueOrThrow({ where: { id: quiz.id } }))
      .settlementStatus,
  ).toBe("COMPLETED");
  await settleQuizRewardBatch(quiz.id);
  expect(
    await db.transaction.count({
      where: { postId: quiz.postId, type: "CREDIT" },
    }),
  ).toBe(2000);
}, 120000);

it("keeps uncertain pools for review and treats legacy null lock flags as unlocked", async () => {
  const broken = await funded("missing-proof");
  await enter(broken, users[0]);
  await expire(broken.id);
  await db.quiz.update({
    where: { id: broken.id },
    data: { fundingTxnRef: null },
  });
  await settleQuizRewardBatch(broken.id);
  expect(
    (await db.quiz.findUniqueOrThrow({ where: { id: broken.id } }))
      .settlementStatus,
  ).toBe("REVIEW");
  expect(await db.quizReward.count({ where: { quizId: broken.id } })).toBe(0);
  const legacy = await funded("legacy-lock");
  await enter(legacy, users[0]);
  await expire(legacy.id);
  await db.wallet.update({
    where: { userId: users[0] },
    data: { isLocked: null },
  });
  try {
    await settleQuizRewardBatch(legacy.id);
    expect(
      await db.quizReward.count({
        where: { quizId: legacy.id, status: "COMPLETED" },
      }),
    ).toBe(1);
  } finally {
    await db.wallet.update({
      where: { userId: users[0] },
      data: { isLocked: false },
    });
  }
});
it("serializes independent paid-quiz requests against the same wallet and never overspends", async () => {
  await db.wallet.update({ where: { userId: owner }, data: { coins: 1500 } });
  const results = await Promise.all(
    ["one", "two"].map((key) =>
      createPost(body(), owner, "quiz-distinct-request-" + key),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  expect(
    Number(
      (await db.wallet.findUniqueOrThrow({ where: { userId: owner } })).coins,
    ),
  ).toBe(350);
});
