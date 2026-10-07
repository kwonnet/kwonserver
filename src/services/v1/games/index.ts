import { GameDelivery, dispatchGameAction } from '@/services/walletLedger/gameDelivery';
import { randomUUID } from 'crypto';
import { walletOperation, cents } from '@/services/walletLedger';
import { chargeGameAction } from '@/services/walletLedger/game';
import { questionHistoryKey } from './questionInventory';
import { InventoryEmptyError } from '@/services/questionInventory/service';
import { DefaultEventsMap, Namespace, Server, Socket } from "socket.io";
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
  AcronymGameAnswer,
  GameType,
  GameRoomAnswer,
  GameCatType,
  SocketGameRoom,
  User,
} from "@/types";
import {
  composeMessage,
  extractCatId,
  generateUniqueRef,
  getCurrentDataInfo,
  getExpiryAtUTC,
  getGameMode,
  getMonthlyExpiration,
  getPlayerRankingKey,
  getPlayerRedisKeys,
  getRandomNumber,
  getRankingKeys,
  getRankingRewardKeys,
  getRemainingDaysInMonth,
  getSpentCoinsKey,
  getUserRedisKeys,
  isDateMinuteElapsed,
  parseStringNumbers,
} from "@/utils";
import prisma from "@/db";
import {
  GameEnergy,
  GameMode,
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
import { generateRoomQuestion, shuffleArray } from "@/utils/ai";
import {
  calculateWordMakerPlayerScore,
  getGameCatType,
  getGameType,
  syncPrismaUserWalletToRedis,
  syncRedisUserWalletToPrisma,
} from "../../helper";
import { faker } from "@faker-js/faker";

interface GameIoNamespace extends Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> {}



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
  mode: GameMode;
  action: GameActionEnum;
  [key: string]: any;
}, delivery?: GameDelivery) {
  const actionStat = {
    [GameActionEnum.CHAT]: { min: 0.35, max: 0.64 },
    [GameActionEnum.VOTE]: { min: 0.65, max: 0.99 },
    [GameActionEnum.ANSWER]: { min: 0.75, max: 1.0 },
    [GameActionEnum.ENTRIES]: { min: 0.55, max: 0.90 },
  };

  try {
    const rate = actionStat[params.action];
    if (!rate) throw new Error('Invalid game action');
    const data = await chargeGameAction(params, getRandomNumber(0.99, 2.2), getRandomNumber(rate.min, rate.max), delivery);
    if (data.actionId) {
      try {
        const action = await dispatchGameAction(data.actionId);
        if (action.status === 'REFUNDED') {
          const wallet=await prisma.wallet.findUniqueOrThrow({where:{userId:params.playerId}});
          return {message:action.reason || 'Action refunded',isError:true,data:{amount:cents(wallet.coins,true)/100,bonus:cents(wallet.bonus,true)/100}};
        }
      } catch (error) {
        logGameError('deductGameCoins', error, params);
        return {message:'Action saved; delivery is pending recovery',isError:false,data:{...data,pending:true}};
      }
    }
    return { message: "success", isError: false, data };
  } catch (error: any) {
    logGameError('deductGameCoins', error, params);
    return { message: error?.message || 'Game charge failed', isError: true, data: null };
  }
}

export const getUserWallet = async (userId: string) => {
  try {
    return await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  } catch (error) {
    logGameError('getUserWallet', error, {userId});
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
    logGameError('getUserData', error, {userId,catId});
    return null;
  }
};

export const checkUserGameEnergy = async (userId: string, catId: string) => {
  try {
    // const playerKeys = getPlayerRedisKeys(userId, catId);
    const uKey = `player:${userId}:cat:${catId}:energy`
    // check redis
    const energy = await getRedisHashKey<GameEnergy>(uKey);

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
    logGameError('checkUserGameEnergy', error, {userId,catId});
    return null;
  }
};

export const checkUserGameWallet = async (userId: string) => {
  try {
    const wallet = await getUserWallet(userId);
    const isError = !wallet || !!wallet.isLocked || cents(wallet.coins, true) + cents(wallet.bonus, true) < 1000;
    return { message: isError ? "Wallet unavailable or insufficient coins" : "success", isError, data: isError ? null : wallet };
  } catch (error) {
    logGameError('checkUserGameWallet', error, {userId}); return { message: "Wallet unavailable", isError: true, data: null }; }
};

async function syncUserRedisGameEnergyToPrisma(
  playerId: string,
  catId: string,
  mode: "single" | "multi"
) {
  const playerKeys = getPlayerRedisKeys(playerId, catId, mode);
  try {
    const result = await getRedisHashKey<GameEnergy>(playerKeys.energy);
    if (!result) return;
    // perform prisma update
    console.log("Player Energy ", result);
    await prisma.gameEnergy.update({
      where: { id: result.id },
      data: {
        amount: result.amount < 0 ? 2200 : result.amount,
        gauge: result.gauge < 0 ? 10 : result.gauge,
        turbo: result.turbo < 0 ? 10 : result.turbo,
      },
    });
    console.log("User redis game energy synced to prisma successfully >>>");
  } catch (error: any) {
    logGameError('syncUserRedisGameEnergyToPrisma', error, {playerId,catId});

  } finally {
    await redisClient.del(playerKeys.energy);
  }
}

export async function syncUserRedisWalletToPrisma(userId: string) {
  // Compatibility hook: game debits now commit directly to PostgreSQL.
  return syncRedisUserWalletToPrisma(userId);
}

export const storeGameRoomQuestion = async (
  roomId: string,
  params: ThemedGameQuestion
) => {
  try {
    const uniqueKey = `room:${roomId}:question`;
    const stored = { ...params, roundId: params.roundId ?? randomUUID() };
    await redisClient.set(uniqueKey, JSON.stringify(stored));
    return stored as unknown as ThemedGameQuestion;
  } catch (error) {
    logGameError('storeGameRoomQuestion', error, params);
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
    logGameError('retrieveGameRoomQuestion', error, {roomId});
    return null;
  }
};

// Function to save or update a user's answer for a question
export async function saveGameRoomPlayerAnswer(
  params: ThemedGameAnswer | AcronymGameAnswer
) {
  const uniqueKey = `room:${params.roomId}:answers`;
  // Save or update the user's answer in the hash
  await redisClient.hSet(uniqueKey, params.playerId, JSON.stringify(params));
  return params;
}

