import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
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
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  return { default: redis };
});
vi.mock("@/utils/ai", () => ({
  generateRoomQuestion: vi.fn(),
  shuffleArray: (a: any) => a,
}));
vi.mock("@/services/helper", () => ({
  getGameType: () => "MINDMASH",
  getGameCatType: (name: string) => name,
  calculateWordMakerPlayerScore: () => ({ score: 0, answer: "" }),
  syncRedisUserWalletToPrisma: async () => {},
  syncPrismaUserWalletToRedis: async () => {},
}));
import db from "@/db";
import redis from "@/redis";
import {
  recordGameRound,
  captureRound,
  settleGameRound,
  projectGameRound,
} from "@/services/v1/games/rounds";
import {
  calculateGameRoomPoints,
  deleteGameRoomQuestionAndAnswers,
  addGameRoomPlayer,
} from "@/services/v1/games";
import {
  rankingKeysAt,
  playerKeysAt,
  isoWeekStart,
} from "@/utils/game-periods";
import { ensureRewardRanking } from "@/services/v1/games/periodRecovery";
import { refillGameEnergy } from "@/services/v1/games/energy";
import { chargeGameAction } from "@/services/walletLedger/game";
import { dispatchGameAction } from "@/services/walletLedger/gameDelivery";
import { recoverGameRounds } from "@/services/v1/games/recovery";
import { attachGameAdapter } from "@/socketIo/gameAdapter";
import {
  scheduleGamePhase,
  tickGameRuntimes,
  startGameRuntimes,
} from "@/services/v1/games/runtime";
import { GameActionEnum, GameCatType, GameType } from "@/types";
const prefix = "hardening-",
  users = [0, 1, 2].map((n) => `${prefix}${n}`),
  rounds: string[] = [],
  keys: string[] = [];
