import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
const queueMocks=vi.hoisted(()=>({add:vi.fn(async()=>({})),getJob:vi.fn(async()=>undefined)}));
vi.mock('@/cron/jobs/queue',()=>({gameResultQueue:queueMocks}));
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
  getGameType: (name:string) => name === "ACRONYM" ? "ACRONYM" : "MINDMASH",
  getGameCatType: (name: string) => name,
  calculateWordMakerPlayerScore: () => ({ score: 0, answer: "" }),
  syncRedisUserWalletToPrisma: async () => {},
  syncPrismaUserWalletToRedis: async () => {},
}));
import {gameRuntimeLease} from "@/services/v1/games/lease";
import db from "@/db";
import {finishLiveGameRound,settleQueuedGameRound,recoverLiveGameResults} from '@/services/v1/games/liveResults';
import redis from "@/redis";
import {
  recordGameRound,
  captureRound,
  captureLiveGameRound,
  assertGameRoundsSynced,
  settleGameRound,
  projectGameRound,
} from "@/services/v1/games/rounds";
import {
  calculateGameRoomPoints,
  deleteGameRoomQuestionAndAnswers,
  addGameRoomPlayer,
  getGameResult,
} from "@/services/v1/games";
import {
  rankingKeysAt,
  playerKeysAt,
  isoWeekStart,
} from "@/utils/game-periods";
import { ensureRewardRanking } from "@/services/v1/games/periodRecovery";
import { refillGameEnergy, getGameEnergy, syncGameEnergy, applyRoundGameEnergy } from "@/services/v1/games/energy";
import { chargeGameAction } from "@/services/walletLedger/game";
import { dispatchGameAction } from "@/services/walletLedger/gameDelivery";
import { recoverGameRounds } from "@/services/v1/games/recovery";
import { attachGameAdapter } from "@/socketIo/gameAdapter";
import {
  scheduleGamePhase,
  beginGameRound,
  tickGameRuntimes,
  startGameRuntimes,
} from "@/services/v1/games/runtime";
import { GameActionEnum, GameCatType, GameType, GameEventEnum } from "@/types";
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
    if (remove.length) { await redis.zRem("game:energy:dirty", remove); await redis.del(remove); }
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
  const before = await getGameEnergy(users[0],catId);
  const noDatabase=vi.spyOn(db.gameEnergy,"findUniqueOrThrow").mockRejectedValue(new Error("Database unavailable"));
  await Promise.all(
    Array.from({ length: 5 }, () =>
      refillGameEnergy(users[0], catId, "gauge", "refill-once"),
    ),
  );
  noDatabase.mockRestore();
  const live=await getGameEnergy(users[0],catId);
  expect(live.gauge-before.gauge).toBe(10);
  expect(before.amount-live.amount).toBe(100);
  await expect(refillGameEnergy(users[0],catId,"turbo","refill-once")).rejects.toThrow("different parameters");
  await syncGameEnergy();
  const after = await db.gameEnergy.findUniqueOrThrow({
    where: { playerId_catId: { playerId: users[0], catId } },
  });
  expect(after.gauge - before.gauge).toBe(10);
  expect(before.amount - after.amount).toBe(100);
  await expect(
    refillGameEnergy(users[0], catId, "amount" as any, "bad-refill"),
  ).rejects.toThrow("Invalid");
});
it("retains refill updates during database failure and interleaved round consumption", async()=>{
  const playerId=users[1];
  const before=await getGameEnergy(playerId,catId);
  const once=await applyRoundGameEnergy(playerId,catId,"energy-interleave-test");
  const refilled=await refillGameEnergy(playerId,catId,"turbo","interleave-refill");
  const replay=await applyRoundGameEnergy(playerId,catId,"energy-interleave-test");
  expect(replay).toEqual(refilled);
  expect(once.amount-before.amount).toBeGreaterThanOrEqual(150);
  expect(refilled.amount).toBe(once.amount-100);
  expect(refilled.turbo).toBe(once.turbo+10);
  const offline=vi.spyOn(db,"$executeRaw").mockRejectedValueOnce(new Error("offline"));
  await expect(syncGameEnergy()).rejects.toThrow("offline");
  offline.mockRestore();
  expect(await redis.zScore("game:energy:dirty",`player:${playerId}:cat:${catId}:energy`)).not.toBeNull();
  await Promise.all([syncGameEnergy(),syncGameEnergy()]);
  const persisted=await db.gameEnergy.findUniqueOrThrow({where:{playerId_catId:{playerId,catId}}});
  expect(persisted.amount).toBe(refilled.amount);
  expect(persisted.turbo).toBe(refilled.turbo);
  expect(persisted.version).toBe(refilled.version);
  expect(await redis.zScore("game:energy:dirty",`player:${playerId}:cat:${catId}:energy`)).toBeNull();
});
it("never lets a delayed database snapshot overwrite a newer refill",async()=>{
  const playerId=users[2], key=`player:${playerId}:cat:${catId}:energy`;
  await getGameEnergy(playerId,catId);
  await refillGameEnergy(playerId,catId,"gauge","snapshot-first");
  const execute=db.$executeRaw.bind(db);
  let captured!:()=>void, release!:()=>void;
  const started=new Promise<void>(resolve=>{captured=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const pause=vi.spyOn(db,"$executeRaw").mockImplementationOnce((async(query:any)=>{
    captured();await gate;return execute(query);
  }) as typeof db.$executeRaw);
  const older=syncGameEnergy(1,[{playerId,catId}]);
  await started;
  const newest=await refillGameEnergy(playerId,catId,"turbo","snapshot-newer");
  await syncGameEnergy(1,[{playerId,catId}]);
  release();await older;pause.mockRestore();
  const persisted=await db.gameEnergy.findUniqueOrThrow({where:{playerId_catId:{playerId,catId}}});
  expect(persisted.version).toBe(newest.version);
  expect(persisted.amount).toBe(newest.amount);
  expect(persisted.turbo).toBe(newest.turbo);
  expect(await redis.zScore("game:energy:dirty",key)).toBeNull();
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
  ).toBe("PENDING");
  await settleQueuedGameRound(q.roundId);
  expect((await db.gameRoundRecord.findUniqueOrThrow({where:{id:q.roundId}})).status).toBe("COMPLETED");
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

it("starts a round with matching durable and live category deadlines", async () => {
  await redis.hSet(`room:${roomId}`, {...room, generation:room.generation});
  const question = await beginGameRound(room, {
    id:"luckyflip-duration", question:"Flip", answer:"0", options:["0","10"], type:GameType.MINDMASH,
  }, 10);
  expect(question?.roundId).toBeTruthy();
  rounds.push(question!.roundId!);
  const [record, runtime, live] = await Promise.all([
    db.gameRoundRecord.findUniqueOrThrow({where:{id:question!.roundId}}),
    db.gameRoomRuntime.findUniqueOrThrow({where:{id:roomId}}),
    redis.get(`room:${roomId}:question`),
  ]);
  expect(question!.answerUntil! - (question as any).startedAt).toBe(10000);
  expect(runtime.deadline.getTime()).toBe(question!.answerUntil);
  expect((record.question as any).answerUntil).toBe(question!.answerUntil);
  expect(JSON.parse(live!)).toEqual(question);
  expect(await redis.hGet(`room:${roomId}`,"timer")).toBe("10");
});

it("projects live results with PostgreSQL unavailable then settles once without duplicating ranks", async () => {
  const q=await round();
  keys.push(`game:round-snapshot:${q.roundId}`,`game:result:${q.roundId}`,`game:round-projection:${q.roundId}`,`game:streak-effect:${q.roundId}`);
  const key=playerKeysAt(users[0],catId,'multi',new Date(q.startedAt)).month;
  const before=Number(await redis.hGet(key,'numPlayed')??0);
  const reads=vi.spyOn(db.gameRoundRecord,'findUniqueOrThrow').mockRejectedValue(new Error('PostgreSQL unavailable'));
  let live;
  try {
    live=await finishLiveGameRound(room);
    expect(reads).not.toHaveBeenCalled();
    expect(live.scores).toHaveLength(3);
    expect(Number(await redis.hGet(key,'numPlayed'))).toBe(before+1);
    await finishLiveGameRound(room);
    expect(Number(await redis.hGet(key,'numPlayed'))).toBe(before+1);
  } finally {reads.mockRestore();}
  expect((await db.gameRoundRecord.findUniqueOrThrow({where:{id:q.roundId}})).status).toBe('PENDING');
  await settleQueuedGameRound(q.roundId);
  await settleQueuedGameRound(q.roundId);
  expect(Number(await redis.hGet(key,'numPlayed'))).toBe(before+1);
  expect((await db.gameRoundRecord.findUniqueOrThrow({where:{id:q.roundId}})).status).toBe('COMPLETED');
  expect(await redis.zScore('game:results:pending',q.roundId)).toBeNull();
});
it("uses cached Redis runtime for normal countdown ticks without querying PostgreSQL",async()=>{
  const q=await round();await scheduleGamePhase(room,'PLAY',Date.now()+20000,q.roundId);
  const reads=vi.spyOn(db.gameRoomRuntime,'findUnique').mockRejectedValue(new Error('PostgreSQL unavailable'));
  try {await tickGameRuntimes(io);expect(reads).not.toHaveBeenCalled();}
  finally {reads.mockRestore();}
});

it("retains a result in the Redis outbox when queue publication fails",async()=>{
 const q=await round();
 keys.push(`game:round-snapshot:${q.roundId}`,`game:result:${q.roundId}`,`game:round-projection:${q.roundId}`,`game:streak-effect:${q.roundId}`);
 await finishLiveGameRound(room);
 queueMocks.add.mockRejectedValueOnce(new Error('Queue unavailable'));
 await recoverLiveGameResults();
 expect(await redis.get(`game:result:${q.roundId}`)).toBeTruthy();
 expect(await redis.zScore('game:results:pending',q.roundId)).not.toBeNull();
 await recoverLiveGameResults();
 await settleQueuedGameRound(q.roundId);
 expect(await redis.zScore('game:results:pending',q.roundId)).toBeNull();
});

it("publishes scores and advances CHAT while PostgreSQL result writes are unavailable",async()=>{
 const q=await round();
 keys.push(`game:round-snapshot:${q.roundId}`,`game:result:${q.roundId}`,`game:round-projection:${q.roundId}`,`game:streak-effect:${q.roundId}`);
 const transaction=vi.spyOn(db,'$transaction').mockRejectedValue(new Error('PostgreSQL unavailable'));
 const emit=vi.fn();
 try {
  await getGameResult(roomId,{to:()=>({emit})} as any);
  expect(transaction).not.toHaveBeenCalled();
  expect(emit).toHaveBeenCalledWith(GameEventEnum.GAME_ROOM_SCORE,expect.anything());
  expect(await redis.hGet(`room:${roomId}`,'status')).toBe('CHAT');
 }finally{transaction.mockRestore();}
 await expect(assertGameRoundsSynced({id:q.roundId})).rejects.toThrow('still syncing');
 await settleQueuedGameRound(q.roundId);
 await expect(assertGameRoundsSynced({id:q.roundId})).resolves.toBeUndefined();
});

it("does not close or publish a round from a replaced runtime lease",async()=>{
 const q=await round(),lock=`game:test-lease:${q.roundId}`;
 keys.push(lock,`game:round-snapshot:${q.roundId}`);
 await redis.set(lock,'replacement');
 await expect(gameRuntimeLease.run({key:lock,token:'stale'},async()=>finishLiveGameRound(room))).rejects.toThrow('lease was replaced');
 expect(await redis.hGet(`room:${roomId}`,'status')).toBe('PLAY');
 expect(await redis.get(`game:round-snapshot:${q.roundId}`)).toBeNull();
});

it("repairs an occupied successor generation without requiring the player to rejoin",async()=>{
 const q=await round();
 await captureRound(room);await settleGameRound(q.roundId,snapshot=>calculateGameRoomPoints(room,snapshot));
 await scheduleGamePhase(room,"CHAT",Date.now()-1);
 await redis.del(`room:${roomId}:question`);
 await redis.hSet(`room:${roomId}`,{...room,generation:'replacement-generation',status:'CHAT',timer:'0'});
 await redis.hDel(`room:${roomId}`,['deadline','roundId','revision']);
 await redis.zAdd('game:runtime:due',{value:roomId,score:0});
 await tickGameRuntimes(io);
 const current=await db.gameRoomRuntime.findUniqueOrThrow({where:{id:roomId}});
 expect(current.generation).toBe('replacement-generation');
 expect(current.active).toBe(true);
 expect(await redis.zScore('game:runtime:due',roomId)).not.toBeNull();
 expect(Number(await redis.hGet(`room:${roomId}`,'deadline'))).toBeGreaterThan(Date.now());
 // Restore the fixture's generation for following tests and cleanup.
 await redis.hSet(`room:${roomId}`,{generation:room.generation});
 await scheduleGamePhase(room,'CHAT',Date.now()+10000);
});
it("does not overwrite a newer phase with an already-started countdown tick",async()=>{
 const q=await round();await scheduleGamePhase(room,'PLAY',Date.now()+10000,q.roundId);
 const revision=Number(await redis.hGet(`room:${roomId}`,'revision'));
 const evalRedis=redis.eval.bind(redis);
 let replaced=false;
 const intercept=vi.spyOn(redis,'eval').mockImplementation(async(script:any,options:any)=>{
  if(!replaced && typeof script==='string' && script.includes("'timer',ARGV[3],'deadline',ARGV[5]")) {
   replaced=true;
   await redis.hSet(`room:${roomId}`,{status:'VOTE',revision:String(revision+1)});
  }
  return evalRedis(script,options);
 });
 try {
  await redis.zAdd('game:runtime:due',{value:roomId,score:0});
  await tickGameRuntimes(io);
  expect(replaced).toBe(true);
  expect(await redis.hGet(`room:${roomId}`,'status')).toBe('VOTE');
  expect(await redis.hGet(`room:${roomId}`,'revision')).toBe(String(revision+1));
 }finally{intercept.mockRestore();}
 await captureRound(room);await settleGameRound(q.roundId,snapshot=>calculateGameRoomPoints(room,snapshot));
});
it("an expired timer lease cannot release or postpone its successor",async()=>{
 const q=await round();await scheduleGamePhase(room,'PLAY',Date.now()+10000,q.roundId);
 const lock=`game:runtime:lock:${roomId}`,successorDue=Date.now()+12000;
 const evalRedis=redis.eval.bind(redis);let replaced=false;
 const intercept=vi.spyOn(redis,'eval').mockImplementation(async(script:any,options:any)=>{
  if(!replaced && typeof script==='string' && script.includes("'timer',ARGV[3],'deadline',ARGV[5]")) {
   replaced=true;
   await redis.set(lock,'successor',{PX:15000});
   await redis.zAdd('game:runtime:due',{value:roomId,score:successorDue});
  }
  return evalRedis(script,options);
 });
 try {
  await redis.zAdd('game:runtime:due',{value:roomId,score:0});await tickGameRuntimes(io);
  expect(replaced).toBe(true);
  expect(await redis.get(lock)).toBe('successor');
  expect(await redis.zScore('game:runtime:due',roomId)).toBe(successorDue);
 }finally{intercept.mockRestore();await redis.del(lock);}
 await captureRound(room);await settleGameRound(q.roundId,snapshot=>calculateGameRoomPoints(room,snapshot));
});

it.each(['TYPEMANIA','WORDMAKER','LUCKYSPIN','LUCKYFLIP'])('finishes an unanswered %s round and starts the next one automatically',async catName=>{
 const q=await round();
 await redis.hSet(`room:${roomId}`,{catName});
 await redis.del(`room:${roomId}:answers`);
 // Reproduce an already-stuck RESULT and its cached Lua snapshot, without rejoining.
 await captureLiveGameRound({...room,catName});
 expect(await redis.hGet(`room:${roomId}`,'status')).toBe('RESULT');
 expect(JSON.parse((await redis.get(`game:round-snapshot:${q.roundId}`))!).answers).toEqual({});
 const live=await finishLiveGameRound({...room,catName});
 expect(live.snapshot.answers).toEqual([]);
 expect(live.scores).toEqual([]);
 expect(await redis.hGet(`room:${roomId}`,'status')).toBe('CHAT');
 await settleQueuedGameRound(q.roundId);
 expect((await db.gameRoundRecord.findUniqueOrThrow({where:{id:q.roundId}})).status).toBe('COMPLETED');
 const {generateRoomQuestion}=await import('@/utils/ai');
 vi.mocked(generateRoomQuestion).mockResolvedValueOnce({...q,id:'next-question'});
 await redis.hSet(`room:${roomId}`,{deadline:String(Date.now()-1)});
 await redis.zAdd('game:runtime:due',{value:roomId,score:0});
 await tickGameRuntimes(io);
 expect(await redis.hGet(`room:${roomId}`,'status')).toBe('PLAY');
 const nextId=(await redis.hGet(`room:${roomId}`,'roundId'))!;
 rounds.push(nextId);
 expect(nextId).not.toBe(q.roundId);
 expect(Number(await redis.hGet(`room:${roomId}`,'deadline'))).toBeGreaterThan(Date.now());
 await redis.del(`room:${roomId}:answers`);
 await finishLiveGameRound({...room,catName});await settleQueuedGameRound(nextId);
});

it("completes an acronym round with an answer but no votes",async()=>{
 const q=await round();
 await redis.hSet(`room:${roomId}`,{gameName:'ACRONYM'});
 await redis.del(`room:${roomId}:answers`);
 await redis.hSet(`room:${roomId}:answers`,{[users[0]]:JSON.stringify({playerId:users[0],roomId,catId,name:users[0],answer:'A sample acronym',timer:5,voted:false,votes:[]})});
 const live=await finishLiveGameRound({...room,gameName:'ACRONYM'});
 expect(live.snapshot.answers[0].votes).toEqual([]);
 expect(live.snapshot.answers[0].answers).toEqual([]);
 expect(live.scores[0].score).toBe(10);
 expect(await redis.hGet(`room:${roomId}`,'status')).toBe('CHAT');
 await settleQueuedGameRound(q.roundId);
});

it('preloads the join benefits and freezes the first authoritative subscription boost per round',async()=>{
 const plan=await db.subscriptionPlan.create({data:{name:'Round benefits',level:1,price:1,ngnPrice:100,discount:0,accountType:'PERSONAL'}});
 const subscription=await db.subscription.create({data:{userId:users[0],planId:plan.id,isPrimary:true,status:'ACTIVE',startDate:new Date(Date.now()-1000),endDate:new Date(Date.now()+86400000)}});
 try {
  const joined=await addGameRoomPlayer({playerId:users[0],socketId:'benefit-owner',roomId:roomId.slice(6),gameId,catId,mode:'MULTI',name:'Benefit player',voteCount:0});
  expect(joined.data?.accountBenefits).toMatchObject({level:1,gamePointBoostBps:500});
  const q=await round();
  await redis.del(`room:${roomId}:answers`);
  const delivery:any={kind:'ANSWER',roomId,roundId:q.roundId,payload:{playerId:users[0],name:'Benefit player',roomId,catId,answer:q.answer,timer:10,accountBenefits:{level:3,gamePointBoostBps:9999}}};
  const params:any={playerId:users[0],operationId:'level-round-first',action:GameActionEnum.ANSWER,catId,mode:'MULTI',roomId};
  const first=await chargeGameAction(params,1,1,delivery);await dispatchGameAction(first.actionId!);
  await db.subscriptionPlan.update({where:{id:plan.id},data:{level:3}});
  const second=await chargeGameAction({...params,operationId:'level-round-second'},1,1,delivery);await dispatchGameAction(second.actionId!);
  const admitted=await db.gameWalletAction.findUniqueOrThrow({where:{id:second.actionId!}});
  expect((admitted.payload as any).accountBenefits).toMatchObject({level:1,gamePointBoostBps:500});
  const captured=await captureLiveGameRound(room);
  const scores=await calculateGameRoomPoints(room,captured);
  expect(scores[0]).toMatchObject({baseScore:20,score:21,boostPoints:1,accountLevel:1});
  await captureRound(room,captured);await settleGameRound(q.roundId,snapshot=>calculateGameRoomPoints(room,snapshot));
 }finally{
  await db.subscription.delete({where:{id:subscription.id}});await db.subscriptionPlan.delete({where:{id:plan.id}});
 }
});
