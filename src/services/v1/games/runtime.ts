import { gameClock } from "./clock";
import { gameRuntimeLease, assertGameRuntimeLease } from "./lease";
import { randomUUID } from "node:crypto";
import { Namespace } from "socket.io";
import { Prisma } from "@prisma/client";
import prisma from "@/db";
import redis from "@/redis";
import logger from "@/logger";
import { TempGameRoom, GameStatusEnum, GameEventEnum, ThemedGameQuestion } from "@/types";
import { publicWordQuestion } from "@/utils/word-games";
import { recoverRoundProjections } from "./rounds";
const dueKey = "game:runtime:due";
const phases = new Set(["CHAT", "PLAY", "VOTE", "RESULT"]);
/** Never let a stale room step remove a successor's schedule. */
async function unscheduleEmptyRoom(roomId: string) {
  await redis.eval(`if redis.call('SCARD',KEYS[2])==0 then
    return redis.call('ZREM',KEYS[1],ARGV[1]) end
    redis.call('ZADD',KEYS[1],'NX',ARGV[2],ARGV[1]);return 0`, {
    keys: [dueKey, `room:${roomId}:players`], arguments: [roomId, String(await gameClock())],
  });
}

export async function scheduleGamePhase(room: TempGameRoom, phase: string, deadline: number, roundId?: string) {
  return Boolean(await persistGamePhase(room, phase, deadline, roundId));
}
/** Prepare first, then start the configured answer window as late as possible. */
export async function beginGameRound(room: TempGameRoom, question: ThemedGameQuestion, seconds: number) {
  const result = await persistGamePhase(room, "PLAY", 0, randomUUID(), { question, seconds });
  return result ? result.question : undefined;
}
async function persistGamePhase(room: TempGameRoom, phase: string, deadline: number, roundId?: string, round?: {
  question: ThemedGameQuestion;
  seconds: number;
}) {
  await assertGameRuntimeLease();
  if (!room.generation || !Number.isFinite(deadline))
    throw new Error("Room generation and deadline are required");
  if ((await redis.hGet(`room:${room.roomId}`, "generation")) !== room.generation)
    return false;
  const previous = await prisma.gameRoomRuntime.findUnique({ where: { id: room.roomId } });
  // Catalog/question generation and runtime lookup must not consume play time.
  const now = await gameClock();
  if (round)
    deadline = now + round.seconds * 1000;
  const question = round ? { ...round.question, roundId, startedAt: now,
    answerUntil: deadline, voteUntil: deadline + 12000 } : undefined;
  const config = { ...room, status: phase, timer: Math.max(0, Math.ceil((deadline - now) / 1000)) };
  const data = { generation: room.generation, config: config as unknown as Prisma.InputJsonValue,
    phase, deadline: new Date(deadline), roundId: roundId ?? null, active: true };
  const persist = async (db: Prisma.TransactionClient) => {
    const changed = previous
      ? await db.gameRoomRuntime.updateMany({ where: { id: room.roomId, generation: previous.generation, revision: previous.revision }, data: { ...data, revision: { increment: 1 } } })
      : await db.gameRoomRuntime.createMany({ data: [{ id: room.roomId, ...data }], skipDuplicates: true });
    if (!changed.count)
      return false;
    if (question)
      await db.gameRoundRecord.create({ data: { id: roundId!, roomId: room.roomId,
          generation: room.generation!, catId: room.catId, mode: room.mode, playedAt: new Date(now),
          question: { ...question, context: config } as unknown as Prisma.InputJsonValue } });
    return true;
  };
  // The round receipt and phase become durable together, with no duplicate upsert.
  const saved = question ? await prisma.$transaction(persist) : await persist(prisma);
  if (!saved)
    return false;
  await assertGameRuntimeLease();
  const changed = await redis.eval("if redis.call('HGET',KEYS[1],'generation')~=ARGV[1] then return 0 end;redis.call('HSET',KEYS[1],'status',ARGV[2],'timer',ARGV[3],'deadline',ARGV[4],'roundId',ARGV[8],'revision',ARGV[9]);if ARGV[5]~='' then redis.call('SET',KEYS[2],ARGV[5]) end;redis.call('ZADD',KEYS[3],ARGV[6],ARGV[7]);return 1", { keys: [`room:${room.roomId}`, `room:${room.roomId}:question`, dueKey],
    arguments: [room.generation, phase, String(config.timer), String(deadline), question ? JSON.stringify(question) : '', String(now), room.roomId, roundId??'', String(previous?previous.revision+1:0)] });
  return changed ? { question } : false;
}

