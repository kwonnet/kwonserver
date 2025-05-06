// Resolve path aliases
import "tsconfig-paths/register";
import { formatNumberWithCommas, retryExecution } from "@/utils/helpers";
import redisClient from "@/redis";
import { PromisePool } from "@supercharge/promise-pool";
import prisma from "@/db";
import { getRankingRewardKeys, getSpentCoinsKey } from "@/utils";
import logger from "@/logger";
import { getCategoryRankingPlayerData } from "@/services/helper";

async function clearMonthStatsKeys(keys: {rewardMonth: string, spentCoins: string, stat: string}) {
  try {
    // clear monthly game data stats redis keys
    await Promise.all(Object.values(keys).map(val => redisClient.del(val) ))
    logger.info('Cleared game month stats redis keys successfuly');
  } catch (error: any) {
    logger.info('Error: Clearing game month stats redis keys failed.', error?.message);
  }
}

async function clearRedisKeysByPattern(pattern: string){
  try {
    // clear players stats redis keys
    let cursor = 0; // Initial cursor
    let keyCounts = 0
    
    do {
        // Use SCAN to fetch a batch of keys
        const {cursor: newCursor, keys} = await redisClient.scan(cursor, { COUNT: 50000, MATCH: pattern});
        cursor = newCursor;
        keyCounts+=keys.length
        logger.info(`cursor: ${cursor}`);
        logger.info(`First key : ${keys[0]}`);
        logger.info(`Found ${keys.length} keys in this batch`);
        if (keys.length > 0) {
            await Promise.all(keys.map((key) => redisClient.del(key)))
            logger.info(`Deleted ${keys.length} keys in this batch`);
        }
    } while (cursor !== 0); // SCAN stops when cursor is back to '0'

    logger.info(`All matching ${formatNumberWithCommas(keyCounts)} keys have been deleted.`);
  } catch (error: any) {
    logger.info('Error: Deleting players month stats failed.', error?.message);
  }
}


const syncMonthlyPlayerStats = async ({gameId, catId}:{gameId: string, catId: string}) => {
  try {
    // get reward ranking keys
    const keys = getRankingRewardKeys(catId);
    // check if exists
    const exists = await redisClient.exists(keys.rewardMonth);
    if (!exists) return;
    // get all participants count
    const participantCount = await redisClient.zCard(keys.rewardMonth);
    logger.info(`Total category participants: ${participantCount}`)
    const batchSize = 1000;
    let page = 1;
    let totalFetched = 0
    while (totalFetched < participantCount) {
      const offset = ((page - 1) * batchSize)
      const size = participantCount - totalFetched
      const limit = size <  batchSize ? size : batchSize
      const participants = await getCategoryRankingPlayerData(
        {
          offset,
          limit,
          catId,
          rankingKey: keys.rewardMonth,
        },
        "MONTH"
      );
      // if no participants, break out of the loop
      if (participants.length === 0) break;
      const data = participants.map((player) => {
          return { 
            catId, 
            playerId: player.id, 
            rank: player.rank, 
            score: player.score, 
            numPlayed: player.numPlayed,
            year: keys.dateInfo.year,
            month: keys.dateInfo.month
          }
      })
      // create prisma data
      await prisma.gameMonthStat.createMany({ data, skipDuplicates: true });
      logger.info(`Batch ${page} monthly game players stats  synced successfully.`);
      page++;
      totalFetched += participants.length;
    }
    // clear month game data, month stat & spentCoins
    await clearMonthStatsKeys({ 
      rewardMonth: keys.rewardMonth, 
      stat: keys.rewardMonthStat,
      spentCoins: getSpentCoinsKey({ catId, gameId, dateInfo: { year: keys.dateInfo.year, month: keys.dateInfo.month}})
    })
    // clear players stats
    await clearRedisKeysByPattern(`player:*:category:${catId}:${keys.dateInfo.year}:${keys.dateInfo.month}:month:${keys.dateInfo.month}`)
    // clear players info at the end of the year
    await clearRedisKeysByPattern(`player:*:category:${catId}:${keys.dateInfo.year}`)
    // update game reward stats
    logger.info(`Monthly game players stats synced successfully.`);
  } catch (error: any) {
    logger.error(`Error rewarding monthly players: ${error.message}`);
    throw error;
  }
};

const syncMonthlyPlayersData = async () => {
  try {
    // get all categories
    const categories = await prisma.gameCategory.findMany({});

    if (categories.length === 0)
      throw new Error("No game categories available");

    const { results, errors } = await PromisePool.for(categories)
      .withConcurrency(2)
      .process(async ({ id: catId, gameId }) => {
        await syncMonthlyPlayerStats({catId, gameId});
      });

    if (errors.length > 0) {
      logger.error(
        `Errors during rewards processing: ${errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    return results;
  } catch (error: any) {
    logger.error(`Error rewarding players: ${error.message}`);
    throw error;
  }
};

(async () => {
  try {
    await retryExecution(syncMonthlyPlayersData, 3);
    logger.info("Syncing Redis To Prisma Mothly Game Category stats completed successfully.");
    process.exit(0);
  } catch (error) {
    logger.info("Error: Syncing Redis To Prisma Mothly Game Category stats failed after retries.");
    process.exit(1);
  }
})();

