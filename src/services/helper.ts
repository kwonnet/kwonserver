import prisma from "@/db";
import redisClient from "@/redis";
import { GamePlayerInfo } from "@/types";
import { getPlayerRankingKey, getPlayerRedisKeys, getPlayerRewardKeys, parseStringNumbers } from "@/utils";
import { Wallet } from "@prisma/client";


export const getRedisHashKey = async<T = any>(key: string) =>{

    const result = await redisClient.hGetAll(key);
  
    if (Object.values(result).length === 0) return null
    
    return parseStringNumbers(result) as T
}


export const syncRedisUserWalletToPrisma = async(userId: string ) => {
  try{
    // check and sync the sender redis wallet to prisma
    const walletKey = `user:${userId}:wallet`
    const exists = await redisClient.exists(walletKey)
    if(exists !== 0) {
        const redisWallet = await getRedisHashKey<{amount: number, bonus: number, id: string, userId: string, credit: number}>(walletKey)
        if(redisWallet){
            // sync user redis and prisma wallet
            await prisma.wallet.update({ where: { id: redisWallet.id, userId: redisWallet.userId}, data: { credit: redisWallet.credit, amount: redisWallet.amount, bonus: redisWallet.bonus  }})
        }
    }
    return { message: "Success", isError: false}
  }catch(error: any){
    return { message: error?.message, isError: true}
  }
}

export const syncPrismaUserWalletToRedis = async(userId: string, userWallet: Wallet  ) => {
  try{
    // check and sync the sender redis wallet to prisma
    const walletKey = `user:${userId}:wallet`
    const exists = await redisClient.exists(walletKey)
    if(exists !== 0) {
      // check and sync the sender prisma wallet to redis
        await Promise.all([
          redisClient.hSet(walletKey, "credit", userWallet.credit.toFixed(2)),
          redisClient.hSet(walletKey, "amount", userWallet.amount.toFixed(2)),
          redisClient.hSet(walletKey, "bonus", userWallet.bonus.toFixed(2))
        ]);
    }
    return { message: "Success", isError: false}
  }catch(error: any){
    return { message: error?.message, isError: true}
  }
}

export const syncRedisSenderRecipientWalletToPrisma = async(senderId: string, recipientId: string ) => {
  try{
    // check and sync the sender redis wallet to prisma
    const senderWalletKey = `user:${senderId}:wallet`
    const checkSenderKey = await redisClient.exists(senderWalletKey)
    const isSenderExists = checkSenderKey !== 0
    if(isSenderExists) {
        const redisWallet = await getRedisHashKey<{amount: number, bonus: number, id: string, userId: string, credit: number}>(senderWalletKey)
        if(redisWallet){
            // sync user redis and prisma wallet
            await prisma.wallet.update({ where: { id: redisWallet.id, userId: redisWallet.userId}, data: { credit: redisWallet.credit, amount: redisWallet.amount, bonus: redisWallet.bonus  }})
        }
    }
    // check and sync the sender redis wallet to prisma
    const recipientWalletKey = `user:${recipientId}:wallet`
    const checkRecipientKey = await redisClient.exists(recipientWalletKey)
    const isRecipientExists = checkRecipientKey !== 0
    if(isRecipientExists) {
        const redisWallet = await getRedisHashKey<{amount: number, bonus: number, id: string, userId: string, credit: number}>(recipientWalletKey)
        if(redisWallet){
            // sync user redis and prisma wallet
            await prisma.wallet.update({ where: { id: redisWallet.id, userId: redisWallet.userId}, data: { credit: redisWallet.credit, amount: redisWallet.amount, bonus: redisWallet.bonus  }})
        }
    }
    return { message: "Data synced successfully", isError: false, data: { isSenderExists, isRecipientExists }}
  }catch(error: any){
    return { message: error?.message, isError: true}
  }
}

