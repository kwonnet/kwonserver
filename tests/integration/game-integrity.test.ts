import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Worker } from "bullmq";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
vi.mock("@/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    default: new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 10,
      }),
    }),
  };
});
vi.mock("@/redis", async () => {
  const { createClient } = await import("redis");
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return { default: client };
});
vi.mock("@/services/helper", () => ({
  getGameType: () => "MINDMASH",
  getGameCatType: (name: string) => name,
}));
import db from "@/db";
import redis from "@/redis";
import { chargeGameAction } from "@/services/walletLedger/game";
import { dispatchGameAction } from "@/services/walletLedger/gameDelivery";
import { calculateGameRoomPoints } from "@/services/v1/games";
import {
  recordGameRound,
  captureRound,
  settleGameRound,
} from "@/services/v1/games/rounds";
import {
  recoverGameIntegrityCases,
  prepareGameIntegrityReview,
} from "@/services/v1/games/integrity";
import { gameIntegrityQueue, closeJobQueues } from "@/cron/jobs/queue";
import { GameActionEnum } from "@/types";
const userId = "integrity-player",
  roundIds: string[] = [],
  actionIds: string[] = [];
let gameId: string, catId: string, roomId: string;
beforeAll(async () => {
  await db.user.create({
    data: {
      id: userId,
      username: userId,
      name: "Review player",
      email: "review@test.invalid",
      wallet: { create: { coins: 100 } },
    },
  });
  const game = await db.game.create({
    data: {
      name: "MINDMASH",
      description: "Review fixture",
      modes: ["MULTI"],
      categories: {
        create: {
          name: "LUCKYFLIP",
          description: "Review fixture",
          rooms: { create: { name: "Review", description: "test" } },
        },
      },
    },
    include: { categories: { include: { rooms: true } } },
  });
  gameId = game.id;
  catId = game.categories[0].id;
  roomId = `multi-${game.categories[0].rooms[0].id}`;
});
afterAll(async () => {
  try {
    for (const id of actionIds) {
      const job = await gameIntegrityQueue.getJob(id);
      if (job) await job.remove();
    }
    const keys = [
      ...(await redis.keys(`*${catId}*`)),
      ...(await redis.keys(`room:${roomId}*`)),
      ...actionIds.map((id) => `wallet-action:${id}`),
      ...roundIds.map((id) => `game:round-projection:${id}`),
    ];
    if (keys.length) await redis.del(keys);
    await db.gameIntegrityCase.deleteMany({ where: { userId } });
    await db.gameRoundRecord.deleteMany({ where: { id: { in: roundIds } } });
    await db.gameWalletAction.deleteMany({ where: { userId } });
    await db.walletOperation.deleteMany({ where: { scope: `game:${userId}` } });
    await db.gameEnergy.deleteMany({ where: { playerId: userId } });
    await db.transaction.deleteMany({ where: { userId } });
    await db.game.delete({ where: { id: gameId } });
    await db.user.delete({ where: { id: userId } });
  } finally {
    await closeJobQueues();
    await redis.quit();
    await db.$disconnect();
  }
}, 30000);
it.each(["LUCKYSPIN", "LUCKYFLIP"])(
  "validates %s choices, zeros a tampered round and durably queues review once",
  async (kind) => {
    const roundId = randomUUID();
    roundIds.push(roundId);
    const room: any = {
      roomId,
      gameId,
      catId,
      mode: "MULTI",
      generation: "review-generation",
      gameName: "MINDMASH",
      catName: kind,
      status: "PLAY",
    };
    const q: any = {
      id: "q",
      roundId,
      question: "Luck",
      options: ["10", "17", "0"],
      answer: "",
      type: "MINDMASH",
      startedAt: Date.now(),
      answerUntil: Date.now() + 60000,
    };
    await redis.del([`room:${roomId}:answers`, `room:${roomId}:question`]);
    await redis.hSet(`room:${roomId}`, room);
    await redis.set(`room:${roomId}:question`, JSON.stringify(q));
    await recordGameRound(room, q);
    const submit = async (answer: string, key: string) => {
      const params = {
        playerId: userId,
        gameId,
        catId,
        roomId,
        mode: "MULTI",
        qId: q.id,
        action: GameActionEnum.ANSWER,
        operationId: key,
        luckSelection: answer,
      };
      const delivery: any = {
        kind: "ANSWER",
        roomId,
        roundId,
        payload: {
          playerId: userId,
          roomId,
          catId,
          mode: "MULTI",
          qId: q.id,
          answer,
          timer: 10,
          serverLuck: true,
          luckKind: kind,
          luckOptions: q.options,
          isSpin: true,
          requestDetails: {
            socketId: "socket",
            address: "127.0.0.1",
            userAgent: "test",
          },
        },
      };
      const result = await chargeGameAction(params, 1, 1, delivery);
      if (!actionIds.includes(result.actionId!))
        actionIds.push(result.actionId!);
      await dispatchGameAction(result.actionId!);
      return result;
    };
    expect((await submit("10", `${roundId}-valid`)).outcome).toBe("10");
    const bad = await submit("40", `${roundId}-invalid`);
    expect(bad.outcome).toBe("0");
    const before = Number(
      (await db.wallet.findUniqueOrThrow({ where: { userId } })).coins,
    );
    await submit("40", `${roundId}-invalid`);
    expect(
      Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).coins),
    ).toBe(before);
    const evidence = await db.gameIntegrityCase.findUniqueOrThrow({
      where: { id: bad.actionId! },
    });
    expect(evidence).toMatchObject({
      userId,
      catId,
      roomId,
      roundId,
      gameId,
      gameKind: kind,
      submittedValue: "40",
      allowedValues: ["10", "17", "0"],
      awardedPoints: 0,
      status: "PENDING",
    });
    expect(evidence.requestDetails).toMatchObject({
      socketId: "socket",
      address: "127.0.0.1",
      userAgent: "test",
      operationId: `${roundId}-invalid`,
    });
    await db.gameWalletAction.updateMany({
      where: { roundId },
      data: { createdAt: new Date(Date.now() - 3000) },
    });
    expect((await submit("17", `${roundId}-later-valid`)).outcome).toBe("0");
    const captured = await captureRound(room),
      settled = await settleGameRound(captured.id, (input) =>
        calculateGameRoomPoints(room, input),
      );
    expect((settled.scores as any[])[0].score).toBe(0);
    expect(settled.status).toBe("COMPLETED");
    expect(await db.gameIntegrityCase.count({ where: { roundId } })).toBe(1);
    // Queue failure never loses the evidence or changes settled game points.
    const add = vi
      .spyOn(gameIntegrityQueue, "add")
      .mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(recoverGameIntegrityCases()).rejects.toThrow("remain pending");
    add.mockRestore();
    expect(
      (
        await db.gameIntegrityCase.findUniqueOrThrow({
          where: { id: bad.actionId! },
        })
      ).status,
    ).toBe("PENDING");
    await db.gameIntegrityCase.update({
      where: { id: bad.actionId! },
      data: { nextAttemptAt: new Date(0) },
    });
    const worker = new Worker(
      gameIntegrityQueue.name,
      async (job) => {
        await prepareGameIntegrityReview(job.data.caseId);
      },
      { connection: { host: "127.0.0.1", port: 16379 }, concurrency: 2 },
    );
    try {
      await recoverGameIntegrityCases();
      const deadline = Date.now() + 5000;
      while (
        (
          await db.gameIntegrityCase.findUniqueOrThrow({
            where: { id: bad.actionId! },
          })
        ).status !== "AWAITING_REVIEW"
      ) {
        if (Date.now() > deadline) throw new Error("Review worker timeout");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await prepareGameIntegrityReview(bad.actionId!);
      expect(
        (
          await db.gameIntegrityCase.findUniqueOrThrow({
            where: { id: bad.actionId! },
          })
        ).reviewReadyAt,
      ).not.toBeNull();
    } finally {
      await worker.close();
    }
  },
);
