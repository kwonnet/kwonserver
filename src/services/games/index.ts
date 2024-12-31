import { Server, Socket } from "socket.io";
import redisClient from "@/redis";
import {
  GameEventEnum,
  GameRoomPlayer,
  GameStatusEnum,
  ThemedGameAnswer,
  ThemedGameScore,
  ThemedGameQuestion,
  ThemedGameScoreStat,
  TempGameRoom,
  GamePlayerInfo,
  GameActionEnum,
  PlayerGameEnergy,
} from "@/types";
import {
  composeMessage,
  extractCatId,
  generateUniqueRef,
  getCurrentMonthAndYear,
  getExpiryAtUTC,
  getMonthlyExpiration,
  getPlayerRankingKey,
  getPlayerRedisKeys,
  getRandomNumber,
  getRankingKeys,
  getRankingRewardKeys,
  getRemainingDaysInMonth,
  getSpentCoinsKey,
  getUserRedisKeys,
  isDateHourElapsed,
  isDateMinuteElapsed,
  parseStringNumbers,
} from "@/utils";
import prisma from "@/db";
import {
  GameEnergy,
  RewardTypeEnum,
  Transaction,
  TxnCategoryEnum,
  TxnCurrencyEnum,
  TxnGatewayEnum,
  TxnSourceEnum,
  TxnStatusEnum,
  TxnTypeEnum,
  Wallet,
} from "@prisma/client";
import logger from "@/logger";
import { generateXAiQuestion } from "@/utils/ai";
import {
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "../helper";
import { faker } from "@faker-js/faker";

export const getRedisHashKey = async <T = any>(key: string) => {
  const result = await redisClient.hGetAll(key);

  if (Object.values(result).length === 0) return null;

  return parseStringNumbers(result) as T;
};

export async function deductGameCoins(params: {
  catId: string;
  roomId: string;
  gameId: string;
  qId?: string | number;
  playerId: string;
  action: GameActionEnum;
  [key: string]: any;
}) {
  const actionStat = {
    [GameActionEnum.CHAT]: { min: 0.5, max: 1 },
    [GameActionEnum.ANSWER]: { min: 1, max: 2 },
  };

  try {
    // Generate a random deduction between 2 and 5
    const highDeduction = getRandomNumber(2, 5);
    // Determine if bonus can handle the high deduction
    const rate = actionStat[params.action];
    const deduction = highDeduction; // Assume high deduction is attempted
    const defaultDeduction = getRandomNumber(rate.min, rate.max); // Fallback to default range

    const useKeys = getUserRedisKeys(params.playerId);

    // Fetch player balance from Redis
    const wallet = await getRedisHashKey<{
      bonus: number;
      amount: number;
      id: string;
    }>(useKeys.wallet);

    console.log("deduction wallet: ", wallet);

    if (!wallet) {
      return {
        message: "Player wallet not found in Redis",
        isError: true,
      };
    }

    console.log(deduction, "deduction");
    console.log(wallet, "Player wallet");

    let { amount, bonus } = wallet;

    const balance = parseFloat((bonus + amount).toFixed(2));

    console.log("coin balance", balance);

    // Check if deduction exceeds balance
    if (deduction > balance) {
      throw new Error(
        "Insufficient balance, please buy new coins to continue playing!"
      );
    }

    // Determine final deduction amount
    const finalDeduction =
      bonus >= highDeduction ? highDeduction : defaultDeduction;

    let remainingDeduction = finalDeduction;

    let deductedBonus = 0;
    let deductedCoins = 0;

    // Deduct from bonus first
    if (bonus > 0) {
      const bonusDeduction = Math.min(bonus, remainingDeduction);
      deductedBonus = bonusDeduction;
      bonus -= bonusDeduction;
      remainingDeduction -= bonusDeduction;
    }

    // Deduct from amount if bonus is insufficient
    if (remainingDeduction > 0) {
      if (amount < remainingDeduction) {
        throw new Error("Insufficient balance");
      }
      deductedCoins = remainingDeduction;
      amount -= remainingDeduction;
    }

    // Transaction log

    const timestamp = Date.now();
    const record: Partial<
      Omit<Transaction, "createdAt"> & { createdAt: string }
    > = {
      userId: params.playerId,
      amount: finalDeduction,
      source: !wallet.bonus
        ? TxnSourceEnum.COINS
        : remainingDeduction > 0
        ? TxnSourceEnum.COINS_BONUS
        : TxnSourceEnum.BONUS,
      metadata: params,
      createdAt: new Date().toISOString(),
      type: TxnTypeEnum.DEBIT,
      description:
        params.action === GameActionEnum.CHAT
          ? "Deducted for in-game chat"
          : "Deducted for game play",
      category: TxnCategoryEnum.GAME_DEDUCTION,
      gateway: TxnGatewayEnum.WALLET,
      senderId: params.playerId,
      currency: TxnCurrencyEnum.COINS,
      status: TxnStatusEnum.COMPLETED,
      txnRef: generateUniqueRef(),
      walletId: wallet.id,
    };

    // Update Redis
    await Promise.all([
      redisClient.hSet(useKeys.wallet, "bonus", bonus.toFixed(2)),
      redisClient.hSet(useKeys.wallet, "amount", amount.toFixed(2)),
      redisClient.zAdd(useKeys.txn, {
        score: timestamp,
        value: JSON.stringify(record),
      }),
    ]);

    // update monthly spent - track monthly spent coins
    updateMonthlySpentCoins({
      gameId: params.gameId,
      catId: params.catId,
      bonus: parseFloat(deductedBonus.toFixed(2)),
      coins: parseFloat(deductedCoins.toFixed(2)),
    });

    return {
      message: "success",
      isError: false,
      data: {
        amount: parseFloat(amount.toFixed(2)),
        bonus: parseFloat(bonus.toFixed(2)),
        deductedBonus: parseFloat(deductedBonus.toFixed(2)),
        deductedCoins: parseFloat(deductedCoins.toFixed(2)),
      },
    };
  } catch (error: any) {
    return { message: `Error: ${error?.message} `, isError: true, data: null };
  }
}

// export async function deductGameCoins(params: {
//   catId: string;
//   roomId: string;
//   qId?: string | number;
//   playerId: string;
//   action: GameActionEnum;
//   [key: string]: any;
// }) {
//   const actionStat = {
//     [GameActionEnum.CHAT]: { min: 0.5, max: 1 },
//     [GameActionEnum.ANSWER]: { min: 1, max: 2 },
//   };
//   try {
//     const rate = actionStat[params.action];
//     // get deduction
//     const deduction = getRandomNumber(rate.min, rate.max);

//     const useKeys = getUserRedisKeys(params.playerId);

//     // Fetch player balance from Redis

//     const wallet = await getRedisHashKey<{ bonus: number; amount: number }>(
//       useKeys.wallet
//     );

//     if (!wallet)
//       return {
//         message: "Player wallet not found in Redis",
//         isError: true,
//       };
//     console.log(deduction, "deduction");

//     console.log(wallet, "Player wallet");

//     let { amount, bonus } = wallet;

//     const balance = parseFloat((bonus + amount).toFixed(2));

//     console.log("coin balance", balance);

//     if (deduction > balance) {
//       throw new Error(
//         "Insufficient balance, please buy new coins to continue playing!"
//       );
//     }

//     let remainingDeduction = deduction;

//     // Deduct from bonus first if available 2, 2.4
//     if (bonus > 0) {
//       const bonusDeduction = Math.min(bonus, remainingDeduction);
//       bonus -= bonusDeduction;
//       remainingDeduction -= bonusDeduction;
//     }

//     // Deduct from amount if bonus is insufficient
//     if (remainingDeduction > 0) {
//       if (amount < remainingDeduction) {
//         throw new Error("Insufficient balance");
//       }
//       amount -= remainingDeduction;
//     }
//     // transaction log
//     const timestamp = Date.now();
//     const record = {
//       userId: params.playerId,
//       amount: deduction,
//       source: !wallet.bonus
//         ? TxnSourceEnum.COINS
//         : remainingDeduction > 0
//         ? TxnSourceEnum.COINS_BONUS
//         : TxnSourceEnum.BONUS,
//       metadata: params,
//       createdAt: new Date().toISOString(),
//       type: TxnTypeEnum.DEBIT,
//       description:
//         params.action === GameActionEnum.CHAT
//           ? "Deducted for in-game chat"
//           : "Deducted for game play",
//       category: TxnCategoryEnum.GAME_DEDUCTION,
//       gateway: TxnGatewayEnum.WALLET,
//     };
//     await Promise.all([
//       redisClient.hSet(useKeys.wallet, "bonus", bonus.toFixed(2)),
//       redisClient.hSet(useKeys.wallet, "amount", amount.toFixed(2)),
//       redisClient.zAdd(useKeys.txn, {
//         score: timestamp,
//         value: JSON.stringify(record),
//       }),
//     ]);

//     // update monthly spent
//     updateMonthlySpentCoins({catId: params.catId, })

//     return {
//       message: "success",
//       isError: false,
//       data: {
//         amount: parseFloat(amount.toFixed(2)),
//         bonus: parseFloat(bonus.toFixed(2)),
//       },
//     };
//   } catch (error: any) {
//     return { message: `Error: ${error?.message} `, isError: true, data: null };
//   }
// }

export const getUserWallet = async (userId: string) => {
  try {
    return await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  } catch (error) {
    return null;
  }
};

export const getUserData = async (userId: string, catId: string) => {
  try {
    const result = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallet: true, gameEnergies: { where: { catId } } },
    });
    if (!result.wallet || !result.gameEnergies) return null;
    return { wallet: result.wallet, energy: result.gameEnergies[0] };
  } catch (error) {
    return null;
  }
};