export const syncPrismaSenderRecipientWalletToRedis = async({isSenderExists, senderWallet,  isRecipientExists, recipientWallet}: {isRecipientExists: boolean, isSenderExists: boolean, senderWallet: Wallet, recipientWallet: Wallet }) => {
    try{
      if(isSenderExists){
        // check and sync the sender prisma wallet to redis
        const senderWalletKey = `user:${senderWallet.userId}:wallet`
          await Promise.all([
            redisClient.hSet(senderWalletKey, "credit", senderWallet.credit.toFixed(2)),
            redisClient.hSet(senderWalletKey, "amount", senderWallet.amount.toFixed(2)),
            redisClient.hSet(senderWalletKey, "bonus", senderWallet.bonus.toFixed(2))
          ]);
      }
      if(isRecipientExists){
        // check and sync the recipient prisma wallet to redis
        const recipientWalletKey = `user:${recipientWallet.userId}:wallet`
          await Promise.all([
            redisClient.hSet(recipientWalletKey, "credit", recipientWallet.credit.toFixed(2)),
            redisClient.hSet(recipientWalletKey, "amount", recipientWallet.amount.toFixed(2)),
            redisClient.hSet(recipientWalletKey, "bonus", recipientWallet.bonus.toFixed(2))
          ]);
      }
      
    }catch(error: any){
      console.log("Error: Syncing prisma sender and recipient wallet to redis failed. ", error?.message )
    }
}

// Function to get leaderboard
export const getRewardTopRankingPlayers = async ({ page, limit, catId, rankingKey }: {
  page: number; limit: number; catId: string; rankingKey: string; }, rewardType: "MONTH" | "WEEK" | "DAY") => {
  // Get players from the sorted set leaderboard
  const min = "1000000000000000000";
  const max = "0";
  const offset = (page - 1) * limit;
  const result = await redisClient.zRangeWithScores(rankingKey, min, max, {
    LIMIT: { offset, count: limit },
    BY: "SCORE",
    REV: true,
  });
  // Fetch details and ranks for each player in the room
  const playersData = await Promise.all(
    result.map(async (item) => {
      // player hash unique keys
      const playerKeys = getPlayerRedisKeys(item.value, catId);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      // Get player's rank from the sorted set leaderboard
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player stat
      const keys = getPlayerRewardKeys(item.value, catId);
      const key = rewardType === "MONTH" ? keys.month : rewardType === "WEEK" ? keys.week : keys.day
      const stat = await redisClient.hGetAll(key);
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, item.value);
      // to get the rank of each player without zRevRank, we can use
      // const rank = offset + index + 1
      // provided "limit" will remain constant
      return {
        ...player,
        score: parseInt(stat.score) ?? 0,
        numPlayed: parseInt(stat.numPlayed) ?? 0,
        rank: playerRank !== null ? playerRank + 1 : 0,
      };
    })
  );
  return playersData;
};

// Function to get a category ranking based on MONTH, WEEK or DAY using offset
export const getCategoryRankingPlayerData = async ({ offset, limit, catId, rankingKey }: {
  offset: number; limit: number; catId: string; rankingKey: string; }, type: "MONTH" | "WEEK" | "DAY") => {
  // Get players from the sorted set leaderboard
  const min = "1000000000000000000";
  const max = "0";
  const result = await redisClient.zRangeWithScores(rankingKey, min, max, {
    LIMIT: { offset, count: limit },
    BY: "SCORE",
    REV: true,
  });
  // Fetch details and ranks for each player in the room
  const playersData = await Promise.all(
    result.map(async (item) => {
      // player hash unique keys
      const playerKeys = getPlayerRedisKeys(item.value, catId);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      // Get player's rank from the sorted set leaderboard
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player stat
      const keys = getPlayerRewardKeys(item.value, catId);
      const key = type === "MONTH" ? keys.month : type === "WEEK" ? keys.week : keys.day
      const stat = await redisClient.hGetAll(key);
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, item.value);
      // to get the rank of each player without zRevRank, we can use
      // const rank = offset + index + 1
      // provided "limit" will remain constant
      return {
        ...player,
        score: parseInt(stat.score) ?? 0,
        numPlayed: parseInt(stat.numPlayed) ?? 0,
        rank: playerRank !== null ? playerRank + 1 : 0,
      };
    })
  );
  return playersData;
};

