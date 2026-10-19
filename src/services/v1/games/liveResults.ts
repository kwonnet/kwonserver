import redis from '@/redis';
import prisma from '@/db';
import logger from '@/logger';
import { GameEventEnum, TempGameRoom, ThemedGameScore } from '@/types';
import { captureLiveGameRound, captureRound, projectLiveGameScores, settleGameRound, assertGameRoundScores, RoundSnapshot } from './rounds';
import { gameClock } from './clock';
import {gameRuntimeLease,assertGameRuntimeLease} from './lease';
const pendingKey = 'game:results:pending';
const resultKey = (id: string) => `game:result:${id}`;
type LiveResult = {
  chatDeadline: number;
  room: TempGameRoom;
  snapshot: RoundSnapshot & {
    actionIds: string[];
  };
  scores: ThemedGameScore[];
};
/** Only trusted, already admitted Redis answers enter this immutable result. */
export async function finishLiveGameRound(room: TempGameRoom): Promise<LiveResult> {
  const snapshot = await captureLiveGameRound(room), id = snapshot.question.roundId!;
  const { calculateGameRoomPoints } = await import('./index');
  const scores = await calculateGameRoomPoints(room, snapshot);
  assertGameRoundScores({ roomId: room.roomId, catId: room.catId }, scores);
  const now=await gameClock();
  const chatDeadline=now+(room.mode==='SINGLE'?5:10)*1000;
  const candidate = { room, snapshot, scores, chatDeadline };
  const winner = scores[0]?.score > 0 ? scores[0].playerId : '';
  const lease=gameRuntimeLease.getStore();
  const raw = await redis.eval(`if redis.call('HGET',KEYS[5],'generation')~=ARGV[7] then return '' end
  if ARGV[8]~='' and redis.call('GET',KEYS[7])~=ARGV[8] then return '' end
  local q=redis.call('GET',KEYS[6]);if not q or cjson.decode(q).roundId~=ARGV[3] then return '' end
  local old=redis.call('GET',KEYS[1]);if old then return old end
  if redis.call('EXISTS',KEYS[4])==0 then
   local n=0;if ARGV[4]~='' then n=1;if redis.call('HGET',KEYS[3],'playerId')==ARGV[4] then n=tonumber(redis.call('HGET',KEYS[3],'streak') or '0')+1 end
   redis.call('HSET',KEYS[3],'playerId',ARGV[4],'catId',ARGV[5],'streak',n) else redis.call('DEL',KEYS[3]) end
   redis.call('SET',KEYS[4],n,'EX',10368000)
  end
  redis.call('SET',KEYS[1],ARGV[1]);redis.call('ZADD',KEYS[2],ARGV[2],ARGV[3]);redis.call('HSET',KEYS[5],'status','CHAT','deadline',ARGV[6]);redis.call('HINCRBY',KEYS[5],'revision',1);return ARGV[1]`, { keys: [resultKey(id), pendingKey, `room:${room.roomId}:streak`, `game:streak-effect:${id}`,`room:${room.roomId}`,`room:${room.roomId}:question`,lease?.key??'game:no-runtime-lease'], arguments: [JSON.stringify(candidate), String(now), id, winner, room.catId,String(chatDeadline),room.generation??'legacy',lease?.token??''] });
  if(!raw)throw new Error('Round ownership changed before live result publication');
  await assertGameRuntimeLease();
  const saved = JSON.parse(String(raw)) as LiveResult;
  await projectLiveGameScores({ id, catId: room.catId, mode: room.mode, playedAt: new Date((saved.snapshot.question as any).startedAt ?? saved.snapshot.question.answerUntil ?? await gameClock()) }, saved.scores);
  return saved;
}
export async function enqueueGameResult(id: string) {
  const { gameResultQueue } = await import('@/cron/jobs/queue');
  const previous = await gameResultQueue.getJob(id);
  if (previous && await previous.getState() === 'failed')
    await previous.remove();
  await gameResultQueue.add('settle-round', { roundId: id }, { jobId: id, attempts: 10,
    backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 7 * 86400, count: 10000 }, removeOnFail: { age: 30 * 86400, count: 10000 } });
}
/** Redis outbox survives enqueue/worker failures, with SQL action journals as a second recovery source. */
export async function recoverLiveGameResults() {
  const now = await gameClock();
  const ids = await redis.zRangeByScore(pendingKey, 0, now, { LIMIT: { offset: 0, count: 100 } });
  const { PromisePool } = await import('@supercharge/promise-pool');
  const { errors } = await PromisePool.for(ids).withConcurrency(4).process(async (id) => {
    await enqueueGameResult(id);
    // XX avoids resurrecting an entry removed by an already completed worker.
    await redis.zAdd(pendingKey, { value: id, score: now + 60000 }, { XX: true });
  });
  for (const error of errors)
    logger.error({ event: 'game_result_enqueue_failed', error }, 'Round remains in Redis outbox');
}
export async function settleQueuedGameRound(id: string) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))
    throw new Error('Invalid round identity');
  const raw = await redis.get(resultKey(id));
  if (!raw)
    throw new Error('Live round result missing; durable recovery must reconcile it');
  const { room, snapshot, scores, chatDeadline } = JSON.parse(raw) as LiveResult;
  // Only checkpoint this finished round; a delayed worker must not overwrite a newer PLAY.
  await prisma.gameRoomRuntime.updateMany({where:{id:room.roomId,generation:room.generation,roundId:id,phase:{in:['PLAY','VOTE','RESULT']}},
    data:{phase:'CHAT',deadline:new Date(chatDeadline),revision:{increment:1}}});
  await captureRound(room, snapshot);
  const settled = await settleGameRound(id, async () => scores);
  const events: {
    target: string;
    event: string;
    payload: unknown;
  }[] = [];
  const target = { to: (target: string) => ({ emit: (event: string, payload: unknown) => events.push({ target, event, payload }) }) };
  if (settled.effectsPending && scores[0]?.score > 0) {
    const { updateWinningStreak } = await import('./index');
    await updateWinningStreak({ ...scores[0], mode: room.mode, roundId: id }, target as any);
  }
  // One batch query replaces a separate database read per player.
  const energies = scores.length ? await prisma.gameEnergy.findMany({ where: { catId: room.catId, playerId: { in: scores.map(p => p.playerId) } } }) : [];
  for (const energy of energies)
    events.push({ target: energy.playerId, event: GameEventEnum.GAME_PLAYER_ENERGY, payload: energy });
  for (const event of events)
    await redis.publish('game:events:live', JSON.stringify(event));
  await prisma.gameRoundRecord.update({ where: { id }, data: { effectsPending: false } });
  await redis.zRem(pendingKey, id);
  await redis.expire(resultKey(id), 7 * 86400);
}