export async function insertWordMakerGameRoomAnswer(params: ThemedGameAnswer) {
  try {
    const answersKey = `room:${params.roomId}:answers`;
    const prevRecord = await redisClient.hGet(answersKey, params.playerId);
    // guesses key
    const key = `room:${params.roomId}:player:${params.playerId}:guesses`;
    if (!prevRecord) {
      await saveGameRoomPlayerAnswer({
        ...params,
        answer: "",
        answers: [{ timer: params.timer, text: params.answer }],
      });
      await redisClient.hSet(
        key,
        params.answer,
        JSON.stringify({ timer: params.timer, text: params.answer })
      );
    } else {
      await redisClient.hSet(
        key,
        params.answer,
        JSON.stringify({ timer: params.timer, text: params.answer })
      );
    }
    return { isError: false, message: "Guess saved successfully" };
  } catch (error) {
    logGameError('insertWordMakerGameRoomAnswer', error, params);
    return { isError: true, message: `Error saving answer` };
  }
}

export async function insertAcronymGameRoomAnswer(params: AcronymGameAnswer) {
  try {
    const uAnswersKey = `room:${params.roomId}:u-answers`;
    const answersKey = `room:${params.roomId}:answers`;
    // Check if the answer already exists in the room
    const exists = await redisClient.sIsMember(uAnswersKey, params.answer);
    if (exists) {
      return { isError: true, message: "Answer already entered" };
    }
    // remove
    const prevRecord = await redisClient.hGet(answersKey, params.playerId);
    if (prevRecord) {
      console.log("prevRecord ", prevRecord);
      // as AcronymGameAnswer | null
      const record = JSON.parse(prevRecord) as AcronymGameAnswer;
      await redisClient.sRem(uAnswersKey, record.answer);
    }
    // Add the answer to the set to ensure uniqueness
    await redisClient.sAdd(uAnswersKey, params.answer);

    await saveGameRoomPlayerAnswer(params);

    return { isError: false, message: "Answer saved successfully" };
  } catch (error) {
    logGameError('insertAcronymGameRoomAnswer', error, params);
    return { isError: true, message: `Error saving answer` };
  }
}

export async function insertGameRoomVote({
  answerId,
  roomId,
  votedUserId,
  playerId,
}: {
  answerId: string;
  roomId: string;
  votedUserId: string;
  playerId: string;
}) {
  try {
    console.log("Voting function called");
    const answersKey = `room:${roomId}:answers`;
    const voteHashKey = `room:${roomId}:votes`;
    // Check if the player has already voted and remove the vote
    const previousVote = await redisClient.hGet(voteHashKey, playerId);
    if (previousVote) {
      console.log("previousVote ", previousVote);
      // Decrement vote count for the previously voted answer
      const prevAnswer = await redisClient.hGet(answersKey, previousVote);
      if (prevAnswer) {
        const prevAnswerData = JSON.parse(prevAnswer) as AcronymGameAnswer;
        prevAnswerData.votes = prevAnswerData.votes.filter(
          (id) => id !== playerId
        );
        await redisClient.hSet(
          answersKey,
          previousVote,
          JSON.stringify(prevAnswerData)
        );
      }
    }
    // Update the vote for the new answer
    const newAnswer = await redisClient.hGet(answersKey, votedUserId);
    if (newAnswer) {
      const newAnswerData = JSON.parse(newAnswer) as AcronymGameAnswer;
      if (!newAnswerData.votes.includes(playerId)) {
        newAnswerData.votes.push(playerId);
      }
      await redisClient.hSet(
        answersKey,
        votedUserId,
        JSON.stringify(newAnswerData)
      );
    }
    // // Update the player's vote in the votes hash
    await redisClient.hSet(voteHashKey, playerId, votedUserId);
    // const
    const currPlayerAnswer = await redisClient.hGet(answersKey, playerId);
    if (currPlayerAnswer) {
      const obj = JSON.parse(currPlayerAnswer);
      await redisClient.hSet(
        answersKey,
        playerId,
        JSON.stringify({ ...obj, voted: true })
      );
    }

    return { isError: false, message: "Answer voted successfully" };
  } catch (error) {
    logGameError('insertGameRoomVote', error, {roomId,playerId});
    return { isError: true, message: `Error voting answer` };
  }
}

// Function to retrieve all answers for a question in a game room
export async function retrieveGameRoomAnswers<T = any>(
  roomId: string,
  isGuesses?: boolean
) {
  const questionKey = `room:${roomId}:answers`;
  // Retrieve all user answers for the question
  const result = await redisClient.hGetAll(questionKey);
  if (Object.keys(result).length === 0) {
    return [];
  }
  const answers = Object.values(result).map((item) => JSON.parse(item)) as T[];
  if (!isGuesses) return answers;
  // retrieve user guesses
  const playersAnswers = answers as ThemedGameAnswer[];
  const userAnswers = await Promise.all(
    playersAnswers.map(async (ans) => {
      const key = `room:${roomId}:player:${ans.playerId}:guesses`;
      const guesses = await redisClient.hGetAll(key);
      const entries = Object.entries(guesses).map(([_key, value]) =>
        JSON.parse(value)
      ) as { timer: number; text: string }[];
      console.log("entries: ", entries);
      return { ...ans, answers: entries };
    })
  );
  return userAnswers;
}

export const deleteGameRoomQuestionAndAnswers = async (roomId: string) => {
  try {
    await Promise.all([
      redisClient.del(`room:${roomId}:question`),
      redisClient.del(`room:${roomId}:answers`),
      redisClient.del(`room:${roomId}:u-answers`),
      redisClient.del(`room:${roomId}:votes`),
    ]);
    const pattern = `room:${roomId}:player:*`;
    await clearRedisKeysByPattern(pattern);
  } catch (error) {
    logGameError('deleteGameRoomQuestionAndAnswers', error, {roomId});}
};

