import { Prisma, GameMode } from "@prisma/client";
import { randomUUID } from "node:crypto";
import prisma from "@/db";
import redis from "@/redis";
import logger from "@/logger";
import {gameRuntimeLease,assertGameRuntimeLease} from "./lease";
import {
  rankingKeysAt,
  playerKeysAt,
  GAME_PERIOD_RETENTION_SECONDS,
  gamePeriod,
  isoWeekStart,
} from "@/utils/game-periods";
import { TempGameRoom, ThemedGameQuestion, ThemedGameScore } from "@/types";
import { applyRoundGameEnergy, syncGameEnergy } from "./energy";
export type RoundSnapshot = { question: ThemedGameQuestion; answers: any[] };

export async function recordGameRound(
  room: TempGameRoom,
  question: ThemedGameQuestion,
) {
  if (!question.roundId) throw new Error("A round ID is required");
  await prisma.gameRoundRecord.upsert({
    where: { id: question.roundId },
    update: {},
    create: {
      id: question.roundId,
      roomId: room.roomId,
      generation: room.generation ?? "legacy",
      catId: room.catId,
      mode: room.mode,
      playedAt: new Date((question as any).startedAt ?? Date.now()),
      question: {
        ...question,
        context: room,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
// Closing admission and capturing answers share the same Redis serialization point.
// Inputs remain until the completed result has a durable PostgreSQL receipt.
const captureScript = `
if ARGV[3] and ARGV[3]~='' and redis.call('GET',KEYS[7])~=ARGV[3] then return '' end
local cached=redis.call('GET',KEYS[6]);if cached then return cached end
local q=redis.call('GET',KEYS[1]); if not q then return '' end
local question=cjson.decode(q)
if question.roundId~=ARGV[1] or redis.call('HGET',KEYS[2],'generation')~=ARGV[2] then return '' end
redis.call('HSET',KEYS[2],'status','RESULT','timer','0')
local values=redis.call('HGETALL',KEYS[3]); local answers={}
for i=1,#values,2 do
 local answer=cjson.decode(values[i+1]); local guesses=redis.call('HVALS',KEYS[4]..values[i]..':guesses')
 local entries={}; for _,guess in ipairs(guesses) do table.insert(entries,cjson.decode(guess)) end
 answer.answers=entries; table.insert(answers,answer)
end
local snapshot=cjson.encode({question=question,answers=answers,actionIds=redis.call('SMEMBERS',KEYS[5])});redis.call('SET',KEYS[6],snapshot);return snapshot`;
export async function captureRound(room: TempGameRoom, input?: RoundSnapshot & {actionIds?: string[]}) {
  const qraw = input ? JSON.stringify(input.question) : await redis.get(`room:${room.roomId}:question`);
  if (!qraw)
    throw new Error("Round question missing; recovery must restore it");
  const q = JSON.parse(qraw) as ThemedGameQuestion;
  const record = await prisma.gameRoundRecord.findUniqueOrThrow({
    where: { id: q.roundId },
  });
  if (record.snapshot !== null) {
    await expireCapturedReceipts(record);
    return record;
  }
  const raw = input ? JSON.stringify(input) : await redis.eval(captureScript, {
    keys: [
      `room:${room.roomId}:question`,
      `room:${room.roomId}`,
      `room:${room.roomId}:answers`,
      `room:${room.roomId}:player:`,
      `room:${room.roomId}:round:${q.roundId}:actions`,
      `game:round-snapshot:${q.roundId}`,
    ],
    arguments: [q.roundId!, room.generation ?? "legacy"],
  });
  if (!raw) throw new Error("Round ownership changed during capture");
  const snapshot = JSON.parse(String(raw));
  if (!Array.isArray(snapshot.answers)) snapshot.answers = [];
  if (!Array.isArray(snapshot.actionIds)) snapshot.actionIds = [];
  for (const answer of snapshot.answers)
    if (!Array.isArray(answer.answers)) answer.answers = [];
  await prisma.$transaction(async (tx) => {
    if (Array.isArray(snapshot.actionIds) && snapshot.actionIds.length)
      await tx.gameWalletAction.updateMany({
        where: {
          id: { in: snapshot.actionIds },
          roundId: q.roundId,
          status: "PENDING",
        },
        data: { status: "DELIVERED", settledAt: new Date() },
      });
    if (Array.isArray(snapshot.actionIds) && snapshot.actionIds.length) {
      const accepted = await tx.gameWalletAction.count({
        where: {
          id: { in: snapshot.actionIds },
          roundId: q.roundId,
          status: "DELIVERED",
        },
      });
      if (accepted !== snapshot.actionIds.length)
        throw new Error(
          "Round contains refunded or missing actions; durable recovery must reconcile it",
        );
    }
    await tx.gameRoundRecord.updateMany({
      where: { id: record.id, snapshot: { equals: Prisma.DbNull } },
      data: { snapshot },
    });
  });
  const captured = await prisma.gameRoundRecord.findUniqueOrThrow({
    where: { id: record.id },
  });
  await expireCapturedReceipts(captured);
  return captured;
}

async function expireCapturedReceipts(record: {
  id: string;
  roomId: string;
  snapshot: unknown;
}) {
  const snapshot = record.snapshot as { actionIds?: string[] } | null;
  const pipeline=redis.multi();
  for (const id of snapshot?.actionIds??[]) pipeline.expire(`wallet-action:${id}`,7*86400);
  pipeline.expire(`room:${record.roomId}:round:${record.id}:actions`,7*86400);
  pipeline.expire(`game:round-snapshot:${record.id}`,7*86400);
  await pipeline.exec();
}

export async function settleGameRound(
  recordId: string,
  calculate: (snapshot: RoundSnapshot) => Promise<ThemedGameScore[]>,
) {
  const record = await prisma.gameRoundRecord.findUniqueOrThrow({
    where: { id: recordId },
  });
  const snapshot = record.snapshot as unknown as RoundSnapshot;
  if (!snapshot) throw new Error("Round snapshot is not durable");
  const candidate =
    record.status === "COMPLETED"
      ? (record.scores as unknown as ThemedGameScore[])
      : await calculate(snapshot);
  assertGameRoundScores(record,candidate);
  const date = gamePeriod(record.playedAt);
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GameRoundRecord" WHERE id=${recordId} FOR UPDATE`;
      const current = await tx.gameRoundRecord.findUniqueOrThrow({
        where: { id: recordId },
      });
      if (current.status === "COMPLETED") return;
      if (candidate.length) {
        const rows = [...candidate].sort((a, b) =>
          a.playerId.localeCompare(b.playerId),
        );
        await tx.$executeRaw(Prisma.sql`INSERT INTO "GameMonthStat" (id,"playerId","catId",mode,year,month,score,"numPlayed","updatedAt") VALUES
        ${Prisma.join(rows.map((s) => Prisma.sql`(${randomUUID()},${s.playerId},${record.catId},${record.mode}::"GameMode",${date.year},${date.month},${s.score},1,NOW())`))}
        ON CONFLICT("playerId","catId",year,month,mode) DO UPDATE SET score="GameMonthStat".score+EXCLUDED.score,"numPlayed"="GameMonthStat"."numPlayed"+1,"updatedAt"=NOW()`);
        const periods = [
          { kind: "week", start: isoWeekStart(date.weekYear, date.week) },
          {
            kind: "today",
            start: new Date(Date.UTC(date.year, date.month - 1, date.day)),
          },
        ];
        await tx.$executeRaw(Prisma.sql`INSERT INTO "GamePeriodStat" (id,"playerId","catId",mode,kind,"periodStart",score,"numPlayed","updatedAt") VALUES
        ${Prisma.join(rows.flatMap((s) => periods.map((p) => Prisma.sql`(${randomUUID()},${s.playerId},${record.catId},${record.mode}::"GameMode",${p.kind},${p.start},${s.score},1,NOW())`)))}
        ON CONFLICT("playerId","catId",mode,kind,"periodStart") DO UPDATE SET score="GamePeriodStat".score+EXCLUDED.score,"numPlayed"="GamePeriodStat"."numPlayed"+1,"updatedAt"=NOW()`);
      }
      await tx.gameRoundRecord.update({
        where: { id: recordId },
        data: {
          status: "COMPLETED",
          scores: candidate as unknown as Prisma.InputJsonValue,
        },
      });
    },
    { timeout: 15000, maxWait: 10000 },
  );
  await projectGameRound(recordId);
  return await prisma.gameRoundRecord.findUniqueOrThrow({
    where: { id: recordId },
  });
}

export function assertGameRoundScores(record:{catId:string;roomId:string},scores:ThemedGameScore[]) {
  if (
    !Array.isArray(scores) ||
    scores.length > 100 ||
    new Set(scores.map((s) => s.playerId)).size !== scores.length ||
    scores.some(
      (s) =>
        !Number.isSafeInteger(s.score) ||
        Math.abs(s.score) > 1_000_000 ||
        s.catId !== record.catId ||
        s.roomId !== record.roomId,
    )
  )
    throw new Error("Invalid round score");
 }

const projectScript = `
if redis.call('EXISTS',KEYS[1])==1 then return 0 end
local data=cjson.decode(ARGV[1]); local ttl=tonumber(ARGV[2]); local total=0
-- Lua errors do not roll back earlier writes: validate every destination first.
local function check(key,kind)
 local t=redis.call('TYPE',key).ok
 if t~='none' and t~=kind then error('Invalid round projection storage type') end
 if t=='hash' then
  for _,field in ipairs({'score','numPlayed'}) do
   local n=redis.call('HGET',key,field)
   if n and not string.match(n,'^%-?%d+$') then error('Invalid round projection counter') end
  end
 end
end
check(data.monthStat,'hash')
for _,p in ipairs(data.players) do
 for _,key in ipairs(p.rankings) do check(key,'zset') end
 for _,key in ipairs(p.stats) do check(key,'hash') end
 check(p.info,'hash')
end
for _,p in ipairs(data.players) do
 for _,key in ipairs(p.rankings) do redis.call('ZINCRBY',key,p.score,p.id); redis.call('EXPIRE',key,ttl) end
 for _,key in ipairs(p.stats) do redis.call('HINCRBY',key,'score',p.score); redis.call('HINCRBY',key,'numPlayed',1);redis.call('EXPIRE',key,ttl) end
 redis.call('HSET',p.info,'id',p.id,'name',p.name,'avatar',p.avatar);redis.call('EXPIRE',p.info,ttl)
 total=total+p.score
end
redis.call('HINCRBY',data.monthStat,'score',total);redis.call('HINCRBY',data.monthStat,'numPlayed',1);redis.call('EXPIRE',data.monthStat,ttl)
redis.call('SET',KEYS[1],'1');return 1`;
export async function projectGameRound(id: string) {
  const record = await prisma.gameRoundRecord.findUniqueOrThrow({
    where: { id },
  });
  if (record.status !== "COMPLETED" || !record.projectionPending) return;
  const scores = record.scores as unknown as ThemedGameScore[];
  await Promise.all(scores.map(score=>applyRoundGameEnergy(score.playerId,record.catId,id)));
  await syncGameEnergy(1000,scores.map(score=>({playerId:score.playerId,catId:record.catId})));
  await projectLiveGameScores({...record, playedAt:new Date(record.playedAt)}, scores);
  // Keep receipt through retry windows; no score increments precede the marker.
  await prisma.gameRoundRecord.update({
    where: { id },
    data: { projectionPending: false },
  });
}
/** Same marker prevents a later PostgreSQL retry from incrementing live ranks twice. */
export async function projectLiveGameScores(record: {id:string;catId:string;mode:string;playedAt:Date}, scores:ThemedGameScore[]) {
  const mode = record.mode === "SINGLE" ? "single" : "multi";
  const rankings = rankingKeysAt(record.catId, mode, record.playedAt);
  const players = scores.map((score) => {
    const keys = playerKeysAt(
      score.playerId,
      record.catId,
      mode,
      record.playedAt,
    );
    return {
      id: score.playerId,
      score: score.score,
      name: score.name ?? "",
      avatar: score.avatar ?? "",
      info: keys.info,
      rankings: [rankings.month, rankings.week, rankings.today],
      stats: [keys.month, keys.week, keys.today],
    };
  });
  const marker = `game:round-projection:${record.id}`;
  await redis.eval(projectScript, {
    keys: [marker],
    arguments: [
      JSON.stringify({ players, monthStat: rankings.monthStat }),
      String(GAME_PERIOD_RETENTION_SECONDS),
    ],
  });
  await redis.expire(`game:round-projection:${record.id}`, GAME_PERIOD_RETENTION_SECONDS);
}

export async function captureLiveGameRound(room:TempGameRoom) {
  await assertGameRuntimeLease();
  const lease=gameRuntimeLease.getStore();
  const qraw=await redis.get(`room:${room.roomId}:question`);
  if(!qraw) throw new Error('Round question missing');
  const question=JSON.parse(qraw) as ThemedGameQuestion;
  const raw=await redis.eval(captureScript,{
    keys:[`room:${room.roomId}:question`,`room:${room.roomId}`,`room:${room.roomId}:answers`,
      `room:${room.roomId}:player:`,`room:${room.roomId}:round:${question.roundId}:actions`,`game:round-snapshot:${question.roundId}`,lease?.key??'game:no-runtime-lease'],
    arguments:[question.roundId!,room.generation??'legacy',lease?.token??''],
  });
  if(!raw) throw new Error('Round ownership changed during capture');
  return JSON.parse(String(raw)) as RoundSnapshot & {actionIds:string[]};
}

export async function recoverRoundProjections() {
  const rows = await prisma.gameRoundRecord.findMany({
    where: { status: "COMPLETED", projectionPending: true },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  for (const row of rows) {
    try {
      await projectGameRound(row.id);
    } catch (error) {
      logger.error(
        { event: "game_round_projection_failed", roundId: row.id, error },
        "Game score projection remains pending",
      );
    }
  }
}

/** Never freeze a reward ranking while this period still has queued round writes. */
export async function assertGameRoundsSynced(where:Prisma.GameRoundRecordWhereInput) {
  const pending=await prisma.gameRoundRecord.findFirst({where:{...where,status:'PENDING'},select:{id:true}});
  if(pending)throw new Error('Game results are still syncing for this reward period; retry after settlement');
}
