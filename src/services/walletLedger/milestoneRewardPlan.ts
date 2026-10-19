import {assertGameRoundsSynced} from '@/services/v1/games/rounds';
import {isoWeekStart} from '@/utils/game-periods';
import {ensureRewardRanking} from '@/services/v1/games/periodRecovery';
import {GameMilestoneRewardTask, Prisma, RewardReasonEnum, RewardTypeEnum} from '@prisma/client';
import prisma from '@/db';
import redis from '@/redis';
import {cents} from './index';
export type MilestoneAward = {playerId: string; rank: number; score: string; amount: number;
  rewardType: RewardTypeEnum; reason: RewardReasonEnum; milestoneId: string; thumbnail: string | null;
  legacyScope: string; legacyKey: string; description: string};
export type MilestonePlan = {version: 1; label: string; awards: MilestoneAward[]};

/** Only the first committed plan is paid. Queries read IDs/scores, never player hashes. */
export async function prepareMilestonePlan(task: GameMilestoneRewardTask): Promise<MilestonePlan> {
  const start=task.kind==='WEEK'?isoWeekStart(task.year,task.week):new Date(Date.UTC(task.year,0,1));
  const end=task.kind==='WEEK'?new Date(start.getTime()+7*86400000):new Date(Date.UTC(task.year+1,0,1));
  const categoryIds=task.kind==='CHAMP'?(await prisma.gameCategory.findMany({where:{gameId:task.scopeId},select:{id:true}})).map(c=>c.id):undefined;
  await assertGameRoundsSynced({playedAt:{gte:start,lt:end},
    ...(task.mode?{mode:task.mode}:{}),
    ...(['WEEK','YEAR'].includes(task.kind)?{catId:task.scopeId}:categoryIds?{catId:{in:categoryIds}}:{})});
  let label: string;
  let players: {playerId: string; score: string}[];
  if (task.kind === 'WEEK') {
    const category = await prisma.gameCategory.findUniqueOrThrow({where: {id: task.scopeId}});
    label = `${category.name} (${task.mode}) — week ${task.week}, ${task.year}`;
    if (!task.rankingKey) throw new Error('Missing weekly ranking key');
    const key=await ensureRewardRanking(task.scopeId,task.mode!,{kind:'week',year:task.year,week:task.week});
    const ranked = await redis.zRangeWithScores(key, 0, 2, {REV: true});
    players = ranked.map(p => ({playerId: p.value, score: String(p.score)}));
  } else {
    let filter = Prisma.sql`gms.year = ${task.year}`;
    if (task.kind === 'YEAR') {
      const category = await prisma.gameCategory.findUniqueOrThrow({where: {id: task.scopeId}});
      label = `${category.name} (${task.mode}) — ${task.year}`;
      filter = Prisma.sql`${filter} AND gms."catId" = ${task.scopeId} AND gms.mode = ${task.mode}::"GameMode"`;
    } else if (task.kind === 'CHAMP') {
      const game = await prisma.game.findUniqueOrThrow({where: {id: task.scopeId}});
      label = `${game.name} (${task.mode}) — ${task.year}`;
      filter = Prisma.sql`${filter} AND gc."gameId" = ${task.scopeId} AND gms.mode = ${task.mode}::"GameMode"`;
    } else if (task.kind === 'GRAND_CHAMP') label = `all games — ${task.year}`;
    else throw new Error('Unknown milestone reward kind');
    players = await prisma.$queryRaw<{playerId: string; score: string}[]>(Prisma.sql`
      SELECT gms."playerId", SUM(gms.score)::text AS score FROM "GameMonthStat" gms
      ${task.kind === 'CHAMP' ? Prisma.sql`INNER JOIN "GameCategory" gc ON gc.id = gms."catId"` : Prisma.empty}
      WHERE ${filter} GROUP BY gms."playerId"
      ORDER BY SUM(gms.score) DESC, gms."playerId" ASC LIMIT ${task.kind === 'YEAR' ? 3 : 1}`);
  }
  if (!players.length) return {version: 1, label, awards: []};
  const milestones = await prisma.gameMilestone.findMany({where: {name: task.kind}, orderBy: {id: 'asc'}});
  const awards: MilestoneAward[] = [];
  for (const [index, player] of players.entries()) {
    const rank = index + 1;
    const matches = milestones.filter(m => task.kind === 'CHAMP' || task.kind === 'GRAND_CHAMP' || m.milestone === rank);
    if (matches.length !== 1) throw new Error(`Expected one ${task.kind} milestone for rank ${rank}; found ${matches.length}`);
    const milestone = matches[0];
    const amount = cents(milestone.reward, true) / 100;
    const legacyScope = task.kind === 'WEEK' ? 'reward_top_players_every_week'
      : task.kind === 'YEAR' ? 'reward_top_players_of_the_year'
      : task.kind === 'CHAMP' ? 'reward_champ_of_the_year' : 'reward_grand_champ_of_the_year';
    const legacyKey = task.kind === 'WEEK' ? `${task.rankingKey}:${player.playerId}`
      : task.kind === 'GRAND_CHAMP' ? `${task.year}:${player.playerId}`
      : `${task.scopeId}:${task.mode}:${task.year}:${player.playerId}`;
    awards.push({...player, rank, amount, rewardType: milestone.rewardType, reason: milestone.reason,
      milestoneId: milestone.id, thumbnail: milestone.thumbnail, legacyScope, legacyKey,
      description: `Rewarded ${amount} ${milestone.rewardType} for ${milestone.reason.replace(/_/g, ' ').toLowerCase()} in ${label}.`});
  }
  return {version: 1, label, awards};
}
