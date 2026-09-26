// Resolve path aliases
import 'tsconfig-paths/register';
import prisma from '@/db';
import redisClient from '@/redis';
import { PromisePool } from "@supercharge/promise-pool"
import { getCurrentDataInfo, getExpiryAtUTC, getGameMode, getMonthlyExpiration, getPlayerRedisKeys, getRankingKeys, getRemainingDaysInMonth } from '@/utils';
import { retryExecution } from '@/utils/helpers';
import logger from '@/logger';
import { GameMode } from '@prisma/client';


interface PlayerMonthStat {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  catId: string;
  year: number;
  month: number;
  playerId: string;
  rank: number;
  score: number;
  numPlayed: number;
  mode: GameMode;
  player: {
      id: string;
      username: string;
  };
} 

async function syncPlayerMonthStatToRedis(item: PlayerMonthStat) {
  try {
    const mode = getGameMode(item.mode)
    // current date
    const currDate = new Date().toISOString();
    // get expiration
    const expire = getMonthlyExpiration();
    // get day after week expireAt
    const remainingDays = getRemainingDaysInMonth()
    const expireAt = getExpiryAtUTC( remainingDays + 7 )
    const todayExpireAt = getExpiryAtUTC(1)
    // get ranking keys
    const rankingKeys = getRankingKeys(item.catId, mode)
    // player hash unique keys
    const playerKeys = getPlayerRedisKeys(item.playerId, item.catId, mode)
    // player infor
    const playerInfo = {
      id: item.playerId,
      name: item.player.username,
      createdAt: currDate,
      lastLoggedIn: currDate,
    }
    const score = { score: item.score, numPlayed: item.numPlayed }
    
    await Promise.all([
        // ranking
        redisClient.zAdd(rankingKeys.month, { score: item.score, value: item.playerId }),
        redisClient.zAdd(rankingKeys.week, { score: item.score, value: item.playerId }),
        redisClient.zAdd(rankingKeys.today, { score: item.score, value: item.playerId }),
        // player tracking data
        redisClient.hSet(playerKeys.month, score),
        redisClient.hSet(playerKeys.week, score),
        redisClient.hSet(playerKeys.today, score),
        // player info
        redisClient.hSet(playerKeys.info, playerInfo)
      ])
      await Promise.all([
        // expire ranking keys
        redisClient.expire(rankingKeys.month, expire),
        redisClient.expireAt(rankingKeys.week, expireAt),
        redisClient.expireAt(rankingKeys.today, todayExpireAt),
        // expire player keys
        redisClient.expire(playerKeys.info, expire),
        redisClient.expire(playerKeys.month, expire),
        redisClient.expireAt(playerKeys.week, expireAt),
        redisClient.expireAt(playerKeys.today, todayExpireAt),
      ])
  } catch (error) {
    throw error
  }

}

 const syncUserTxns = async() =>{
      try {
        const stat = getCurrentDataInfo()
        const totalRecords = await prisma.gameMonthStat.count()
        logger.info(`About ${totalRecords} Prisma Player Month Stats Records Found`)
        let skip = 0
        const take = 500
        let counter = 0
        while (skip < totalRecords){
          counter++;
          logger.info(`<<<<Starting Batch ${counter} Records Syncing>>>>`)
          const monthData = await prisma.gameMonthStat.findMany({ where: stat, include: { player: { select: { username: true, id: true  } } }, take, skip, orderBy: [{id: "desc"}] })
          const { errors } = await PromisePool.for(monthData)
            .withConcurrency(250)
            .useCorrespondingResults()
            .process(async (item) => {
              return await syncPlayerMonthStatToRedis(item);
            });
            // check errors and dispatch
          if (errors.length > 0) {
            throw new Error("Error: " + errors?.map(i => i.message).join(", "))
          }
          logger.info(`<<<<Ended Batch ${counter} Records Syncing>>>>`)
          skip+=take
        }
      } catch (error:any) {
        throw error
      }
  }
  

(async () => {
  try {
    logger.info("Executing Prisma Player Month Stats to Redis Job....")
    await retryExecution(syncUserTxns, 3)
    logger.info('Syncing Prisma Player Month Stats to Redis completed.');
    process.exit(0);
  } catch (error) {
    logger.info('Error: Syncing Prisma Player Month Stats to Redis failed after retries.');
    process.exit(0);
  }
} )();