// Function to retrieve all answers, check correctness, and assign points
export async function calculateGameRoomPoints(room: TempGameRoom) {
  const question = await retrieveGameRoomQuestion(room.roomId);

  if (!question) return [];

  const gameType = getGameType(room.gameName);

  const catType = getGameCatType(room.catName);

  if (catType === GameCatType.WORDMAKER) {
    const arrAnswers: AcronymGameAnswer[] | ThemedGameAnswer[] =
      await retrieveGameRoomAnswers(room.roomId, true);

    const totalAnswers = arrAnswers.length;

    // delete game question & user answers
    await deleteGameRoomQuestionAndAnswers(room.roomId);

    // calculate score
    return arrAnswers
      .map((item) => {
        const calc = calculateWordMakerPlayerScore(
          question?.question,
          item.answers ?? []
        );
        const multiplier = parseFloat((totalAnswers / 10).toFixed(2));
        const finalScore = Math.floor(
          multiplier < 1 ? 1 * calc.score : calc.score * multiplier
        );
        return {
          score: finalScore,
          qId: item.qId,
          name: item.name,
          roomId: item.roomId,
          catId: item.catId,
          playerId: item.playerId,
          answer: calc.answer,
          timer: item.timer,
          mode: room.mode
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  const arrAnswers: AcronymGameAnswer[] | ThemedGameAnswer[] =
    await retrieveGameRoomAnswers(room.roomId, true);

  const answers = arrAnswers.sort((a, b) => b.timer - a.timer);

  const totalAnswers = answers.length;

  // delete game question & user answers
  await deleteGameRoomQuestionAndAnswers(room.roomId);

  if (gameType === GameType.ACRONYM) {
    const roomAnswers = answers as AcronymGameAnswer[];
    // calculate game score
    return roomAnswers
      .map((item, index) => {
        const score =
          !item.voted && totalAnswers > 1
            ? item.votes.length * 10 - 20
            : item.votes.length * 10;
        return {
          score: index === 0 ? 10 + score : score,
          qId: item.qId,
          name: item.name,
          roomId: item.roomId,
          catId: item.catId,
          playerId: item.playerId,
          answer: item.answer,
          timer: item.timer,
          mode: room.mode
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  const roomAnswers = answers as ThemedGameAnswer[];

  const isLuckySpinFlip =
    catType === GameCatType.LUCKYSPIN || catType === GameCatType.LUCKYFLIP;

  return roomAnswers
    .map((item, idx) => {
      const isCorrect =
        item.answer.toLowerCase() === question.answer.toLowerCase();
      const score = isLuckySpinFlip
        ? parseFloat(item.answer) * totalAnswers
        : isCorrect
        ? item?.timer * totalAnswers
        : 0;
      return {
        ...item,
        mode: room.mode,
        score: idx === 0 && score > 0 ? score + 10 : score,
      };
    })
    .sort((a, b) => b.score - a.score);
}


export const addGameRoomPlayer = async (params: GameRoomPlayer) => {
  try {
    const mode = getGameMode(params.mode)
    // const parentRoomId = params.roomId;
    // let roomId = params.roomId;
    let parentRoomId = `${mode}-${params.roomId}` // MODE-ROOMID
    let roomId = `${mode}-${params.roomId}` // MODE-ROOMID
    const totalPlayers = await getTotalRoomPlayers(roomId);
    if(params.mode === GameMode.SINGLE){
      const uID = params.playerId.slice(-10)
      roomId = `${roomId}_${uID}`; // user room partition
    }
    if (totalPlayers >= 20 && params.mode === GameMode.MULTI) {
      const partitionKey = `room:${parentRoomId}:partitions`;
      // Fetch only partitions with players < MAX_PLAYERS and limit the number of results
      const roomPartitions = await redisClient.zRangeByScore(
        partitionKey,
        "1",
        "19",
        { LIMIT: { count: 5, offset: 0 } }
      );
      // Parse the result into an array of objects with roomId and players
      const partitions = roomPartitions.reduce<
        {
          roomId: string;
          players: number;
        }[]
      >((acc, val, idx) => {
        if (idx % 2 === 0)
          acc.push({ roomId: val, players: parseInt(roomPartitions[idx + 1]) });
        return acc;
      }, []);
      // If no available room, create a new partition
      if (partitions.length === 0) {
        roomId = `${parentRoomId}_${generateUniqueRef(13)}`; //MODE-ROOMID_PARTITIONKEY
        await redisClient.zAdd(partitionKey, { score: 1, value: roomId }); // Add to partitions with 0 players
      } else {
        roomId = shuffleArray(partitions)[0].roomId;
        await redisClient.zIncrBy(partitionKey, 1, roomId);
      }
    }
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
    const rankingKeys = getRankingKeys(params.catId, mode);
    // player hash unique keys
    const playerKeys = getPlayerRedisKeys(params.playerId, params.catId, mode);
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
        redisClient.sAdd(`room:${roomId}:players`, params.playerId),
        // update parent room total participants
        redisClient.incr(`room:${parentRoomId}:participants`),
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
        redisClient.sAdd(`room:${roomId}:players`, params.playerId),
        // update parent room total participants
        redisClient.incr(`room:${parentRoomId}:participants`),
      ]);
    }
    // check user energy
    const isEnergyExists = await redisClient.exists(playerKeys.energy);
    if (!isEnergyExists) {
      redisClient.hSet(playerKeys.energy, {
        id: energy.id,
        amount: energy.amount,
        gauge: energy.gauge,
        turbo: energy.turbo,
        playerId: energy.playerId,
        catId: energy.catId,
      });
    }
    return {
      data: { energy, wallet, room: { id: roomId } },
      message: "success",
    };
  } catch (error: any) {
    logGameError('addGameRoomPlayer', error, params);

    return { data: null, message: "Error occured, please try again later" };
  }
};

// Function to update player game category session
export const updatePlayerSession = async (params: {
  playerId: string;
  catId: string;
  mode: GameMode
}) => {
  const mode = getGameMode(params.mode)
  // current date
  const currDate = new Date().toISOString();
  // player hash unique keys
  const playerKeys = getPlayerRedisKeys(params.playerId, params.catId, mode);
  // update user session on the game category - this is to track their last played date
  redisClient.hSet(playerKeys.info, "lastLoggedIn", currDate);
  // update user session
  const userKeys = getUserRedisKeys(params.playerId);
  redisClient.set(userKeys.session, currDate);
};

// get parent room total number of participants
export const getTotalRoomParticipants = async (roomId: string) => {
  const strArry = roomId.split("_");
  const parentRoomId = strArry[0];
  // const parentRoomId = `${mode}-${roomId}`
  const count = await redisClient.get(`room:${parentRoomId}:participants`);
  return parseInt(count ?? "0", 10);
};

// Function to get the total number of players in a room
export const getTotalRoomPlayers = async (roomId: string) => {
  const roomKey = `room:${roomId}:players`;
  return await redisClient.sCard(roomKey);
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
    logGameError('getGameRoomPlayers', error, {roomId});
    return [];
  }
}
// Function to get players in a room with their rank and details
export const getGameRoomPlayersWithRank = async (
  roomId: string,
  catId: string,
  mode: GameMode
) => {
  const _mode = getGameMode(mode)
  // get ranking keys and retrieve the over monthly data of the room player
  const rankingKeys = getRankingKeys(catId, _mode);
  // room players key
  const roomPlayersKey = `room:${roomId}:players`;
  // Retrieve the list of player IDs in the room
  const playerIds = await redisClient.sMembers(roomPlayersKey);
  // Fetch details and ranks for each player in the room
  const playersData = await Promise.all(
    playerIds.map(async (playerId) => {
      // player hash unique keys
      const playerKeys = getPlayerRedisKeys(playerId, catId, _mode);
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
export const getCountGamePlayers = async (catId: string, mode: GameMode) => {
  const _mode = getGameMode(mode)
  // get ranking keys
  const rankingKeys = getRankingKeys(catId, _mode);
  const [monthTotalPlayers, weekTotalPlayers, todayTotalPlayers] =
    await Promise.all([
      redisClient.zCard(rankingKeys.month),
      redisClient.zCard(rankingKeys.week),
      redisClient.zCard(rankingKeys.today),
    ]);
  return { monthTotalPlayers, weekTotalPlayers, todayTotalPlayers };
};

export const getRankingKey = (ranking: string, catId: string, mode: GameMode) => {
  const _mode = getGameMode(mode)
  // get ranking keys
  const rankingKeys = getRankingKeys(catId, _mode);
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
  mode
}: {
  page: number;
  limit: number;
  catId: string;
  ranking: string;
  mode: GameMode
}) => {
  const _mode = getGameMode(mode)
  const rankingKey = getRankingKey(ranking, catId, mode);
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
      const playerKeys = getPlayerRedisKeys(item.value, catId, _mode);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      // Get player's rank from the sorted set leaderboard
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player stat
      const key = getPlayerRankingKey({ ranking, playerId: item.value, catId, mode: _mode });
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

export async function removeGameRoomPlayer(roomId: string, playerId: string, mode: GameMode) {
  try {
    const strArry = roomId.split("_");
    const parentRoomId = strArry[0];
    const partitionKey = `room:${parentRoomId}:partitions`;
    const participantKey = `room:${parentRoomId}:participants`;
    // check if it's a partioned room
    if (roomId.includes("_") && mode === GameMode.MULTI) {
      // Remove player from the room set & delete player details as no longer needed
      const [partitionCount, participantCount] = await Promise.all([
        // update partioned room
        redisClient.zIncrBy(partitionKey, -1, roomId),
        // update parent room total participants
        redisClient.decr(participantKey),
        redisClient.sRem(`room:${roomId}:players`, playerId),
        redisClient.del(`room:${playerId}:player`),
      ]);
      // Clean up empty partition room
      if (partitionCount <= 0) {
        await redisClient.zRem(partitionKey, roomId);
        logger.info(`Partition Room ${roomId} has been cleaned up.`);
      }
      // Clean up empty participant room
      if (participantCount <= 0) {
        await redisClient.del(participantKey);
        logger.info(`Participants Room ${parentRoomId} has been cleaned up.`);
      }
      return participantCount
    } else {
      // Remove player from the room set & delete player details as no longer needed
      const [participantCount] = await Promise.all([
        // update parent room total participants
        redisClient.decr(participantKey),
        redisClient.sRem(`room:${roomId}:players`, playerId),
        redisClient.del(`room:${playerId}:player`),
      ]);
      // Clean up empty participant room
      if (participantCount <= 0) {
        await redisClient.del(participantKey);
        logger.info(`Participants Room ${parentRoomId} has been cleaned up.`);
      }
      return participantCount
    }

  } catch (error) {
    logGameError('removeGameRoomPlayer', error, {roomId,playerId});
    return 0;
  }
}

export async function cleanUpGameRoom(roomId: string) {
  try {
    logger.info({data: roomId}, "cleaning up game room ");
    const keys = [
      questionHistoryKey(roomId),
      `room:${roomId}`,
      `room:${roomId}:players`,
      `room:${roomId}:answers`,
      `room:${roomId}:u-answers`,
      `room:${roomId}:question`,
      `room:${roomId}:streak`,
    ];
    await Promise.all(keys.map((key) => redisClient.del(key)));
  } catch (error: any) {
    logGameError('cleanUpGameRoom', error, {roomId});

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
    logGameError('getGameRoomPlayer', error, {playerId});
    return null;
  }
};

export const disconnectGameRoomPlayer = async (socket: Socket, io: GameIoNamespace) => {
  try {
    logger.info(
      socket.data.user,
      "Disconnecting player...",
      "from room ",
      socket.data.room
    );
    const user: User = socket.data.user;
    const room: SocketGameRoom = socket.data.room;
    if (!room || !user) return;
    const mode = getGameMode(room.mode)
    // check if game room player exists
    const player = await getGameRoomPlayer(socket.data.user.id);
    if (!player) return;
    console.log("Disconnected socket rooms", socket.rooms);
    // remove user from all rooms
    const socketRooms = Array.from(socket.rooms);
    for (let r = 0; r < socketRooms.length; r++) {
      if (r > 0) {
        socket.leave(socketRooms[r]);
      }
    }
    // broadcasting to the room that a player has left
    socket.to(room.id).emit(
      GameEventEnum.MESSAGE,
      composeMessage({
        playerName: "SWEN",
        content: `${user.name}, has left!`,
      })
    );
    // remove player from game room
    const totalParticipants = await removeGameRoomPlayer(room.id, user.id, room.mode);
    const roomStrArr = room?.id.split("_");
    const parentRoomId = roomStrArr[0]
    console.log(
      "Discon totalParticipants ",
      totalParticipants,
      " parentRoomId ",
      parentRoomId
    );
    io.emit(GameEventEnum.GAME_ROOM_PARTICIPANTS, {
      roomId: parentRoomId,
      count: totalParticipants,
    });
    // broadcast the players present in the room
    const players = await getGameRoomPlayersWithRank(room.id, room.catId, room.mode);
    // clean up room data if no players in the room
    if (players.length === 0) {
      await cleanUpGameRoom(room.id);
    }
    socket.broadcast.to(room.id).emit(GameEventEnum.GAME_ROOM_PLAYERS, players);
    // sync redis user game energy to prisma
    syncUserRedisGameEnergyToPrisma(user.id, room.catId, mode);
    // sync redis user wallet to prisma
    syncUserRedisWalletToPrisma(user.id);
    // disconnect the socket
    // socket.disconnect();
  } catch (error) {
    logGameError('disconnectGameRoomPlayer', error, {});}
};

export const getGameRoom = async (roomId: string) => {
  try {
    const uniqueKey = `room:${roomId}`;
    const result = await redisClient.hGetAll(uniqueKey);
    if (Object.keys(result).length === 0) {
      return null;
    }
    return result as unknown as TempGameRoom;
  } catch (error) {
    logGameError('getGameRoom', error, {roomId});
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

async function updateWinningStreak(
  {
    catId,
    roomId,
    playerId,
    mode
  }: {
    catId: string;
    roomId: string;
    playerId: string;
    mode: string
  },
  io: GameIoNamespace
): Promise<void> {
  try {
    if (typeof mode !== 'string' || !['SINGLE', 'MULTI'].includes(mode.toUpperCase())) {
      logger.error({event: 'game_streak_invalid_mode', roomId});
      return;
    }
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
          cents(milestone.reward);
          const result = await walletOperation('room-streak', `${playerId}:${catId}:${milestone.id}`, { playerId, catId, milestoneId: milestone.id }, [playerId], async (tx) => {
            // insert achievement
            const achievement = await tx.gameAchievement.create({
              data: {
                amount: milestone.reward,
                reason: milestone.reason,
                rewardType: RewardTypeEnum.BONUS,
                milestoneId: milestone.id,
                catId,
                playerId,
                mode: mode.toUpperCase() as GameMode,
                description: `You won ${milestone.reward} ${
                  TxnCurrencyEnum.COINS
                } & a badge for achieving ${milestone.reason
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
                source: TxnSourceEnum.BONUS,
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
  } catch (error) {
    logGameError('updateWinningStreak', error, {catId,roomId,playerId,mode});}
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
      const [first, ...rest] = backup;
      if (first !== undefined) await redisClient.json.arrAppend(uniqueKey, "$", first, ...rest);
    }
  } catch (error: any) {
    logGameError('backupGamePlayersScores', error, {});

  }
}

async function updateGamePlayersScoresDb(data: ThemedGameScoreStat[]) {
  try {
    // Attempt to save in Prisma within a transaction
    await prisma.$transaction(
      data.map(({ playerId, score, month, year, catId, mode }) =>
        prisma.gameMonthStat.upsert({
          where: {
            playerId_catId_year_month_mode: { playerId, month, year, catId, mode },
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
            mode
          },
        })
      )
    );
  } catch (error) {
    logGameError('updateGamePlayersScoresDb', error, {});
    backupGamePlayersScores(data);
  }
}

export const updateGamePlayersScores = async (scores: ThemedGameScore[]) => {
  // get utc month & date to track player score by month, year and overall
  if (!scores.length) return;
  const mode = getGameMode(scores[0].mode)
  const stat = getCurrentDataInfo();
  const persistData: ThemedGameScoreStat[] = scores.map((item) => ({
    score: item.score,
    playerId: item.playerId,
    catId: item.catId,
    roomId: item.roomId,
    mode: item.mode,
    ...stat,
  }));

  const totalScore = persistData.reduce((acc, item) => acc + item.score, 0);

  try {
    // perform pipeline update
    await Promise.all(
      scores.map(async (item) => {
        // get ranking keys
        const rankingKeys = getRankingKeys(item.catId, mode);
        // player hash unique keys
        const playerKeys = getPlayerRedisKeys(item.playerId, item.catId, mode);
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
  } catch (error) {
    logGameError('updateGamePlayersScores', error, {});}
};

export const updatePlayerGameEnergy = async (
  socket: Socket,
  params: PlayerGameEnergy
) => {
  try {
    console.log("Game energy incoming request ", params);
    // const playerKeys = getPlayerRedisKeys(params.playerId, params.catId);
    const uKey = `player:${params.playerId}:cat:${params.catId}:energy`
    await Promise.all([
      redisClient.hSet(uKey, "amount", params.amount),
      redisClient.hSet(uKey, "gauge", params.gauge),
      redisClient.hSet(uKey, "turbo", params.turbo),
    ]);
    // emit back
    socket.emit(GameEventEnum.GAME_PLAYER_ENERGY, params);
    logger.info(`Redis game room player's energy updated`);
  } catch (error: any) {
    logGameError('updatePlayerGameEnergy', error, params);

  }
};

export const updatePlayersGameEnergy = async (
  scores: ThemedGameScore[],
  io: GameIoNamespace
) => {
  try {
    const result = await Promise.all(
      scores.map(async (item) => {
        // get user keys
        const mode = getGameMode(item.mode)
        const playerKeys = getPlayerRedisKeys(item.playerId, item.catId, mode);
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
    logGameError('updatePlayersGameEnergy', error, {});

  }
};

export const isGameRoomExists = async (roomId: string) => {
  try {
    const exists = await redisClient.exists(`room:${roomId}`);
    return exists === 1;
  } catch (error) {
    logGameError('isGameRoomExists', error, {roomId});
    return false;
  }
};

export const updateGameRoom = async (params: TempGameRoom) => {
  const timer = params.timer ?? getRandomNumber(10, 20, true);
  const roomKey = `room:${params.roomId}`;
  // console.log(`Update room - ${roomKey} payload `, { ...params, timer } )
  await redisClient.hSet(roomKey, { ...params, timer });
};

export const notifyGameRoomPlayers = ({roomId, io, mode, totalPlayers}:{roomId: string,
  totalPlayers: number,
  mode: GameMode,
  io: GameIoNamespace
}) => {
  // broadcasting to the room the total number of participants
  const minPlayers = 3 - totalPlayers;
  io.to(roomId).emit(
    GameEventEnum.NOTIFY_MESSAGE,
    mode === GameMode.SINGLE ? `Swem says, get ready!` : `We have ${totalPlayers} ${
      totalPlayers === 1 ? "player" : "players"
    } & waiting for ${minPlayers} to start!`
  );
};

const composeTimerKey = (name: string) => {
  return name.toLowerCase()
}

// this function checks if the number of players in the room are up 3
export const checkGameNumPlayers = async (room: TempGameRoom, io: GameIoNamespace) => {
  const totalPlayers = await getTotalRoomPlayers(room.roomId);
  console.log("checkGameNumPlayers totalPlayers ", totalPlayers, " room ", room);
  if (totalPlayers === 0) return;
  if (totalPlayers < 2 && room.mode === GameMode.MULTI) {
    await notifyGameRoomPlayers({roomId: room.roomId, mode: room.mode, totalPlayers, io});
    await updateGameRoom({ ...room, status: GameStatusEnum.CHAT });
    await gameChatTime(room.roomId, io);
    return;
  }
  // Persistent quiz inventory; existing local word/luck generators are unchanged.
  let gameQuestion: ThemedGameQuestion | undefined;
  try { gameQuestion = await generateRoomQuestion(room); }
  catch (error) {
    logGameError('checkGameNumPlayers', error, room);
    if (error instanceof InventoryEmptyError) {

    } else {

    }
  }
  const gameType = getGameType(room.gameName);
  const catType = getGameCatType(room.catName);
  if (!gameQuestion) {
    io.to(room.roomId).emit(
      GameEventEnum.NOTIFY_MESSAGE,
      "Swen says, you can chat now"
    );
    await updateGameRoom({ ...room, status: GameStatusEnum.CHAT });
    await gameChatTime(room.roomId, io);
    return;
  }
  //   store in redis based on the game room

  // mode
  const mode = getGameMode(room.mode)
  const timerKey = (`${mode}_${room.catName}`).toLowerCase()
  const timers = {
    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.LUCKYSPIN}`)]: 10,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.LUCKYSPIN}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.LUCKYFLIP}`)]: 10,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.LUCKYFLIP}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.LUCKYWHIZ}`)]: 10,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.LUCKYWHIZ}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.UNSCRAMBLE}`)]: 15,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.UNSCRAMBLE}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.HANGMAN}`)]: 15,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.HANGMAN}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.WORDMAKER}`)]: 15,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.WORDMAKER}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.TYPEMANIA}`)]: 15,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.TYPEMANIA}`)]: 15,

    [composeTimerKey(`${GameMode.SINGLE}_${GameCatType.ANAGRAM}`)]: 15,
    [composeTimerKey(`${GameMode.MULTI}_${GameCatType.ANAGRAM}`)]: 15,
  }

  // const initTimer = timers[timerKey] ?? 20

  // console.log(" timerKey timerKey timerKey", timerKey, initTimer)

  const timer = timers[timerKey] ?? 15 //gameType === GameType.ACRONYM ? 25 : initTimer

  const storedQuestion = await storeGameRoomQuestion(room.roomId, {...gameQuestion,
    answerUntil:Date.now()+timer*1000, voteUntil:Date.now()+(timer+12)*1000});
  if (!storedQuestion) return;
  await updateGameRoom({
    ...room,
    status: GameStatusEnum.PLAY,
    timer,
  });
  //   store in redis based on the game room
  io.to(room.roomId).emit(
    GameEventEnum.NOTIFY_MESSAGE,
    "Swen says, get ready!"
  );
  await gamePlayTime(room.roomId, io, storedQuestion);
};

// this function signifies time for voting
export const getGameResult = async (roomId: string, io: GameIoNamespace) => {
  const room = await getGameRoom(roomId);
  if (!room) return;
  if (!['SINGLE','MULTI'].includes(room.mode)) {
    logger.error({event: 'game_room_invalid_mode', roomId});
    io.to(roomId).emit(GameEventEnum.GAME_ERROR_NOTIFY, 'This room has invalid game settings. Please rejoin.');
    return;
  }
  // // get all the game answers for a particular room when answering is done
  // calculate players points
  const gameRoomScore = await calculateGameRoomPoints(room);
  // persuade users to play when no game answers are available
  if (gameRoomScore.length === 0) {
    io.to(roomId).emit(
      GameEventEnum.MESSAGE,
      composeMessage({ content: "Please don't forget to always play!" })
    );
    await resetRoomStreak(room.roomId);
  }
  // check if gamePoints is not empty
  if (gameRoomScore.length > 0) {
    // update game room streak and game achievement or set game room streak
    const item = gameRoomScore[0];
    if(item.score > 0){
      await updateWinningStreak({...item, mode: room.mode}, io)
    }else{
      await resetRoomStreak(item.roomId);
    } 
    // update players game energy
    await updatePlayersGameEnergy(gameRoomScore, io);
    //   emit event to client
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_SCORE, gameRoomScore);
    // update game points
    await updateGamePlayersScores(gameRoomScore);
    //   send in game room players
    const players = await getGameRoomPlayersWithRank(roomId, room.catId, room.mode);
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_PLAYERS, players);
  } else {
    // reset game room streak
    await resetRoomStreak(room.roomId);
  }
  // chat again
  await gameChatTime(roomId, io, true);
  // if(room.mode === GameMode.MULTI){

  // }
  // else{
  //   checkGameNumPlayers(room, io);
  // }

};

// when it's play time
export const gamePlayTime = async (
  roomId: string,
  io: GameIoNamespace,
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
  let ticking = false;
  const interval = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
    --countdown;
    const isExists = await isGameRoomExists(roomId);
    if (!isExists) return clearInterval(interval);
    await updateGameRoom({
      ...room,
      status,
      roomId,
      catId: room.catId,
      timer: countdown,
    });
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_STATE, { status, countdown });
    if (countdown < 1) {
      clearInterval(interval);
      const gameType = getGameType(room.gameName);
      if (gameType === GameType.ACRONYM) {
        await updateGameRoom({
          ...room,
          status: GameStatusEnum.VOTE,
          roomId,
          catId: room.catId,
        });
        await gameVoteTime({ ...room, status: GameStatusEnum.VOTE }, io);
      } else {
        await updateGameRoom({
          ...room,
          status: GameStatusEnum.CHAT,
          roomId,
          catId: room.catId,
        });
        await getGameResult(roomId, io);
      }
    }
    })().catch(error => {
      logGameError('gamePlayTime', error, {roomId});
      clearInterval(interval);

      io.to(room.roomId).emit(GameEventEnum.GAME_ERROR_NOTIFY, 'This round could not continue. Please rejoin the room.');
    }).finally(() => {ticking = false;});
  }, 1000);
};

