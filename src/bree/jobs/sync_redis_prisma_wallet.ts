// Resolve path aliases
import 'tsconfig-paths/register';
import pino from 'pino'
import { retryExecution } from '@/utils/helpers';
import redisClient from '@/redis';
import { PromisePool } from "@supercharge/promise-pool"
import prisma from '@/db';
import { isDateMinuteElapsed } from '@/utils';

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



async function syncUserRedisWalletToPrisma(playerId: string) {
  try {
    const walletKey = `user:${playerId}:wallet`;
    // get user wallet
    const result = await redisClient.hGetAll(walletKey);
    // check if wallet is null
    if(Object.keys(result).length === 0) return
    // update object
    const wallet = {
      bonus: parseFloat(result.bonus || "0"),
      amount: parseFloat(result.amount || "0"),
      credit: parseFloat(result.credit || "0"),
    };
    // perform prisma update
    await prisma.wallet.update({ where: { id: result.id, userId: result.userId}, data: wallet})
    // check if user session is inactive for more than 4 minutes and remove this wallet
    const sessionKey = `user:${playerId}:session`;
    const date = await redisClient.get(sessionKey)
    if(!date) return 
    const isExpired = isDateMinuteElapsed(date, 4)
    if(isExpired){
      await Promise.all([redisClient.del(sessionKey), redisClient.del(walletKey)])
    }
  } catch (error) {
    throw error
  }

}


 const syncUserTxns = async() =>{
      try {
        const playerKeys = await redisClient.keys("user:*:wallet");
        const { results, errors } = await PromisePool.for(playerKeys)
          .withConcurrency(1000)
          .useCorrespondingResults()
          .process(async (key:string) => {
            const playerId = key.split(":")[1];
            return await syncUserRedisWalletToPrisma(playerId);
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
    logger.info('Syncing Redis Wallet to Prisma completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.info('Error: Syncing Wallet txns to Prisma failed after retries.');
    process.exit(1);
  }
} )();