const startedAt = new Date();
let gameId: string, catId: string, roomId: string, room: any;
const io: any = { to: () => ({ emit: vi.fn() }), emit: vi.fn() };
beforeAll(async () => {
  await db.user.createMany({
    data: users.map((id) => ({
      id,
      username: id,
      name: id,
      email: `${id}@test.invalid`,
    })),
  });
  await db.wallet.createMany({
    data: users.map((userId) => ({ userId, coins: 100, bonus: 0 })),
  });
  const game = await db.game.create({
    data: {
      name: "MINDMASH",
      description: prefix,
      modes: ["MULTI"],
      categories: {
        create: {
          name: "TYPEMANIA",
          description: prefix,
          rooms: {
            create: { name: "Room", description: prefix, capacity: 20 },
          },
        },
      },
    },
    include: { categories: { include: { rooms: true } } },
  });
  gameId = game.id;
  catId = game.categories[0].id;
  roomId = `multi-${game.categories[0].rooms[0].id}`;
  room = {
    roomId,
    catId,
    gameId,
    gameName: "MINDMASH",
    catName: "TYPEMANIA",
    mode: "MULTI",
    generation: "owned-generation",
    status: "PLAY",
    timer: 20,
  };
});
afterAll(async () => {
  try {
    const found = [];
    for await (const batch of redis.scanIterator({
      MATCH: `*${prefix}*`,
      COUNT: 100,
    }))
      found.push(...(Array.isArray(batch) ? batch : [batch]));
    const all = await redis.keys(`*${catId}*`);
    const rk = await redis.keys(`room:${roomId}*`);
    const player = await redis.keys(`*${users[0]}*`);
    const player2 = await redis.keys(`*${users[1]}*`);
    const player3 = await redis.keys(`*${users[2]}*`);
    const remove = [
      ...found,
      ...all,
      ...rk,
      ...player,
      ...player2,
      ...player3,
      ...keys,
    ];
    if (remove.length) await redis.del(remove);
    await db.gameRoundRecord.deleteMany({ where: { id: { in: rounds } } });
    await db.gameRoomRuntime.deleteMany({ where: { id: roomId } });
    await db.gameIntegrityCase.deleteMany({where:{userId:{in:users}}});
  await db.gameWalletAction.deleteMany({ where: { userId: { in: users } } });
    await db.transaction.deleteMany({ where: { userId: { in: users } } });
    await db.walletOperation.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        OR: [
          { scope: { in: users.map((u) => `game:${u}`) } },
          { scope: { in: ["game-energy-refill", "game-ranking-migration"] } },
        ],
      },
    });
    await db.gameEnergy.deleteMany({ where: { catId } });
    await db.game.delete({ where: { id: gameId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  } finally {
    await redis.quit();
    await db.$disconnect();
  }
}, 120000);
async function round(playedAt = new Date()) {
  const id = randomUUID();
  rounds.push(id);
  const q: any = {
    id: "q",
    roundId: id,
    question: "The cat sleeps.",
    answer: "The cat sleeps.",
    acceptedAnswers: ["The cat sleeps."],
    options: [],
    type: GameType.MINDMASH,
    startedAt: playedAt.getTime(),
    answerUntil: Date.now() + 20000,
    voteUntil: Date.now() + 32000,
  };
  await redis.hSet(`room:${roomId}`, { ...room, status: "PLAY" });
  await redis.sAdd(`room:${roomId}:players`, users);
  await redis.set(`room:${roomId}:question`, JSON.stringify(q));
  await recordGameRound(room, q);
  const answers = Object.fromEntries(
    users.map((playerId, i) => [
      playerId,
      JSON.stringify({
        playerId,
        roomId,
        catId,
        mode: "MULTI",
        name: playerId,
        answer: q.answer,
        timer: 10 - i,
        qId: "q",
      }),
    ]),
  );
  await redis.hSet(`room:${roomId}:answers`, answers);
  return q;
}
it("keeps answers until atomic settlement, writes a round once, and adds category totals once", async () => {
  const played = new Date("2026-01-31T23:59:59Z"),
    q = await round(played),
    captured = await captureRound(room);
  expect(await redis.exists(`room:${roomId}:answers`)).toBe(1);
  await Promise.all(
    Array.from({ length: 4 }, () =>
      settleGameRound(captured.id, (snapshot) =>
        calculateGameRoomPoints(room, snapshot),
      ),
    ),
  );
  const stats = await db.gameMonthStat.findMany({
    where: { catId, year: 2026, month: 1 },
  });
  expect(stats).toHaveLength(3);
  expect(stats.every((s) => s.numPlayed === 1)).toBe(true);
  expect(stats.map((s) => s.score).reduce((a, b) => a + b, 0)).toBe(91);
  const rankings = rankingKeysAt(catId, "multi", played);
  keys.push(`game:round-projection:${q.roundId}`);
  expect(Number(await redis.hGet(rankings.monthStat, "score"))).toBe(91);
  expect(Number(await redis.hGet(rankings.monthStat, "numPlayed"))).toBe(1);
  expect(await redis.ttl(rankings.month)).toBeGreaterThan(90 * 86400);
  expect(await db.gamePeriodStat.count({ where: { catId } })).toBe(6);
  const previous = Number(await redis.zScore(rankings.month, users[0]));
  await db.gameRoundRecord.update({
    where: { id: q.roundId },
    data: { projectionPending: true },
  });
  await projectGameRound(q.roundId);
  expect(Number(await redis.zScore(rankings.month, users[0]))).toBe(previous);
});
it("validates all Redis projection destinations before incrementing any player", async () => {
  const date = new Date("2026-02-15"),
    q = await round(date),
    captured = await captureRound(room);
  const ranking = rankingKeysAt(catId, "multi", date).month;
  const broken = playerKeysAt(users[1], catId, "multi", date).today;
  await redis.set(broken, "wrong-type");
  await expect(
    settleGameRound(captured.id, (snapshot) =>
      calculateGameRoomPoints(room, snapshot),
    ),
  ).rejects.toThrow("Invalid round projection storage type");
  expect(await redis.zCard(ranking)).toBe(0);
  expect(
    (await db.gameRoundRecord.findUniqueOrThrow({ where: { id: q.roundId } }))
      .status,
  ).toBe("COMPLETED");
  await redis.del(broken);
  await projectGameRound(q.roundId);
  expect(await redis.zCard(ranking)).toBe(3);
  expect(Number(await redis.zScore(ranking, users[0]))).toBe(40);
});
it("rebuilds an expired closed monthly ranking from authoritative data", async () => {
  const key = rankingKeysAt(catId, "multi", new Date("2026-01-15")).month;
  await redis.del(key);
  await ensureRewardRanking(catId, "MULTI", {
    kind: "month",
    year: 2026,
    month: 1,
  });
  expect(await redis.zCard(key)).toBe(3);
  expect(Number(await redis.zScore(key, users[0]))).toBe(40);
});
it("repairs a partial closed ranking and restores player stats and profiles", async () => {
  const date = new Date("2026-01-15"),
    keys = rankingKeysAt(catId, "multi", date),
    player = playerKeysAt(users[0], catId, "multi", date);
  await redis.del([keys.month, player.month, player.info]);
  await redis.zAdd(keys.month, { value: users[0], score: 999 });
  await ensureRewardRanking(catId, "MULTI", {
    kind: "month",
    year: 2026,
    month: 1,
  });
  expect(await redis.zCard(keys.month)).toBe(3);
  expect(Number(await redis.zScore(keys.month, users[0]))).toBe(40);
  expect(await redis.hGetAll(player.month)).toMatchObject({
    score: "40",
    numPlayed: "1",
  });
  expect(await redis.hGetAll(player.info)).toMatchObject({
    id: users[0],
    name: users[0],
  });
});
it("merges a legacy week crossing months once and excludes join-only zero-score accounts", async () => {
  const a = `ranking:cat:${catId}:mode:multi:2026:4:week:18`,
    b = `ranking:cat:${catId}:mode:multi:2026:5:week:18`;
  keys.push(a, b);
  await redis.zAdd(a, [
    { value: users[0], score: 10 },
    { value: users[2], score: 0 },
  ]);
  await redis.zAdd(b, { value: users[0], score: 15 });
  const target = await ensureRewardRanking(catId, "MULTI", {
    kind: "week",
    year: 2026,
    week: 18,
  });
  expect(Number(await redis.zScore(target, users[0]))).toBe(25);
  expect(await redis.zCard(target)).toBe(1);
  await ensureRewardRanking(catId, "MULTI", {
    kind: "week",
    year: 2026,
    week: 18,
  });
  expect(Number(await redis.zScore(target, users[0]))).toBe(25);
  expect(
    (
      await db.gamePeriodStat.findFirstOrThrow({
        where: {
          catId,
          playerId: users[0],
          kind: "week",
          periodStart: isoWeekStart(2026, 18),
        },
      })
    ).score,
  ).toBe(25);
});
it("does not reset scores or enroll new players merely because their profile cache disappeared", async () => {
  const current = rankingKeysAt(catId, "multi");
  const profile = playerKeysAt(users[0], catId, "multi").info;
  await redis.zAdd(current.month, { value: users[0], score: 123 });
  await redis.del(profile);
  const joined = await addGameRoomPlayer({
    playerId: users[0],
    socketId: "owner",
    roomId: roomId.slice(6),
    gameId,
    catId,
    mode: "MULTI",
    name: "Player",
    voteCount: 0,
  });
  expect(joined.data).not.toBeNull();
  expect(Number(await redis.zScore(current.month, users[0]))).toBe(123);
  const before = await redis.zCard(current.month);
  await addGameRoomPlayer({
    playerId: users[1],
    socketId: "owner2",
    roomId: roomId.slice(6),
    gameId,
    catId,
    mode: "MULTI",
    name: "Player2",
    voteCount: 0,
  });
  expect(await redis.zCard(current.month)).toBe(before);
});
it("records server luck outcomes once and rejects fabricated numeric scores", async () => {
  const q = await round();
  q.options = ["0", "20"];
  await redis.set(`room:${roomId}:question`, JSON.stringify(q));
  const delivery: any = {
    kind: "ANSWER",
    roomId,
    roundId: q.roundId,
    payload: {
      playerId: users[0],
      roomId,
      catId,
      timer: 10,
      answer: "999999",
      serverLuck: true,
      luckKind: "LUCKYSPIN",
      luckOptions: q.options,
      isSpin: true,
      submittedAt: Date.now(),
    },
  };
  const params = {
    playerId: users[0],
    operationId: "server-spin-test",
    action: GameActionEnum.ANSWER,
    roomId,
    catId,
    mode: "MULTI",
  };
  const result = await chargeGameAction(params, 1, 1, delivery);
  expect(q.options).toContain(result.outcome);
  const replay = await chargeGameAction(params, 1, 1, delivery);
  expect(replay.outcome).toBe(result.outcome);
  await dispatchGameAction(result.actionId!);
  expect(
    JSON.parse((await redis.hGet(`room:${roomId}:answers`, users[0]))!).answer,
  ).toBe(result.outcome);
  expect(await redis.ttl(`wallet-action:${result.actionId}`)).toBeGreaterThan(
    0,
  );
  keys.push(`wallet-action:${result.actionId}`);
  const scores = await calculateGameRoomPoints(
    { ...room, catName: GameCatType.LUCKYSPIN },
    {
      question: q,
      answers: [{ ...delivery.payload, serverOutcome: true, answer: "999999" }],
    },
  );
  expect(scores[0].score).toBe(0);
  await expect(
    chargeGameAction(
      { ...params, operationId: "too-fast-spin" },
      1,
      1,
      {...delivery,payload:{...delivery.payload,answer:"20"}},
    ),
  ).rejects.toThrow("Wait for the current spin");
  // Keep this test's unfinished record out of later closed-period recovery checks.
  const captured = await captureRound(room);
  await settleGameRound(captured.id, (snapshot) =>
    calculateGameRoomPoints(room, snapshot),
  );
});
it("charges one server-computed energy refill under concurrent replay", async () => {
  const before = await db.gameEnergy.findUniqueOrThrow({
    where: { playerId_catId: { playerId: users[0], catId } },
  });
  await Promise.all(
    Array.from({ length: 5 }, () =>
      refillGameEnergy(users[0], catId, "gauge", "refill-once"),
    ),
  );
  const after = await db.gameEnergy.findUniqueOrThrow({
    where: { playerId_catId: { playerId: users[0], catId } },
  });
  expect(after.gauge - before.gauge).toBe(10);
  expect(before.amount - after.amount).toBe(100);
  await expect(
    refillGameEnergy(users[0], catId, "amount" as any, "bad-refill"),
  ).rejects.toThrow("Invalid");
});
it("preserves newer round data when stale cleanup runs", async () => {
  const q = await round();
  await deleteGameRoomQuestionAndAnswers(roomId, "old-round", room.generation);
  expect(await redis.exists(`room:${roomId}:question`)).toBe(1);
  const captured = await captureRound(room);
  await settleGameRound(captured.id, (snapshot) =>
    calculateGameRoomPoints(room, snapshot),
  );
  await deleteGameRoomQuestionAndAnswers(roomId, q.roundId, room.generation);
  expect(await redis.exists(`room:${roomId}:question`)).toBe(0);
});
it("resumes a phase after its original process stopped and uses persisted deadlines", async () => {
  const q = await round();
  await scheduleGamePhase(room, "PLAY", Date.now() - 1, q.roundId);
  const close = await startGameRuntimes(io);
  await close();
  await redis.zAdd("game:runtime:due", { value: roomId, score: 0 });
  await tickGameRuntimes(io);
  expect(
    (await db.gameRoundRecord.findUniqueOrThrow({ where: { id: q.roundId } }))
      .status,
  ).toBe("COMPLETED");
  expect(
    (await db.gameRoomRuntime.findUniqueOrThrow({ where: { id: roomId } }))
      .phase,
  ).toBe("CHAT");
});
it("recovers a paid completed action after Redis room data is lost", async () => {
  const q = await round(new Date(Date.now() - 180000));
  // Use a durable accepted action; the normal delivery test already verifies its wallet debit.
  await db.gameWalletAction.create({
    data: {
      id: randomUUID(),
      userId: users[0],
      roomId,
      roundId: q.roundId,
      kind: "ANSWER",
      status: "DELIVERED",
      deductedCoins: 1,
      deductedBonus: 0,
      payload: {
        playerId: users[0],
        roomId,
        catId,
        mode: "MULTI",
        name: "Player",
        answer: q.answer,
        timer: 10,
        qId: q.id,
      },
    },
  });
  await redis.del([
    `room:${roomId}`,
    `room:${roomId}:answers`,
    `room:${roomId}:question`,
  ]);
  await recoverGameRounds();
  const saved = await db.gameRoundRecord.findUniqueOrThrow({
    where: { id: q.roundId },
  });
  expect(saved.status).toBe("COMPLETED");
  expect((saved.scores as any[])[0].score).toBe(20);
});
it("delivers questions, timers, scores and host messages across two API replicas", async () => {
  const a = createServer(),
    b = createServer(),
    ioA = new Server(a),
    ioB = new Server(b);
  const closeA = await attachGameAdapter(ioA),
    closeB = await attachGameAdapter(ioB);
  ioA.of("/games").on("connection", async (socket) => {
    await socket.join("shared-room");
    socket.emit("ready");
  });
  ioB.of("/games").on("connection", async (socket) => {
    await socket.join("shared-room");
    socket.emit("ready");
  });
  await new Promise<void>((resolve) => a.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => b.listen(0, "127.0.0.1", resolve));
  const one = client(`http://127.0.0.1:${(a.address() as any).port}/games`, {
      transports: ["websocket"],
    }),
    two = client(`http://127.0.0.1:${(b.address() as any).port}/games`, {
      transports: ["websocket"],
    });
  try {
    await Promise.all([
      new Promise<void>((resolve) => one.once("ready", resolve)),
      new Promise<void>((resolve) => two.once("ready", resolve)),
    ]);
    for (const event of [
      "game_room_question",
      "game_room_state",
      "game_room_score",
      "message",
    ]) {
      const received = new Promise<any>((resolve) => two.once(event, resolve));
      ioA.of("/games").to("shared-room").emit(event, { id: event });
      expect(await received).toEqual({ id: event });
    }
  } finally {
    one.disconnect();
    two.disconnect();
    await closeA();
    await closeB();
    await Promise.all([
      new Promise<void>((resolve) => ioA.close(() => resolve())),
      new Promise<void>((resolve) => ioB.close(() => resolve())),
    ]);
  }
}, 30000);