export const gameChatTime = async (
  roomId: string,
  io: GameIoNamespace,
  notify?: boolean
) => {
  const room = await getGameRoom(roomId);
  if (!room) return;
  const status = room.status;
  const isSolo = room.mode === GameMode.SINGLE
  let countdown = isSolo  ? 5 : room.timer ?? 1;
  // emit initial message
  if (notify) {
    io.to(roomId).emit(GameEventEnum.NOTIFY_MESSAGE, isSolo ? "Get ready!" : "You can chat now!");
  }
  // set interval
  let ticking = false;
  const interval = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
    --countdown;
    const isExists = await isGameRoomExists(roomId);
    if (!isExists) return clearInterval(interval);
    // emit to the client side
    io.to(roomId).emit(GameEventEnum.GAME_ROOM_STATE, { status, countdown });
    // update game timer
    await updateGameRoom({
      ...room,
      roomId,
      catId: room.catId,
      status,
      timer: countdown,
    });
    if (countdown < 1) {
      clearInterval(interval);
      // delete any previous game question & user answers
      await deleteGameRoomQuestionAndAnswers(room.roomId);
      await checkGameNumPlayers(room, io);
    }
    })().catch(error => {
      logGameError('gameChatTime', error, {roomId});
      clearInterval(interval);

      io.to(room.roomId).emit(GameEventEnum.GAME_ERROR_NOTIFY, 'This round could not continue. Please rejoin the room.');
    }).finally(() => {ticking = false;});
  }, 1000);
};

