// Resolve path aliases
import 'tsconfig-paths/register';
import prisma from '@/db';
import pino from 'pino'
import { retryExecution } from '@/utils/helpers';
import redisClient from '@/redis';
import { Prisma, Transaction } from '@prisma/client';
import { PromisePool } from "@supercharge/promise-pool"

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true, // Add colors
      singleLine: false, // Format logs over multiple lines for readability
      translateTime: true, // Show human-readable time
    },
  },
  
})

async function fetchTxnsForSync(playerId: string, limit = 100) {
  const key = `user:${playerId}:transactions`;
  const min = "0";
  const max = "100000000000000000000000";
  const records = await redisClient.zRangeWithScores(key, min, max, {
    LIMIT: { offset: 0, count: limit },
    BY: "SCORE",
  });
  return records.map((item) => ({timestamp: item.score, item: JSON.parse(item.value) as Transaction }))
}


async function syncRedisTxnsToPrisma(playerId: string) {
  const batchSize = 200;
  let counter = 0
  while (true) {
    counter++;
    const txns = await fetchTxnsForSync(playerId, batchSize);
    if (txns.length === 0) break;
    // Start a Redis transaction
    const redisTrxn = redisClient.multi();
    // Update the last synced timestamp
    const lastTimestamp = txns[txns.length - 1].timestamp;
    // Add the Redis operation to the transaction (we'll delete the synced transactions later)
    redisTrxn.zRemRangeByScore(`user:${playerId}:transactions`, 0, lastTimestamp);
    try {
      // Sync records to Prisma
      await prisma.transaction.createMany({
        data: txns.map(({item}) => ({...item, createdAt: new Date(item.createdAt), metadata: item.metadata as Prisma.JsonObject})),
      });
      // If Prisma operation succeeds, execute Redis transaction
      await redisTrxn.exec();
      logger.info(`Batch ${counter} Redis to Prisma txns succeeded`);
    } catch (error: any) {
      // If an error occurs during the Prisma operation, we need to rollback Redis changes
      // Abort the Redis transaction (no changes will be applied)
      redisTrxn.discard();
      // Handle error (e.g., log or notify)
      logger.error(`Error: Batch ${counter} Redis to Prisma syncing txns failed.`, error?.message);
      // Optionally, throw or return if you need to handle the error at a higher level
      throw new Error('Error: Syncing Redis and Prisma data failed');
    }

  }
}


 const syncUserTxns = async() =>{
      try {
        const userKeys = await redisClient.keys("user:*:transactions");
        const { results, errors } = await PromisePool.for(userKeys)
          .withConcurrency(1000)
          .useCorrespondingResults()
          .process(async (key:string) => {
            const playerId = key.split(":")[1];
            return await syncRedisTxnsToPrisma(playerId);
          });
          // check errors and dispatch
        if (errors.length > 0) {
          throw new Error("Error: " + errors?.map(i => i.message).join(", "))
        }
        return results
      } catch (error:any) {
        throw error
      }
  }

(async () => {
  try {
    await retryExecution(syncUserTxns, 3)
    logger.info('Syncing Redis txns to Prisma completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.info('Error: Syncing Redis txns to Prisma failed after retries.');
    process.exit(1);
  }
} )();