/** Resume any occupied Redis room whose old process had only an in-memory timer. */
export async function ensureGameRuntime(room: TempGameRoom) {
  const existing = await prisma.gameRoomRuntime.findUnique({
    where: { id: room.roomId },
  });
  if (existing?.active && existing.generation === room.generation) {
    await redis.zAdd(dueKey, { value: room.roomId, score: await gameClock() });
    return;
  }
  let deadline = (await gameClock()) + 5000,
    roundId: string | undefined;
  const raw = await redis.get(`room:${room.roomId}:question`);
  if (raw) {
    const q = JSON.parse(raw);
    roundId = q.roundId;
    if (room.status === "PLAY") deadline = q.answerUntil;
    else if (room.status === "VOTE") deadline = q.voteUntil;
    if (roundId) {
      const { recordGameRound } = await import("./rounds");
      await recordGameRound(room, q);
    }
  }
  await scheduleGamePhase(room, phases.has(room.status) ? room.status : "CHAT", deadline, roundId);
}

async function stepRoom(roomId: string, io: Namespace) {
  const stepStartedAt = await gameClock();
  const token = randomUUID(),
    lock = `game:runtime:lock:${roomId}`;
  if (!(await redis.set(lock, token, { NX: true, PX: 15000 }))) return;
  let owned = true,
    renewing = false;
  const timer = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      owned =
        Number(
          await redis.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],15000) end;return 0",
            { keys: [lock], arguments: [token] },
          ),
        ) === 1;
    } catch (error) {
      owned = false;
      logger.error(
        { event: "game_runtime_lease_failed", roomId, error },
        "Room lease renewal failed",
      );
    } finally {
      renewing = false;
    }
  }, 4000);
  try {
    await gameRuntimeLease.run({ key: lock, token }, async () => {
      const {
        getGameRoom, checkGameNumPlayers, getGameResult, gameVoteTime,
        getTotalRoomPlayers, deleteGameRoomQuestionAndAnswers,
      } = await import("./index");
      const room = await getGameRoom(roomId);
      // Live timers use Redis. Missing/invalid caches recover from the durable phase.
      const cached = room && phases.has(room.status) && Number(room.deadline) > 0 && Number.isFinite(Number(room.deadline));
      const runtime = cached ? {
        active:true, generation:room.generation, phase:room.status,
        deadline:new Date(Number(room.deadline)), roundId:room.roundId||null, revision:Number(room.revision??0),
      } : await prisma.gameRoomRuntime.findUnique({where:{id:roomId}});
      if (room && (!runtime?.active || room.generation !== runtime.generation)) {
        // A player can replace an empty room while its old timer is still stepping.
        // Rebuild the occupied generation instead of deleting its due entry.
        if (await getTotalRoomPlayers(roomId) > 0) {
          await ensureGameRuntime(room);
          return;
        }
      }
      if (!runtime?.active || !room || room.generation !== runtime.generation) {
        if (runtime) await prisma.gameRoomRuntime.updateMany({
          where:{id:roomId,generation:runtime.generation},data:{active:false},
        });
        await unscheduleEmptyRoom(roomId);
        return;
      }
      if (!cached && !await redis.eval(`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('HGET',KEYS[2],'generation')~=ARGV[2] then return 0 end
        redis.call('HSET',KEYS[2],'deadline',ARGV[3],'roundId',ARGV[4],'revision',ARGV[5],'status',ARGV[6]);return 1`, {
        keys:[lock,`room:${roomId}`], arguments:[token,runtime.generation!,String(runtime.deadline.getTime()),runtime.roundId??'',String(runtime.revision),runtime.phase],
      })) return;
      // The durable round restores the question if Redis lost this individual key.
      if (runtime.roundId && !(await redis.exists(`room:${roomId}:question`))) {
        const record = await prisma.gameRoundRecord.findUniqueOrThrow({
          where: { id: runtime.roundId },
        });
        await assertGameRuntimeLease();
        const restored = await redis.eval(`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('HGET',KEYS[2],'generation')~=ARGV[2] or redis.call('HGET',KEYS[2],'roundId')~=ARGV[3] then return 0 end
          redis.call('SET',KEYS[3],ARGV[4],'NX');return 1`, {
          keys:[lock,`room:${roomId}`,`room:${roomId}:question`],
          arguments:[token,runtime.generation!,runtime.roundId,JSON.stringify(record.question)],
        });
        if (!restored) return;
      }
      if ((await getTotalRoomPlayers(roomId)) === 0) {
        if (
          runtime.roundId &&
          ["PLAY", "VOTE", "RESULT"].includes(runtime.phase)
        )
          await getGameResult(roomId, io as any);
        await prisma.gameRoomRuntime.updateMany({
          where: { id: roomId, generation: runtime.generation },
          data: { active: false },
        });
        const { cleanUpGameRoom } = await import("./index");
        await cleanUpGameRoom(roomId);
        await unscheduleEmptyRoom(roomId);
        return;
      }
      const now = await gameClock(),
        countdown = Math.max(
          0,
          Math.ceil((runtime.deadline.getTime() - now) / 1000),
        );
      if (!owned) return;
      const valid = await redis.eval(
        "if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('HGET',KEYS[2],'generation')~=ARGV[2] or redis.call('HGET',KEYS[2],'status')~=ARGV[4] or (redis.call('HGET',KEYS[2],'revision') or '0')~=ARGV[6] or (redis.call('HGET',KEYS[2],'roundId') or '')~=ARGV[7] then return 0 end;redis.call('HSET',KEYS[2],'timer',ARGV[3],'deadline',ARGV[5]);return 1",
        {
          keys: [lock, `room:${roomId}`],
          arguments: [
            token,
            runtime.generation!,
            String(countdown),
            runtime.phase,
            String(runtime.deadline.getTime()),
            String(runtime.revision),
            runtime.roundId??'',
          ],
        },
      );
      if (!valid) return;
      io.to(roomId).emit(GameEventEnum.GAME_ROOM_STATE, {
        status: runtime.phase,
        countdown,
        deadline: runtime.deadline.getTime(),
        serverNow: now,
        roundId: runtime.roundId,
        sequence: runtime.revision,
      });
      if (countdown > 0) return;
      if (runtime.phase === "CHAT") {
        if (runtime.roundId)
          await deleteGameRoomQuestionAndAnswers(
            roomId,
            runtime.roundId,
            runtime.generation!,
          );
        await checkGameNumPlayers(
          { ...room, status: "CHAT" as GameStatusEnum },
          io as any,
        );
      } else if (runtime.phase === "PLAY") {
        const { getGameType } = await import("@/services/helper");
        if (getGameType(room.gameName) === "ACRONYM")
          await gameVoteTime(
            { ...room, status: "VOTE" as GameStatusEnum },
            io as any,
          );
        else await getGameResult(roomId, io as any);
      } else if (runtime.phase === "VOTE" || runtime.phase === "RESULT")
        await getGameResult(roomId, io as any);
    });
  } finally {
    clearInterval(timer);
    // Release and reschedule atomically. An expired step cannot delay a successor,
    // and an entry removed by empty-room cleanup must not be resurrected.
    await redis.eval(`if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
      local due=redis.call('ZSCORE',KEYS[2],ARGV[2])
      if due and tonumber(due)>tonumber(ARGV[3]) then redis.call('ZADD',KEYS[2],ARGV[3],ARGV[2]) end
      return redis.call('DEL',KEYS[1])`, {
      keys:[lock,dueKey],arguments:[token,roomId,String(stepStartedAt+1000)],
    });
  }
}
export async function tickGameRuntimes(io: Namespace) {
  const raw = (await redis.eval(
    "local now=redis.call('TIME');local ms=tonumber(now[1])*1000+math.floor(tonumber(now[2])/1000);local rooms=redis.call('ZRANGEBYSCORE',KEYS[1],'-inf',ms,'LIMIT',0,100);for _,id in ipairs(rooms) do redis.call('ZADD',KEYS[1],ms+15000,id) end;return rooms",
    { keys: [dueKey], arguments: [] },
  )) as string[];
  const { PromisePool } = await import("@supercharge/promise-pool");
  const { errors } = await PromisePool.for(raw)
    .withConcurrency(8)
    .process(async (id) => {
      await stepRoom(id, io);
    });
  for (const error of errors)
    logger.error(
      { event: "game_runtime_step_failed", error },
      "Room step remains recoverable",
    );
}
export async function startGameRuntimes(io: Namespace) {
  let closing = false,
    ticking = false;
  const running = new Set<Promise<void>>();
  // Reconstruct the scheduler from durable room records after process/Redis loss.
  await recoverRoundProjections();
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.gameRoomRuntime.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    const now = await gameClock();
    await redis.zAdd(
      dueKey,
      rows.map((row) => ({ value: row.id, score: now })),
    );
    cursor = rows.at(-1)!.id;
  }
  const tick = async () => {
    if (ticking || closing) return;
    ticking = true;
    try {
      await tickGameRuntimes(io);
    } catch (error) {
      logger.error(
        { event: "game_runtime_tick_failed", error },
        "Game scheduler will retry",
      );
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(async () => {
    const work = tick();
    running.add(work);
    try {
      await work;
    } finally {
      running.delete(work);
    }
  }, 500);
  return async () => {
    closing = true;
    clearInterval(timer);
    await Promise.all(running);
  };
}