// this function signifies time for voting
const gameVoteTime = async (room: TempGameRoom, io: GameIoNamespace) => {
  // get all the game answers for a particular room when answering is done
  const answers = await retrieveGameRoomAnswers<AcronymGameAnswer>(room.roomId);
  if (answers.length === 0) {
    await updateGameRoom({
      ...room,
      status: GameStatusEnum.CHAT,
    });
    await getGameResult(room.roomId, io);
    return;
  }
  io.to(room.roomId).emit(
    GameEventEnum.NOTIFY_MESSAGE,
    "It's voting time now!"
  );
  const status = room.status;
  let countdown = 12;
  // emit to the client side
  io.to(room.roomId).emit(GameEventEnum.GAME_ROOM_STATE, { status, countdown });
  //   emit event to client
  const roomAnswers = answers.sort((a, b) => b.timer - a.timer);
  io.to(room.roomId).emit(GameEventEnum.GAME_ROOM_ANSWERS, roomAnswers);
  // interval
  let ticking = false;
  const interval = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
    countdown--;
    // emit to the client side
    io.to(room.roomId).emit(GameEventEnum.GAME_ROOM_STATE, {
      status,
      countdown,
    });
    await updateGameRoom({
      ...room,
      status,
      timer: countdown,
    });
    if (countdown < 1) {
      clearInterval(interval);
      await updateGameRoom({
        ...room,
        status: GameStatusEnum.CHAT,
      });
      await getGameResult(room.roomId, io);
    }
    })().catch(error => {
      logGameError('gameVoteTime', error, room);
      clearInterval(interval);

      io.to(room.roomId).emit(GameEventEnum.GAME_ERROR_NOTIFY, 'This round could not continue. Please rejoin the room.');
    }).finally(() => {ticking = false;});
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
    logGameError('createGame', error, args);
    return { status: 500, data: null, message: error?.message };
  }
};

