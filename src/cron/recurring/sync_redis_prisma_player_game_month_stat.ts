import prisma from '@/db';
import {ensureRewardRanking} from '@/services/v1/games/periodRecovery';
import {gamePeriod} from '@/utils/game-periods';
/** Explicit repair uses period-specific events; monthly totals never populate a week/day. */
export async function run() {
  const period=gamePeriod();
  const categories=await prisma.gameCategory.findMany({include:{game:true}});
  for(const category of categories) for(const mode of category.game.modes) {
    await ensureRewardRanking(category.id,mode,{kind:'month',year:period.year,month:period.month});
    await ensureRewardRanking(category.id,mode,{kind:'week',year:period.weekYear,week:period.week});
    await ensureRewardRanking(category.id,mode,{kind:'today',year:period.year,month:period.month,day:period.day});
  }
}