export const checkUserGameEnergy = async (userId: string, catId: string) => {
  try {
    const playerKeys = getPlayerRedisKeys(userId, catId);
    // check redis
    const energy = await getRedisHashKey<GameEnergy>(playerKeys.energy);

    if (energy) {
      console.log("Join room - player energy - redis ", energy);
      return energy;
    }
    // check prisma
    const result = await prisma.gameEnergy.findFirst({
      where: { playerId: userId, catId },
    });
    if (result) {
      console.log("Join room - player energy - prisma ", result);
      return result;
    }
    // create energy
    const gameEnergy = await prisma.gameEnergy.create({
      data: { amount: 2500, gauge: 50, turbo: 50, playerId: userId, catId },
    });
    console.log("Join room - player energy - created ", gameEnergy);
    return gameEnergy;
  } catch (error) {
    return null;
  }
};

export const checkUserGameWallet = async (userId: string) => {
  try {
    const userKeys = getUserRedisKeys(userId);

    const wallet = await getRedisHashKey<Wallet>(userKeys.wallet);

    if (wallet) {
      // check balance
      const balance = wallet.amount + wallet.bonus;
      console.log("Join room - player wallet - redis ", wallet);
      const isError = balance < 10;
      return {
        message: isError
          ? "Insufficient coins, please buy coins to continue playing!"
          : "success",
        isError,
        data: isError ? null : wallet,
      };
    }
    // try prisma wallet
    const result2 = await getUserWallet(userId);
    if (!result2) {
      return { message: "User wallet not found", isError: true, data: null };
    }
    console.log("Join room - player wallet - prisma ", result2);
    // check balance
    const balance = result2.amount + result2.bonus;
    const isError = balance < 10;
    return {
      message: isError
        ? "Insufficient coins, please buy coins to continue playing!"
        : "success",
      isError,
      data: result2,
    };
  } catch (error) {
    return {
      message: "Unknown error occurred, please try again later",
      isError: true,
      data: null,
    };
  }
};

async function syncUserRedisGameEnergyToPrisma(
  playerId: string,
  catId: string
) {
  try {
    const playerKeys = getPlayerRedisKeys(playerId, catId);
    const result = await getRedisHashKey<GameEnergy>(playerKeys.energy);
    if (!result) return;
    // perform prisma update
    console.log("Player Energy ",result)
    await prisma.gameEnergy.update({
      where: { id: result.id },
      data: { amount: result.amount < 0 ? 2200 : result.amount , gauge: result.gauge < 0 ? 10 : result.gauge, turbo: result.turbo < 0 ? 10 : result.turbo},
    });
    // delete redis key
    await redisClient.del(playerKeys.energy);
    console.log("User redis game energy synced to prisma successfully >>>");
  } catch (error) {
    throw error;
  }
}

export async function syncUserRedisWalletToPrisma(userId: string) {
  try {
    const userKeys = getUserRedisKeys(userId);
    const result = await getRedisHashKey<Wallet>(userKeys.wallet);
    if (!result) return;
    // perform prisma update
    await prisma.wallet.update({
      where: { id: result.id },
      data: {
        amount: result.amount,
        bonus: result.bonus,
        credit: result.credit,
      },
    });
    // check if user session is inactive for more than four minutes and remove this wallet
    const date = await redisClient.get(userKeys.session);
    if (!date) return;
    // const isExpired = isDateHourElapsed(date, 1)
    const isExpired = isDateMinuteElapsed(date, 4);
    if (isExpired) {
      await Promise.all([
        redisClient.del(userKeys.session),
        redisClient.del(userKeys.wallet),
      ]);
    }
    console.log("User redis wallet synced to prisma successfully >>>");
  } catch (error) {
    throw error;
  }
}

export const updateGameRoomParticipants = async (
  roomId: string,
  isIncr: boolean = true
) => {
  try {
    const key = `room:${roomId}:participants`;
    if (isIncr) {
      const [count] = await Promise.all([
        redisClient.incr(key),
        redisClient.expire(key, 3600),
      ]);
      return count;
    }
    const [count] = await Promise.all([
      redisClient.decr(key),
      redisClient.expire(key, 3600),
    ]);
    return count;
  } catch (error) {
    return 0;
  }
};

export const storeGameRoomQuestion = async (
  roomId: string,
  params: ThemedGameQuestion
) => {
  try {
    const uniqueKey = `room:${roomId}:question`;
    await redisClient.set(uniqueKey, JSON.stringify(params));
    return params as unknown as ThemedGameQuestion;
  } catch (error) {
    return null;
  }
};
export const retrieveGameRoomQuestion = async (roomId: string) => {
  try {
    const uniqueKey = `room:${roomId}:question`;
    const result = await redisClient.get(uniqueKey);
    if (!result) return null;
    return JSON.parse(result) as ThemedGameQuestion;
  } catch (error) {
    return null;
  }
};

// Function to save or update a user's answer for a question
export async function saveGameRoomPlayerAnswer(params: ThemedGameAnswer) {
  const uniqueKey = `room:${params.roomId}:answers`;
  // Save or update the user's answer in the hash
  await redisClient.hSet(uniqueKey, params.playerId, JSON.stringify(params));
  return params;
}