export const getGames = async () => {
  try {
    const result = await prisma.game.findMany({});
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    logGameError('getGames', error, {});
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
    logGameError('createGameCategory', error, args);
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
    logGameError('createGameCategoryRoom', error, args);
    return { status: 500, data: error?.message };
  }
};

export const getGameCategories = async (gameId: string) => {
  try {
    const game = await prisma.game.findUniqueOrThrow({where: { id: gameId }})
    const categories = await prisma.gameCategory.findMany({ where: { gameId } });
    return { status: 200, data: {game, categories}, message: "success" };
  } catch (error: any) {
    logGameError('getGameCategories', error, {gameId});
    return { status: 500, data: null, message: error?.message };
  }
};

export const getGameCategoryRooms = async (catId: string, mode: string) => {
  try {
    const rooms = await prisma.gameRoom.findMany({ where: { catId } });
    // Fetch participant counts from Redis for each room
    const result = await Promise.all(
      rooms.map(async (room) => {
        const count = await getTotalRoomParticipants(`${mode}-${room.id}`);
        return {
          ...room,
          participants: count, // Default to 0 if not set
        };
      })
    );
    return { status: 200, data: result, message: "success" };
  } catch (error: any) {
    logGameError('getGameCategoryRooms', error, {catId});
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
    logGameError('getGameCategoryRoom', error, {roomId});
    return { status: 500, data: error?.message };
  }
};


export const checkGameRoom = async (roomId: string) => {
  try {
    return await prisma.gameRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { category: { include: { game: true } } },
    });
  } catch (error: any) {
    logGameError('checkGameRoom', error, {roomId});
    return null;
  }
};

export const getGamePlayerRankings = async (
  userId: string,
  rankType: "today" | "week" | "month",
  mode: "single" | "multi"
) => {
  try {
    const keyPatterns = getPlayerRedisKeys(userId, "*", mode);
    const pattern =
      rankType === "today"
        ? keyPatterns.today
        : rankType === "week"
        ? keyPatterns.week
        : keyPatterns.month;
    // Use SCAN to fetch a batch of keys
    const { keys } = await redisClient.scan('0', {
      COUNT: 50000,
      MATCH: pattern,
    });
    // ranking store
    const rankings = [];
    // loop through keys and get player rank for each category
    for (const key of keys) {
      const catId = extractCatId(key);
      if (!catId) break;
      // get category details
      const category = await prisma.gameCategory.findUnique({
        where: { id: catId },
        include: { game: { select: { id: true, name: true } } },
      });
      if (!category) break;
      // get ranking
      const rankingKeys = getRankingKeys(catId, mode);
      const rankingKey =
        rankType === "today"
          ? rankingKeys.today
          : rankType === "week"
          ? rankingKeys.week
          : rankingKeys.month;
      // get player data
      const infoKey = keyPatterns.info.replace("*", catId);
      const playerData = await getRedisHashKey<{
        id: string;
        name: string;
        createdAt: string;
        lastLoggedIn: string;
      }>(infoKey);
      if (!playerData) break;
      // get cat stats
      const playerCatStats = await getRedisHashKey<{
        score: number;
        numPlayed: number;
      }>(key);
      if (!playerCatStats) break;
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, userId);
      rankings.push({
        category,
        ...playerData,
        ...playerCatStats,
        rank: playerRank !== null ? playerRank + 1 : 0,
      });
    }

    return { status: 200, data: rankings };
  } catch (error: any) {
    logGameError('getGamePlayerRankings', error, {userId});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};