// Function to retrieve all answers for a question in a game room
export async function retrieveGameRoomAnswers(roomId: string) {
  const questionKey = `room:${roomId}:answers`;
  // Retrieve all user answers for the question
  const result = await redisClient.hGetAll(questionKey);
  if (Object.keys(result).length === 0) {
    return [];
  }
  return Object.values(result).map(
    (item) => JSON.parse(item) as ThemedGameAnswer
  );
}

export const deleteGameRoomQuestionAndAnswers = async (roomId: string) => {
  try {
    await Promise.all([
      redisClient.del(`room:${roomId}:question`),
      redisClient.del(`room:${roomId}:answers`),
    ]);
  } catch (error) {}
};

// Function to retrieve all answers, check correctness, and assign points
export async function calculateGameRoomPoints(
  roomId: string,
  roomAnswers: ThemedGameAnswer[]
) {
  const question = await retrieveGameRoomQuestion(roomId);
  // delete game question & user answers
  deleteGameRoomQuestionAndAnswers(roomId);
  if (!question) return [];
  const totalAnswers = roomAnswers.length;
  return roomAnswers
    .map((item) => {
      const isCorrect = item.choice === question.answer;
      return {
        ...item,
        score: isCorrect ? item?.timer * totalAnswers : 0,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// const getRedisKeys = async() => {
//   const playerKeys = await redisClient.keys("player:*:category:*");
//   console.log(playerKeys.length)
// }

// getRedisKeys()

export const addGameRoomPlayer = async (params: GameRoomPlayer) => {
  try {
    // current date
    const currDate = new Date().toISOString();
    // get expiration
    const expire = getMonthlyExpiration();
    // get day after week expireAt
    const remainingDays = getRemainingDaysInMonth();
    const expireAt = getExpiryAtUTC(remainingDays < 7 ? remainingDays + 1 : 8);
    const todayExpireAt = getExpiryAtUTC(1);
    // get user keys
    const userKeys = getUserRedisKeys(params.playerId);
    // get ranking keys
    const rankingKeys = getRankingKeys(params.catId);
    // player hash unique keys
    const playerKeys = getPlayerRedisKeys(params.playerId, params.catId);
    // player infor
    const playerInfo = {
      id: params.playerId,
      name: params.name,
      createdAt: currDate,
      lastLoggedIn: currDate,
    };
    // check user wallet balance
    const result = await checkUserGameWallet(params.playerId);
    if (!result.data) {
      return { message: result.message, data: null };
    }
    const wallet = result.data;
    // check game energy
    const energy = await checkUserGameEnergy(params.playerId, params.catId);
    if (!energy) return { message: "Error: User info not found!", data: null };
    // check player key exists in the players hashes
    const exists = await redisClient.exists(playerKeys.info);
    // if not exists, add to player hash and leaderboard
    if (!exists) {
      const score = { score: 0, numPlayed: 0 };
      // add player to sorted set leaderboard and player's details hashes
      await Promise.all([
        // ranking
        redisClient.zAdd(rankingKeys.month, {
          score: 0,
          value: params.playerId,
        }),
        redisClient.zAdd(rankingKeys.week, {
          score: 0,
          value: params.playerId,
        }),
        redisClient.zAdd(rankingKeys.today, {
          score: 0,
          value: params.playerId,
        }),
        // track user session
        redisClient.set(userKeys.session, currDate),
        // player info
        redisClient.hSet(playerKeys.info, playerInfo),
        // player tracking data
        redisClient.hSet(playerKeys.month, score),
        redisClient.hSet(playerKeys.week, score),
        redisClient.hSet(playerKeys.today, score),
        // temp room keys
        redisClient.hSet(`room:${params.playerId}:player`, { ...params }),
        redisClient.sAdd(`room:${params.roomId}:players`, params.playerId),
        // expire ranking keys
        redisClient.expire(rankingKeys.month, expire),
        redisClient.expireAt(rankingKeys.week, expireAt),
        redisClient.expireAt(rankingKeys.today, todayExpireAt),
        // expire player keys
        redisClient.expire(playerKeys.info, expire),
        redisClient.expire(playerKeys.month, expire),
        redisClient.expireAt(playerKeys.week, expireAt),
        redisClient.expireAt(playerKeys.today, todayExpireAt),
      ]);
    } else {
      // update last login date, save player details in the hash & save the player id to the room players set
      await Promise.all([
        // update user session
        redisClient.set(userKeys.session, currDate),
        // update user details on join game
        redisClient.hSet(playerKeys.info, "lastLoggedIn", currDate),
        redisClient.hSet(playerKeys.info, "name", params.name),
        // update current room data
        redisClient.hSet(`room:${params.playerId}:player`, { ...params }),
        redisClient.sAdd(`room:${params.roomId}:players`, params.playerId),
      ]);
    }
    // check user wallet
    const isWalletExists = await redisClient.exists(userKeys.wallet);
    if (!isWalletExists) {
      redisClient.hSet(userKeys.wallet, {
        id: wallet.id,
        amount: wallet.amount,
        credit: wallet.credit,
        bonus: wallet.bonus,
        userId: wallet.userId,
      });
    }
    // check user energy
    const isPowerExists = await redisClient.exists(playerKeys.energy);
    if (!isPowerExists) {
      redisClient.hSet(playerKeys.energy, {
        id: energy.id,
        amount: energy.amount,
        gauge: energy.gauge,
        turbo: energy.turbo,
        playerId: energy.playerId,
        catId: energy.catId,
      });
    }
    return { data: { energy, wallet }, message: "success" };
  } catch (error: any) {
    logger.info(error?.message);
    return { data: null, message: "Error occured, please try again later" };
  }
};

// Function to update player game category session
export const updatePlayerSession = async (params: {
  playerId: string;
  catId: string;
}) => {
  // current date
  const currDate = new Date().toISOString();
  // player hash unique keys
  const playerKeys = getPlayerRedisKeys(params.playerId, params.catId);
  // update user session on the game category - this is to track their last played date
  redisClient.hSet(playerKeys.info, "lastLoggedIn", currDate);
  // update user session
  const userKeys = getUserRedisKeys(params.playerId);
  redisClient.set(userKeys.session, currDate);
};

// Function to get the total number of players in a room
export const getTotalRoomPlayers = async (roomId: string) => {
  const roomKey = `room:${roomId}:players`;
  const totalPlayers = await redisClient.sCard(roomKey);
  return totalPlayers;
};

export async function getGameRoomPlayers(roomId: string) {
  try {
    // Get all player IDs in the room set
    const playerIds = await redisClient.sMembers(`room:${roomId}:players`);
    // Fetch details for each player
    const players = await Promise.all(
      playerIds.map(async (id) => {
        return await redisClient.hGetAll(`room:${id}:player`);
      })
    );
    return players as unknown as GameRoomPlayer[];
  } catch (error) {
    return [];
  }
}
// Function to get players in a room with their rank and details
export const getGameRoomPlayersWithRank = async (
  roomId: string,
  catId: string
) => {
  // get ranking keys and retrieve the over monthly data of the room player
  const rankingKeys = getRankingKeys(catId);
  // room players key
  const roomPlayersKey = `room:${roomId}:players`;
  // Retrieve the list of player IDs in the room
  const playerIds = await redisClient.sMembers(roomPlayersKey);
  // Fetch details and ranks for each player in the room
  const playersData = await Promise.all(
    playerIds.map(async (playerId) => {
      // player hash unique keys
      const playerKeys = getPlayerRedisKeys(playerId, catId);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(
        rankingKeys.month,
        playerId
      );
      // Get player month data
      const monthStat = await redisClient.hGetAll(playerKeys.month);
      return {
        ...player,
        score: parseInt(monthStat.score) ?? 0,
        numPlayed: parseInt(monthStat.numPlayed) ?? 0,
        rank: playerRank !== null ? playerRank + 1 : 0, // Convert to 1-based rank
      };
    })
  );

  return playersData;
};

// Function to get leaderboard
export const getCountGamePlayers = async (catId: string) => {
  // get ranking keys
  const rankingKeys = getRankingKeys(catId);
  const [monthTotalPlayers, weekTotalPlayers, todayTotalPlayers] =
    await Promise.all([
      redisClient.zCard(rankingKeys.month),
      redisClient.zCard(rankingKeys.week),
      redisClient.zCard(rankingKeys.today),
    ]);
  return { monthTotalPlayers, weekTotalPlayers, todayTotalPlayers };
};

export const getRankingKey = (ranking: string, catId: string) => {
  // get ranking keys
  const rankingKeys = getRankingKeys(catId);
  if (ranking === "today") {
    return rankingKeys.today;
  }
  if (ranking === "week") {
    return rankingKeys.week;
  }
  return rankingKeys.month;
};

// Function to get leaderboard
export const getGameLeaderboard = async ({
  page,
  limit,
  catId,
  ranking,
}: {
  page: number;
  limit: number;
  catId: string;
  ranking: string;
}) => {
  const rankingKey = getRankingKey(ranking, catId);
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
      const key = getPlayerRankingKey({ ranking, playerId: item.value, catId });
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

export async function removeGameRoomPlayer(roomId: string, playerId: string) {
  try {
    // Remove player from the room set & delete player details as no longer needed
    await Promise.all([
      redisClient.sRem(`room:${roomId}:players`, playerId),
      redisClient.del(`room:${playerId}:player`),
    ]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function cleanUpGameRoom(roomId: string) {
  try {
    logger.info("cleaning up game room ", roomId);
    const keys = [
      `room:${roomId}`,
      `room:${roomId}:players`,
      `room:${roomId}:answers`,
      `room:${roomId}:question`,
      `room:${roomId}:participants`,
      `room:${roomId}:streak`,
    ];
    await Promise.all(keys.map((key) => redisClient.del(key)));
  } catch (error: any) {
    logger.error(error?.message);
  }
}

export const getGameRoomPlayer = async (playerId: string) => {
  try {
    const userKey = `room:${playerId}:player`; // Unique key for each user
    const user = await redisClient.hGetAll(userKey);
    if (Object.keys(user).length === 0) {
      return null;
    }
    return user as unknown as GameRoomPlayer;
  } catch (error) {
    return null;
  }
};

export const disconnectGameRoomPlayer = async (socket: Socket, io: Server) => {
  try {
    logger.info(
      "Disconnecting player...",
      socket.data.user,
      "from room ",
      socket.data.room
    );
    const user = socket.data.user;
    const room = socket.data.room;
    if (!room || !user) return;
    // check if game room player exists
    const player = getGameRoomPlayer(socket.data.user.id);
    if (!player) return;
    // broadcasting to the room that a player has left
    socket.broadcast.in(room.id).emit(
      GameEventEnum.MESSAGE,
      composeMessage({
        playerName: "SWEN",
        content: `${user.name}, has left!`,
      })
    );
    // update room participants
    const currentPlayers = await updateGameRoomParticipants(room.id, false);
    io.emit(GameEventEnum.GAME_ROOM_PARTICIPANTS, {
      roomId: room.id,
      count: currentPlayers,
    });
    // remove player from game room
    await removeGameRoomPlayer(room.id, user.id);
    // broadcast the players present in the room
    const players = await getGameRoomPlayersWithRank(room.id, room.catId);
    if (players.length === 0) {
      await cleanUpGameRoom(room.id);
    }
    socket.broadcast.in(room.id).emit(GameEventEnum.GAME_ROOM_PLAYERS, players);
    // sync redis user game energy to prisma
    syncUserRedisGameEnergyToPrisma(user.id, room.catId);
    // sync redis user wallet to prisma
    syncUserRedisWalletToPrisma(user.id);
    // remove user from all rooms
    for (const r of socket.rooms) {
      socket.leave(r);
    }
    // disconnect the socket
    // socket.disconnect();
  } catch (error) {}
};

export const getGameRoom = async (roomId: string) => {
  try {
    const uniqueKey = `room:${roomId}`; // Unique key for each user
    const result = await redisClient.hGetAll(uniqueKey);
    if (Object.keys(result).length === 0) {
      return null;
    }
    return result as unknown as TempGameRoom;
  } catch (error) {
    return null;
  }
};

function convertKeysToJSONKeys(
  arr: Record<string, any>[]
): Record<string, any>[] {
  return arr.map((item) => {
    const newItem: Record<string, any> = {};

    for (const [key, value] of Object.entries(item)) {
      // Replace invalid characters or normalize keys
      const jsonKey = key
        .replace(/\s+/g, "_") // Replace spaces with underscores
        .replace(/[^a-zA-Z0-9_]/g, ""); // Remove invalid JSON key characters

      newItem[jsonKey] = value;
    }

    return newItem;
  });
}

async function updateMonthlySpentCoins(params: {
  gameId: string;
  catId: string;
  coins: number;
  bonus: number;
}) {
  try {
    const spentKey = getSpentCoinsKey(params);
    // check exists
    const exists = await redisClient.exists(spentKey);
    if (exists === 0) {
      await redisClient.hSet(spentKey, {
        coins: params.coins,
        bonus: params.bonus,
        gameId: params.gameId,
        catId: params.catId,
      });
    } else {
      await Promise.all([
        redisClient.hIncrByFloat(spentKey, "coins", params.coins),
        redisClient.hIncrByFloat(spentKey, "bonus", params.bonus),
      ]);
    }
  } catch (error) {}
}

async function updateWinningStreak(
  {
    catId,
    roomId,
    playerId,
  }: {
    catId: string;
    roomId: string;
    playerId: string;
  },
  io: Server
): Promise<void> {
  try {
    const streakKey = `room:${roomId}:streak`;

    // Get the current leader and their streak
    const currentLeader = await getRedisHashKey<{
      playerId: string;
      catId: string;
      streak: number;
    }>(streakKey);

    if (currentLeader && currentLeader.playerId === playerId) {
      // Increment the current leader's streak
      const newStreak = await redisClient.hIncrBy(streakKey, "streak", 1);
      // check if the new streak is ready for reward
      if (newStreak > 4) {
        const [gameMilestones, category] = await prisma.$transaction([
          prisma.gameMilestone.findMany({ where: { name: "ROOM_STREAK" } }),
          prisma.gameCategory.findFirst({ where: { id: catId } }),
        ]);
        // [5, 10, 25, 50, 100];
        const milestones = gameMilestones.map((item) => item.milestone);
        // Check for milestone
        if (milestones.includes(newStreak)) {
          // Trigger reward logic here
          const milestone = gameMilestones.find(
            (item) => item.milestone === newStreak
          );
          // check if they exist
          if (!milestone || !category) return;
          // check if user already won the reward under this category
          const existingAchievement = await prisma.gameAchievement.findFirst({
            where: { playerId, catId, milestoneId: milestone.id },
          });
          if (existingAchievement) return;
          // sync redis user wallet to prisma
          await syncRedisUserWalletToPrisma(playerId);
          // generate txn ref
          const txnRef = generateUniqueRef();
          // implement transaction
          const result = await prisma.$transaction(async (tx) => {
            // insert achievement
            const achievement = await tx.gameAchievement.create({
              data: {
                amount: milestone.reward,
                reason: milestone.reason,
                rewardType: RewardTypeEnum.BONUS,
                milestoneId: milestone.id,
                catId,
                playerId,
                description: `You won ${milestone.reward} ${
                  TxnCurrencyEnum.COINS
                } & a trophy for achieving ${milestone.reason
                  ?.replace(/_/g, " ")
                  .toLowerCase()} under ${category.name}`,
                thumbnail: milestone.thumbnail,
                metadata: { txnRef },
              },
            });
            // sync redis and prisma together before crediting user
            const wallet = await tx.wallet.update({
              where: { userId: playerId },
              data: {
                bonus: { increment: milestone.reward },
              },
            });
            // insert transaction
            const txn = await tx.transaction.create({
              data: {
                amount: milestone.reward,
                currency: TxnCurrencyEnum.COINS,
                category: TxnCategoryEnum.GAME_BONUS,
                description: `You are rewarded ${milestone.reward} ${
                  TxnCurrencyEnum.COINS
                } in your wallet for achieving ${milestone.reason
                  ?.replace(/_/g, " ")
                  .toLowerCase()} under ${category.name}`,
                gateway: TxnGatewayEnum.WALLET,
                source: TxnSourceEnum.COINS,
                type: TxnTypeEnum.CREDIT,
                status: TxnStatusEnum.COMPLETED,
                achievementId: achievement.id,
                txnRef,
                userId: playerId,
                recipientId: playerId,
                walletId: wallet?.id,
              },
            });
            // update transaction
            await tx.gameAchievement.update({
              where: { id: achievement.id },
              data: { txnId: txn.id },
            });
            // return
            return { achievement, wallet };
          });
          // emit event to the player
          io.to(playerId).emit(
            GameEventEnum.GAME_ROOM_ACHIEVEMENT,
            result.achievement
          );

          // sync prisma wallet to redis
          await syncPrismaUserWalletToRedis(playerId, result.wallet);
        }
      }
    } else {
      // Set the new leader and reset their streak to 1
      await redisClient.hSet(streakKey, { playerId, catId, streak: 1 });
    }
  } catch (error) {}
}

async function resetRoomStreak(roomId: string): Promise<void> {
  await redisClient.del(`room:${roomId}:streak`);
}

async function backupGamePlayersScores(data: ThemedGameScoreStat[]) {
  try {
    const uniqueKey = "game:scores:backup";
    const backup = convertKeysToJSONKeys(data);
    const exists = await redisClient.exists(uniqueKey);
    if (!exists) {
      await redisClient.json.set(uniqueKey, "$", backup);
    } else {
      await redisClient.json.arrAppend(uniqueKey, "$", ...backup);
    }
  } catch (error: any) {
    logger.error(error?.message);
  }
}

async function updateGamePlayersScoresDb(data: ThemedGameScoreStat[]) {
  try {
    // Attempt to save in Prisma within a transaction
    await prisma.$transaction(
      data.map(({ playerId, score, month, year, catId }) =>
        prisma.gameMonthStat.upsert({
          where: {
            playerId_catId_year_month: { playerId, month, year, catId },
          },
          update: {
            score: { increment: score },
            numPlayed: { increment: 1 },
          },
          create: {
            playerId,
            catId,
            month,
            year,
            score,
            numPlayed: 1,
          },
        })
      )
    );
  } catch (error) {
    backupGamePlayersScores(data);
  }
}

export const updateGamePlayersScores = async (scores: ThemedGameScore[]) => {
  // get utc month & date to track player score by month, year and overall
  const stat = getCurrentMonthAndYear();
  const persistData: ThemedGameScoreStat[] = scores.map((item) => ({
    score: item.score,
    playerId: item.playerId,
    catId: item.catId,
    roomId: item.roomId,
    ...stat,
  }));

  const totalScore = persistData.reduce((acc, item) => acc + item.score, 0);

  try {
    // perform pipeline update
    await Promise.all(
      scores.map(async (item) => {
        // get ranking keys
        const rankingKeys = getRankingKeys(item.catId);
        // player hash unique keys
        const playerKeys = getPlayerRedisKeys(item.playerId, item.catId);
        // update leaderboard sorted set
        redisClient.zIncrBy(rankingKeys.month, item.score, item.playerId),
          redisClient.zIncrBy(rankingKeys.week, item.score, item.playerId),
          redisClient.zIncrBy(rankingKeys.today, item.score, item.playerId),
          // update category total players score and num played
          redisClient.hIncrBy(rankingKeys.monthStat, "score", totalScore),
          redisClient.hIncrBy(rankingKeys.monthStat, "numPlayed", 1),
          // update player stats
          redisClient.hIncrBy(playerKeys.month, "score", item.score);
        redisClient.hIncrBy(playerKeys.month, "numPlayed", 1);
        redisClient.hIncrBy(playerKeys.week, "score", item.score);
        redisClient.hIncrBy(playerKeys.week, "numPlayed", 1);
        redisClient.hIncrBy(playerKeys.today, "score", item.score);
        redisClient.hIncrBy(playerKeys.today, "numPlayed", 1);
      })
    );
    // update db
    updateGamePlayersScoresDb(persistData);
  } catch (error) {}
};

export const updatePlayerGameEnergy = async (
  socket: Socket,
  params: PlayerGameEnergy
) => {
  try {
    console.log("Game energy incoming request ", params);
    const playerKeys = getPlayerRedisKeys(params.playerId, params.catId);
    await redisClient.hSet(playerKeys.energy, { ...params });
    // emit back
    socket.emit(GameEventEnum.GAME_PLAYER_ENERGY, params);
    logger.info(`Redis game room player's energy updated`);
  } catch (error: any) {
    logger.error(
      `Error: Updating redis game room player's energy failed: ${error?.message}`
    );
  }
};

export const updatePlayersGameEnergy = async (
  scores: ThemedGameScore[],
  io: Server
) => {
  try {
    const result = await Promise.all(
      scores.map(async (item) => {
        // get user keys
        const playerKeys = getPlayerRedisKeys(item.playerId, item.catId);
        // get random amount number
        const amount = getRandomNumber(150, 250, true);
        // get random number to decrement energy gauge
        const gauge = getRandomNumber(2, 4, true);
        // get random number to decrement energy turbo
        const turbo = getRandomNumber(2, 4, true);
        // update player stats
        const _amount = await redisClient.hIncrBy(
          playerKeys.energy,
          "amount",
          amount
        );
        const _gauge = await redisClient.hIncrBy(
          playerKeys.energy,
          "gauge",
          -gauge
        );
        const _turbo = await redisClient.hIncrBy(
          playerKeys.energy,
          "turbo",
          -turbo
        );
        console.log("Generated energy", { amount, gauge, turbo });
        return {
          playerId: item.playerId,
          catId: item.catId,
          amount: _amount,
          gauge: _gauge,
          turbo: _turbo,
        };
      })
    );
    //
    console.log("Updated players game energy after game round");
    console.log(result);
    // emit to game players
    await Promise.all(
      result.map((item) => {
        io.in(item.playerId).emit(GameEventEnum.GAME_PLAYER_ENERGY, item);
      })
    );

    logger.info(`Redis game room players' energy updated`);
  } catch (error: any) {
    logger.error(
      `Error: Updating redis game room players energy failed: ${error?.message}`
    );
  }
};

export const isGameRoomExists = async (roomId: string) => {
  try {
    const exists = await redisClient.exists(`room:${roomId}`);
    return exists === 1;
  } catch (error) {
    return false;
  }
};

export const updateGameRoom = async (params: TempGameRoom) => {
  const timer = params.timer ?? getRandomNumber(10, 20, true);
  const roomKey = `room:${params.roomId}`;
  await redisClient.hSet(roomKey, { ...params, timer });
};

export const notifyGameRoomPlayers = (
  roomId: string,
  totalPlayers: number,
  io: Server
) => {
  // broadcasting to the room the total number of participants
  const minPlayers = 3 - totalPlayers;
  io.to(roomId).emit(
    GameEventEnum.NOTIFY_MESSAGE,
    `We have ${totalPlayers} ${
      totalPlayers === 1 ? "player" : "players"
    } & waiting for ${minPlayers} to start!`
  );
};

// this function checks if the number of players in the room are up 3
export const checkGameNumPlayers = async (
  roomId: string,
  catId: string,
  io: Server
) => {
  const totalPlayers = await getTotalRoomPlayers(roomId);
  if (totalPlayers === 0) return;
  // if (totalPlayers >= 1 && totalPlayers < 3) {
  //   notifyGameRoomPlayers(roomId, totalPlayers, io);
  //   updateGameRoom({ status: GameStatusEnum.CHAT, roomId });
  //   gameChatTime(roomId, io);
  //   return;
  // }
  // generate a random themed question using Ai
  const gameQuestion = await generateXAiQuestion();
  if (!gameQuestion) {
    io.to(roomId).emit(
      GameEventEnum.NOTIFY_MESSAGE,
      "Swen says, you can chat now"
    );
    await updateGameRoom({ status: GameStatusEnum.CHAT, roomId, catId });
    gameChatTime(roomId, io);
    return;
  }
  //   store in redis based on the game room
  await storeGameRoomQuestion(roomId, gameQuestion);
  await updateGameRoom({
    status: GameStatusEnum.PLAY,
    roomId,
    catId,
    timer: 15,
  });
  //   store in redis based on the game room
  io.to(roomId).emit(GameEventEnum.NOTIFY_MESSAGE, "Swen says, get ready!");
  await gamePlayTime(roomId, io, gameQuestion);
};

// this function signifies time for voting
export const getGameResult = async (roomId: string, io: Server) => {
  const room = await getGameRoom(roomId);
  if (!room) return;
  // get all the game answers for a particular room when answering is done
  const answers = await retrieveGameRoomAnswers(roomId);
  // calculate players points
  const gameRoomScore = await calculateGameRoomPoints(roomId, answers);
  // persuade users to play when no game answers are available
  if (gameRoomScore.length === 0) {
    io.to(roomId).emit(
      GameEventEnum.MESSAGE,
      composeMessage({ content: "Please don't forget to always play!" })
    );
  }
  // check if gamePoints is not empty
  if (gameRoomScore.length > 0) {
    // update game room streak and game achievement or set game room streak
    const item = gameRoomScore[0];
    item.score > 0
      ? updateWinningStreak(item, io)
      : resetRoomStreak(item.roomId);
    // update players game energy
    updatePlayersGameEnergy(gameRoomScore, io);
    //   emit event to client
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_SCORE, gameRoomScore);
    // update game points
    await updateGamePlayersScores(gameRoomScore);
    //   send in game room players
    const players = await getGameRoomPlayersWithRank(roomId, room.catId);
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_PLAYERS, players);
  } else {
    // reset game room streak
    resetRoomStreak(room.roomId);
  }
  // chat again
  gameChatTime(roomId, io, true);
};
// when it's play time
export const gamePlayTime = async (
  roomId: string,
  io: Server,
  question: ThemedGameQuestion
) => {
  const room = await getGameRoom(roomId);
  if (!room) return;
  const status = room.status;
  let countdown = room.timer ?? 1;
  io.to(roomId).emit(GameEventEnum.GAME_ROOM_QUESTION, {
    message: "Swen says, it's play time!",
    question,
  });
  const interval = setInterval(async () => {
    --countdown;
    const isExists = await isGameRoomExists(roomId);
    if (!isExists) return clearInterval(interval);
    updateGameRoom({ status, roomId, catId: room.catId, timer: countdown });
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_STATE, { status, countdown });
    if (countdown < 1) {
      clearInterval(interval);
      updateGameRoom({
        status: GameStatusEnum.CHAT,
        roomId,
        catId: room.catId,
      });
      getGameResult(roomId, io);
    }
  }, 1000);
};

export const gameChatTime = async (
  roomId: string,
  io: Server,
  notify?: boolean
) => {
  const room = await getGameRoom(roomId);
  if (!room) return;
  const status = room.status;
  let countdown = room.timer ?? 1;
  // emit initial message
  if (notify) {
    io.to(roomId).emit(GameEventEnum.NOTIFY_MESSAGE, "You can chat now!");
  }
  const interval = setInterval(async () => {
    --countdown;
    const isExists = await isGameRoomExists(roomId);
    if (!isExists) return clearInterval(interval);
    // emit to the client side
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_STATE, { status, countdown });
    // update game timer
    await updateGameRoom({
      roomId,
      catId: room.catId,
      status,
      timer: countdown,
    });
    if (countdown < 1) {
      clearInterval(interval);
      checkGameNumPlayers(roomId, room.catId, io);
    }
  }, 1000);
};

export const createGame = async (args: {
  name: string;
  description: string;
  thumbnail?: string;
  userId: string;
}) => {
  try {
    const result = await prisma.game.create({ data: args });
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    return { status: 500, data: null, message: error?.message };
  }
};

export const getGames = async () => {
  try {
    const result = await prisma.game.findMany({});
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    return { status: 500, data: null, message: error?.message };
  }
};

export const createGameCategory = async (args: {
  name: string;
  description: string;
  thumbnail?: string;
  userId: string;
  gameId: string;
}) => {
  try {
    const result = await prisma.gameCategory.create({ data: args });
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    return { status: 500, data: null, message: error?.message };
  }
};

export const createGameCategoryRoom = async (args: {
  name: string;
  description: string;
  thumbnail?: string;
  userId: string;
  catId: string;
}) => {
  try {
    const result = await prisma.gameRoom.create({ data: args });
    return { status: 200, data: result };
  } catch (error: any) {
    return { status: 500, data: error?.message };
  }
};

export const getGameCategories = async (gameId: string) => {
  try {
    const result = await prisma.gameCategory.findMany({ where: { gameId } });
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    return { status: 500, data: null, message: error?.message };
  }
};

export const getGameCategoryRooms = async (catId: string) => {
  try {
    const rooms = await prisma.gameRoom.findMany({ where: { catId } });
    // Fetch participant counts from Redis for each room
    const result = await Promise.all(
      rooms.map(async (room) => {
        const count = await redisClient.get(`room:${room.id}:participants`);
        return {
          ...room,
          participants: parseInt(count || "0", 10), // Default to 0 if not set
        };
      })
    );
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    return { status: 500, data: null, message: error?.message };
  }
};

export const getGameCategoryRoom = async (roomId: string) => {
  try {
    const result = await prisma.gameRoom.findUniqueOrThrow({
      where: { id: roomId },
    });
    return { status: 200, data: result };
  } catch (error: any) {
    return { status: 500, data: error?.message };
  }
};

export const checkGameRoom = async (roomId: string) => {
  try {
    return await prisma.gameRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { category: true },
    });
  } catch (error: any) {
    return null;
  }
};

export const getGamePlayerRankings = async (userId: string, rankType: "today" | "week" | "month") => {
  try {
    const keyPatterns = getPlayerRedisKeys(userId, "*");
    const pattern = rankType === "today" ? keyPatterns.today : rankType === "week" ? keyPatterns.week : keyPatterns.month
    // Use SCAN to fetch a batch of keys
    const { keys} = await redisClient.scan(0, { COUNT: 50000, MATCH: pattern});
    // ranking store
    const rankings = []
    // loop through keys and get player rank for each category
    for (const key of keys) {
      const catId = extractCatId(key)
      if(!catId) break;
      // get category details
      const category = await prisma.gameCategory.findUnique({ where: { id: catId }, include: { game: { select: { id: true, name: true}}}})
      if(!category) break;
      // get ranking
      const rankingKeys = getRankingKeys(catId)
      const rankingKey = rankType === "today" ? rankingKeys.today : rankType === "week" ? rankingKeys.week : rankingKeys.month
      // get player data
      const infoKey = keyPatterns.info.replace("*", catId)
      const playerData = await getRedisHashKey<{
        id: string,
        name: string,
        createdAt: string,
        lastLoggedIn: string
      }>(infoKey)
      if(!playerData) break;
      // get cat stats
      const playerCatStats = await getRedisHashKey<{score: number, numPlayed: number}>(key)
      if(!playerCatStats) break;
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, userId);
      rankings.push({
        category,
        ...playerData, 
        ...playerCatStats, 
        rank: playerRank !== null ? playerRank + 1 : 0})
    }
    
    return { status: 200, data: rankings}
    
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
};

export const getGameWinnersStats = async() => {
  try {
    // get distinct count
    const distinctStats = await prisma.gameMonthStat.groupBy({
      by: ["catId", "month", "year"], // Group by these fields
    });
    // const result = await prisma.gameMonthStat.findMany({ distinct: ["catId", "month", "year"], include: { category: { include: { game: true }}}})

    const data = await Promise.all(distinctStats.map(async(item) => {
      const [rewardStats, category ] = await prisma.$transaction([
        prisma.gameMonthRewardStat.findFirst({ where: { catId: item.catId}}),
        prisma.gameCategory.findUniqueOrThrow({ 
          where: {
            id: item.catId,
          },
          include: { game: true }})
      ])
      return {...category, catId: item.catId, month: item.month, year: item.year, rewardStats}
    }))
    return { status: 200, data}
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

export const getGameWinners = async({page, limit, month, year, catId}: { page: number, limit: number, month: number, year: number, catId: string}) => {
  try {
    const skip = (page - 1) * limit
    const result = await prisma.gameMonthStat.findMany({ where: { year, month, catId, rank: { gt: 0 }}, skip, take: limit, orderBy: [{ rank: "asc"}], include: { player: true, }})
    const data = await Promise.all(result.map(async(item) => {
      const {player, ...rest} = item
      // get reward txn if any
      const txn = await prisma.transaction.findFirst({ where: { 
        userId: rest.playerId,
        category: "GAME_MONTHLY_REWARD", 
        type: "CREDIT",
        metadata: { equals: { year: rest.year, month: rest.month } },
      }})
      // return
      return {...rest, txn, name: player.name}
    }))
    return { status: 200, data }
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

export const getGameCategoriesRankings = async (rankType: "today" | "week" | "month") => {
  try {
    const keyPatterns = getRankingKeys("*");
    const pattern = rankType === "today" ? keyPatterns.today : rankType === "week" ? keyPatterns.week : keyPatterns.month
    // Use SCAN to fetch a batch of keys
    const { keys} = await redisClient.scan(0, { COUNT: 50000, MATCH: pattern});
    // ranking store
    const rankings = []
    // loop through keys and get player rank for each category
    for (const key of keys) {
      const catId = extractCatId(key)
      if(!catId) break;
      // get category details
      const category = await prisma.gameCategory.findUnique({ where: { id: catId }, include: { game: { select: { id: true, name: true}}}})
      if(!category) break;
      // get total participants
      const totalParticipants = await redisClient.zCard(key)
      rankings.push({...category, totalParticipants})
    }    
    return { status: 200, data: rankings}
    
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
};


export const getGamesRankingArchiveStats = async() => {
  try {

    // get distinct count
    const distinctStats = await prisma.gameMonthStat.groupBy({
      by: ["catId", "month", "year"], // Group by these fields
      _count: {
        _all: true, // Count total rows for each group
      },
    });
    // get the related data
    const data = await Promise.all(
      distinctStats.map(async (item) => {
          const category = await prisma.gameCategory.findUniqueOrThrow({ 
          where: {
            id: item.catId,
          },
          include: { game: true }})
          return {...category, catId: item.catId, month: item.month, year: item.year, totalParticipants: item._count._all}
      })
    );
    return { status: 200, data}
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

export const getGamesRankingArchiveData = async({page, limit, month, year, catId}: { page: number, limit: number, month: number, year: number, catId: string}) => {
  try {
    const skip = (page - 1) * limit
    // get archive data
    const result = await prisma.gameMonthStat.findMany({ where: { year, month, catId, rank: { gt: 0 }}, skip, take: limit, orderBy: [{ rank: "asc"}], include: { player: true, }})
    // format data
    const data = result.map((item) => {
      const {player, ...rest} = item
      return {...rest, name: player.name}
    })
    return { status: 200, data }
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

export const getUserGamesRankingArchiveStats = async(userId: string) => {
  try {

    // get distinct count
    const distinctStats = await prisma.gameMonthStat.groupBy({
      where: { playerId: userId},
      by: ["catId", "month", "year"], // Group by these fields
    });
    // get the related data
    const data = await Promise.all(
      distinctStats.map(async (item) => {
          const category = await prisma.gameCategory.findUniqueOrThrow({ 
          where: {
            id: item.catId,
          },
          include: { game: true }})
          return {...category, catId: item.catId, month: item.month, year: item.year}
      })
    );
    return { status: 200, data}
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

export const getUserGameRankingArchiveData = async({month, year, catId, userId}: { month: number, year: number, catId: string; userId: string}) => {
  try {
    // get archive data
    const result = await prisma.gameMonthStat.findFirst({ 
      where: { 
        year, 
        month, 
        catId, 
        playerId: userId, 
        }, take: 1, include: { player: true, }})
    if(!result) return { status: 404, data: "Not found." };
    // format data
    const {player, ...rest} = result
    return { status: 200, data: {...rest, name: player.name} }
  } catch (error: any) {
    return { status: 500, data: "Sorry an error occurred, please try again later."};
  }
}

// creating fake users and redis data for test purposes

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

export function createRandomUser() {
  const uid = faker.string.uuid().slice(-5);
  return {
    name: faker.person.fullName(),
    username: faker.internet.username() + uid,
    email: uid + faker.internet.email(),
    avatar: faker.image.avatar(),
    password: faker.internet.password(),
    telId: faker.string.uuid().slice(-12),
    wallet: { create: { bonus: 100 } },
  };
}

export const createDummyUsers = async () => {
  try {
    const batchSize = 2000;
    let counter = 0;
    while (counter < 5_000_000) {
      const users = faker.helpers.multiple(createRandomUser, {
        count: batchSize,
      });
      const createManyUsers = users.map((user) =>
        prisma.user.create({ data: user })
      );
      await prisma.$transaction(createManyUsers);
      counter += batchSize;
      logger.info(`Created bATCH ${counter} dummy users `);
    }
    logger.info(`Created ${counter} dummy users `);
  } catch (error: any) {
    logger.info(`Error: Dummy users failed ${error?.message}`);
  }
};

export const createDummyRedisMonthlyScoreRecord = async () => {
  try {
    const batchSize = 500;
    let counter = 0;
    const total = await prisma.user.count();
    while (counter < total) {
      const users = await prisma.user.findMany({
        skip: counter,
        take: batchSize,
      });
      if (users.length === 0) break;
      // insert new users into redis database
      const categories = await prisma.gameCategory.findMany({});

      if (categories.length === 0) break;

      for (const category of categories) {
        const rankingKeys = getRankingRewardKeys(category.id);
        const spentKey = getSpentCoinsKey({
          gameId: category.gameId,
          catId: category.id,
        });
        const fakeUserScore = users.map((user) => {
          // insert fake redis user details
          redisClient.hSet(
            `player:${user.id}:category:${category.id}:${2024}`,
            {
              id: user.id,
              name: user.username,
              createdAt: new Date().toISOString(),
              lastLoggedIn: new Date().toISOString(),
            }
          );
          // fake score
          const numPlayed = getRandomNumber(2000, 20_000, true);
          const score = getRandomNumber(20_000, 2_000_000, true);
          // insert fake month player data
          redisClient.hSet(
            `player:${user.id}:category:${
              category.id
            }:${2024}:${11}:month:${11}`,
            {
              score,
              numPlayed,
            }
          );
          // fake month stat
          // update category total players score and num played
          redisClient.hSet(rankingKeys.rewardMonthStat, {
            score: getRandomNumber(5_000_000_000, 20_000_000_000, true),
            numPlayed: getRandomNumber(1_000_000, 10_000_000, true),
          }),
            // fake user scores
            redisClient.zAdd(rankingKeys.rewardMonth, {
              value: user.id,
              score: score,
            });
          // fake total coins spent
          redisClient.hSet(spentKey, {
            coins: getRandomNumber(8_000_000_000, 30_000_000_000),
            bonus: getRandomNumber(100_000_000, 500_000_000),
            gameId: category.gameId,
            catId: category.id,
          });
        });
        await Promise.all(fakeUserScore);
      }

      counter += users.length;

      console.log(`bATCH: ${counter} created successfully`);
    }
    logger.info(`Dummy monthly game score created successfully`);
  } catch (error: any) {
    console.log(`Error: Creating monthly dummy data failed ~ `, error?.message);
  }
};

const deleteAllRecords = async () => {
  await prisma.gameMonthStat.deleteMany({ where: { score: { gt: 0 } } });
  await prisma.gameMonthRewardStat.deleteMany({
    where: { totalScore: { gt: 0 } },
  });
  await prisma.transaction.deleteMany({ where: { amount: { gt: 0 } } });
  await prisma.gameAchievement.deleteMany({ where: { amount: { gt: 0 } } });
  logger.info("Deleted all records");
};

async function clearRedisKeysByPattern(pattern: string) {
  try {
    // clear players stats redis keys
    let cursor = 0; // Initial cursor
    let keyCounts = 0;
    do {
      // Use SCAN to fetch a batch of keys
      const { cursor: newCursor, keys } = await redisClient.scan(cursor, {
        COUNT: 50000,
        MATCH: pattern,
      });
      cursor = newCursor;
      keyCounts += keys.length;
      logger.info(`cursor: ${cursor}`);
      logger.info(`First key : ${keys[0]}`);
      logger.info(`Found ${keys.length} keys in this batch`);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => redisClient.del(key)));
        logger.info(`Deleted ${keys.length} keys in this batch`);
      }
    } while (cursor !== 0); // SCAN stops when cursor is back to '0'

    logger.info(`All matching ${keyCounts} keys have been deleted.`);
  } catch (error: any) {
    logger.info("Error: Deleting players month stats failed.", error?.message);
  }
}

const insertPlanFeatures = async() => {
  try {
    await prisma.planFeature.createMany({ data: [
      // {
      //   name: "Exclusive Experience", 
      //   planId: "cm53oc8a50000vwfy8sdlzh1f",
      //   items: [
      //     {id: generateUniqueRef(), title: "Reply and profile boost", description: "Small" },
      //     {id: generateUniqueRef(), title: "Earn standard rewards", description: "" },
      //     {id: generateUniqueRef(), title: "Contains non-intrusive ads", description: "" },
      //     {id: generateUniqueRef(), title: "Send/receive friend requests game rooms", description: "" }
      //   ]
      // },
      // organization
      {
        name: "Exclusive Experience", 
        planId: "cm53oc8a50003vwfyz79hdaet",
        items: [
          {id: generateUniqueRef(), title: "Reply and profile boost", description: "Larger" },
          {id: generateUniqueRef(), title: "Priority placement in search suggestions", description: "" },
          {id: generateUniqueRef(), title: "Priority support for reports and issues.", description: "" },
          {id: generateUniqueRef(), title: "Partial Ads browsing experience", description: "" }
        ]
      },
      {
        name: "Exclusive Experience", 
        planId: "cm53oc8a50004vwfy508n9x9u",
        items: [
          {id: generateUniqueRef(), title: "Reply and profile boost", description: "Largest" },
          {id: generateUniqueRef(), title: "Priority placement in search suggestions", description: "" },
          {id: generateUniqueRef(), title: "Priority support for reports and issues.", description: "" },
          {id: generateUniqueRef(), title: "Ads-free browsing experience", description: "" }
        ]
      },
      // government 
      {
        name: "Exclusive Experience", 
        planId: "cm53oc8a50006vwfyxyk8b7sq",
        items: [
          {id: generateUniqueRef(), title: "Reply and profile boost", description: "Larger" },
          {id: generateUniqueRef(), title: "Priority placement in search suggestions", description: "" },
          {id: generateUniqueRef(), title: "Priority support for reports and issues.", description: "" },
          {id: generateUniqueRef(), title: "Partial Ads browsing experience", description: "" }
        ]
      },
      {
        name: "Exclusive Experience", 
        planId: "cm53oc8a50006vwfyxyk8b7sq",
        items: [
          {id: generateUniqueRef(), title: "Reply and profile boost", description: "Largest" },
          {id: generateUniqueRef(), title: "Priority placement in search suggestions", description: "" },
          {id: generateUniqueRef(), title: "Priority support for reports and issues.", description: "" },
          {id: generateUniqueRef(), title: "Ads-free browsing experience", description: "" }
        ]
      }
    ],})
    console.log("Inserted plan features")
  } catch (error: any) {
    console.log("Error: Plan Features ", error?.message)
  }
}


const executeRecords = async () => {
  // await insertPlanFeatures()
  // await prisma.user.deleteMany();
  // await createDummyUsers();
  // await createDummyRedisMonthlyScoreRecord()
  // await deleteAllRecords()
  // clearRedisKeysByPattern(`player:*:category:*:2024:12:today:3`)
  // await getTopRankingPlayersOfTheYearByCategory();
};

executeRecords();