export const getGameWinnersStats = async () => {
  try {
    // Fetch all years
    const distinctYearStats = await prisma.gameMonthStat.groupBy({
      by: ["year"],
    });

    // Process each year's stats
    const rankingStats = await Promise.all(
      distinctYearStats.map(async (item) => {
        const { year } = item;

        // Fetch all months for the year
        const monthStats = await prisma.gameMonthStat.groupBy({
          by: ["month"],
          where: { year },
        });

        // Process each month
        const monthCatStats = await Promise.all(
          monthStats.map(async (monthStat) => {
            const { month } = monthStat;

            // Fetch categories for the month and year
            const categories = await prisma.gameMonthStat.groupBy({
              by: ["catId"],
              where: { year, month },
            });

            // Collect all category IDs
            const categoryIds = categories.map((c) => c.catId);

            // Fetch category details in bulk
            const categoryDetails = await prisma.gameCategory.findMany({
              where: { id: { in: categoryIds } },
              include: { game: true },
            });

            // Fetch reward stats in bulk
            const rewardStats = await prisma.gameMonthRewardStat.findMany({
              where: { catId: { in: categoryIds }, year, month },
            });

            // Map categories to include their details and reward stats
            const cats = categories.map((c) => {
              const catDetails = categoryDetails.find(
                (cat) => cat.id === c.catId
              );
              const rewardStat = rewardStats.find((rs) => rs.catId === c.catId);
              return { cat: catDetails, rewardStats: rewardStat };
            });

            return { ...monthStat, categories: cats };
          })
        );

        return { ...item, stats: monthCatStats };
      })
    );
    if(rankingStats.length === 0){
      return { status: 404, data: "no found"}
    }
    return { status: 200, data: rankingStats };
  } catch (error: any) {
    logGameError('getGameWinnersStats', error, {});
    console.error("Error fetching game winners' stats:", error);
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getGameWinners = async ({
  page,
  limit,
  month,
  year,
  catId,
}: {
  page: number;
  limit: number;
  month: number;
  year: number;
  catId: string;
}) => {
  try {
    const skip = (page - 1) * limit;
    const result = await prisma.gameMonthStat.findMany({
      where: { year, month, catId, rank: { gt: 0 } },
      skip,
      take: limit,
      orderBy: [{ rank: "asc" }],
      include: { player: true },
    });
    const data = await Promise.all(
      result.map(async (item) => {
        const { player, ...rest } = item;
        // get reward txn if any
        const txn = await prisma.transaction.findFirst({
          where: {
            userId: rest.playerId,
            category: "GAME_MONTHLY_REWARD",
            type: "CREDIT",
            metadata: { equals: { year: rest.year, month: rest.month } },
          },
        });
        // return
        return { ...rest, txn, name: player.name };
      })
    );
    return {
      status: data.length === 0 ? 404 : 200,
      data: data.length > 0 ? data : "Not found",
    };
  } catch (error: any) {
    logGameError('getGameWinners', error, {catId});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getGameCategoriesRankings = async (
  rankType: "today" | "week" | "month",
  mode: "single" | "multi"
) => {
  try {
    const keyPatterns = getRankingKeys("*", mode);
    const pattern =
      rankType === "today"
        ? keyPatterns.today
        : rankType === "week"
        ? keyPatterns.week
        : keyPatterns.month;
     console.log("ranking key patterns ", pattern)
    // Use SCAN to fetch a batch of keys
    const { keys } = await redisClient.scan('0', {
      COUNT: 50000,
      MATCH: pattern,
    });
    console.log("found keys ", keys)
    // ranking store
    const rankings = [];
    // loop through keys and get player rank for each category
    for (const key of keys) {
      const catId = extractCatId(key);
      if (!catId) break;
      // get category details
      const category = await prisma.gameCategory.findUnique({
        where: { id: catId },
        include: { game: { select: { id: true, name: true } } },
      });
      if (!category) break;
      // get total participants
      const totalParticipants = await redisClient.zCard(key);
      rankings.push({ ...category, totalParticipants });
    }
    return { status: 200, data: rankings };
  } catch (error: any) {
    logGameError('getGameCategoriesRankings', error, {});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getGamesRankingArchiveStats = async () => {
  try {
    const now = new Date();
    const beginningOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Get all distinct years
    const distinctYearStats = await prisma.gameMonthStat.groupBy({
      by: ["year"],
      // where: { createdAt: { lt: beginningOfMonth}}
    });

    // Fetch ranking stats for each year
    const rankingStats = await Promise.all(
      distinctYearStats.map(async (item) => {
        // Fetch all months for the given year
        const monthStats = await prisma.gameMonthStat.groupBy({
          by: ["month"],
          where: { year: item.year },
        });

        // Fetch categories for each month
        const monthCatStats = await Promise.all(
          monthStats.map(async (m) => {
            // Fetch categories and counts for the specific month and year
            const categories = await prisma.gameMonthStat.groupBy({
              by: ["catId"],
              _count: {
                _all: true,
              },
              where: { year: item.year, month: m.month },
            });

            // Fetch category details in bulk to avoid individual queries
            const categoryIds = categories.map((c) => c.catId);
            const categoryDetails = await prisma.gameCategory.findMany({
              where: { id: { in: categoryIds } },
              include: { game: true },
            });

            // Map category stats with their details
            const cats = categories.map((c) => {
              const catDetails = categoryDetails.find(
                (cat) => cat.id === c.catId
              );
              return { cat: catDetails, totalParticipants: c._count._all };
            });

            return { ...m, categories: cats };
          })
        );

        return { ...item, stats: monthCatStats };
      })
    );
    if(rankingStats.length === 0){
      return { status: 404, data: "Not found"}
    }
    return { status: 200, data: rankingStats };
  } catch (error: any) {
    logGameError('getGamesRankingArchiveStats', error, {});
    console.error("Error fetching ranking stats:", error);
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getGamesRankingArchiveData = async ({
  page,
  limit,
  month,
  year,
  catId,
}: {
  page: number;
  limit: number;
  month: number;
  year: number;
  catId: string;
}) => {
  try {
    const skip = (page - 1) * limit;
    // get archive data
    const result = await prisma.gameMonthStat.findMany({
      // where: { year, month, catId, rank: { gt: 0 } },
      where: { year, month, catId },
      skip,
      take: limit,
      orderBy: [{ rank: "asc" }],
      include: { player: true },
    });
    // format data
    const data = result.map((item) => {
      const { player, ...rest } = item;
      return { ...rest, name: player.name };
    });
    return {
      status: data.length === 0 ? 404 : 200,
      data: data.length > 0 ? data : "Not found",
    };
  } catch (error: any) {
    logGameError('getGamesRankingArchiveData', error, {catId});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getUserGamesRankingArchiveStats = async (userId: string) => {
  try {
    // get distinct count
    const distinctStats = await prisma.gameMonthStat.groupBy({
      where: { playerId: userId },
      by: ["catId", "month", "year"], // Group by these fields
    });
    // get the related data
    const data = await Promise.all(
      distinctStats.map(async (item) => {
        const category = await prisma.gameCategory.findUniqueOrThrow({
          where: {
            id: item.catId,
          },
          include: { game: true },
        });
        return {
          ...category,
          catId: item.catId,
          month: item.month,
          year: item.year,
        };
      })
    );
    return { status: 200, data };
  } catch (error: any) {
    logGameError('getUserGamesRankingArchiveStats', error, {userId});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};

export const getUserGameRankingArchiveData = async ({
  month,
  year,
  catId,
  userId,
}: {
  month: number;
  year: number;
  catId: string;
  userId: string;
}) => {
  try {
    // get archive data
    const result = await prisma.gameMonthStat.findFirst({
      where: {
        year,
        month,
        catId,
        playerId: userId,
      },
      take: 1,
      include: { player: true },
    });
    if (!result) return { status: 404, data: "Not found." };
    // format data
    const { player, ...rest } = result;
    return { status: 200, data: { ...rest, name: player.name } };
  } catch (error: any) {
    logGameError('getUserGameRankingArchiveData', error, {catId,userId});
    return {
      status: 500,
      data: "Sorry an error occurred, please try again later.",
    };
  }
};



async function clearRedisKeysByPattern(pattern: string) {
  try {
    // clear players stats redis keys
    let cursor = '0'; // Initial cursor
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
    } while (cursor !== '0'); // SCAN stops when cursor is back to '0'

    logger.info(`All matching ${keyCounts} keys have been deleted.`);
  } catch (error: any) {
    logGameError('clearRedisKeysByPattern', error, {});

  }
}


/** Log failures with operation/IDs only; never serialize game answers, chat or user payloads. */
function logGameError(operation: string, error: unknown, context: unknown = {}) {
  const ids: Record<string,string> = {};
  if (context && typeof context === 'object') for (const key of ['roomId','playerId','userId','catId','gameId','qId','mode']) {
    const value = (context as Record<string,unknown>)[key];
    if (typeof value === 'string') ids[key] = value.slice(0,150);
  }
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Non-Error game operation failure');
  const details = {event: 'game_service_error', operation, ...ids, err};
  if (error instanceof InventoryEmptyError) logger.warn(details, 'Game inventory temporarily unavailable');
  else logger.error(details, 'Game service operation failed');
}
