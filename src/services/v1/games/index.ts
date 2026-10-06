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
    logger.info("cleaning up game room ", roomId);
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
      await redisClient.json.arrAppend(uniqueKey, "$", ...backup);
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
    const { keys } = await redisClient.scan(0, {
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
    const { keys } = await redisClient.scan(0, {
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
    logGameError('createDummyUsers', error, {});

  }
};

// export const createDummyRedisMonthlyScoreRecord = async () => {
//   try {
//     const batchSize = 500;
//     let counter = 0;
//     const total = await prisma.user.count();
//     while (counter < total) {
//       const users = await prisma.user.findMany({
//         skip: counter,
//         take: batchSize,
//       });
//       if (users.length === 0) break;
//       // insert new users into redis database
//       const categories = await prisma.gameCategory.findMany({});

//       if (categories.length === 0) break;

//       for (const category of categories) {
//         const rankingKeys = getRankingRewardKeys(category.id, "multi");
//         const spentKey = getSpentCoinsKey({
//           gameId: category.gameId,
//           catId: category.id,
//         });
//         const fakeUserScore = users.map((user) => {
//           // insert fake redis user details
//           redisClient.hSet(
//             `player:${user.id}:category:${category.id}:${2024}`,
//             {
//               id: user.id,
//               name: user.username,
//               createdAt: new Date().toISOString(),
//               lastLoggedIn: new Date().toISOString(),
//             }
//           );
//           // fake score
//           const numPlayed = getRandomNumber(2000, 20_000, true);
//           const score = getRandomNumber(20_000, 2_000_000, true);
//           // insert fake month player data
//           redisClient.hSet(
//             `player:${user.id}:category:${
//               category.id
//             }:${2024}:${11}:month:${11}`,
//             {
//               score,
//               numPlayed,
//             }
//           );
//           // fake month stat
//           // update category total players score and num played
//           redisClient.hSet(rankingKeys.rewardMonthStat, {
//             score: getRandomNumber(5_000_000_000, 20_000_000_000, true),
//             numPlayed: getRandomNumber(1_000_000, 10_000_000, true),
//           }),
//             // fake user scores
//             redisClient.zAdd(rankingKeys.rewardMonth, {
//               value: user.id,
//               score: score,
//             });
//           // fake total coins spent
//           redisClient.hSet(spentKey, {
//             coins: getRandomNumber(8_000_000_000, 30_000_000_000),
//             bonus: getRandomNumber(100_000_000, 500_000_000),
//             gameId: category.gameId,
//             catId: category.id,
//           });
//         });
//         await Promise.all(fakeUserScore);
//       }

//       counter += users.length;

//       console.log(`bATCH: ${counter} created successfully`);
//     }
//     logger.info(`Dummy monthly game score created successfully`);
//   } catch (error: any) {
//     console.log(`Error: Creating monthly dummy data failed ~ `, error?.message);
//   }
// };

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
    logGameError('clearRedisKeysByPattern', error, {});

  }
}

const insertPlanFeatures = async () => {
  try {
    await prisma.planFeature.createMany({
      data: [
        {
          name: "Exclusive Experience",
          planId: "cm53oc8a50000vwfy8sdlzh1f",
          items: [
            {id: generateUniqueRef(), title: "Reply and profile boost", description: "Small" },
            {id: generateUniqueRef(), title: "Earn standard rewards", description: "" },
            {id: generateUniqueRef(), title: "Contains non-intrusive ads", description: "" },
            {id: generateUniqueRef(), title: "Send/receive friend requests in game rooms", description: "" }
          ]
        },
        // organization
        {
          name: "Exclusive Experience",
          planId: "cm53oc8a50003vwfyz79hdaet",
          items: [
            {
              id: generateUniqueRef(),
              title: "Reply and profile boost",
              description: "Larger",
            },
            {
              id: generateUniqueRef(),
              title: "Priority placement in search suggestions",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Priority support for reports and issues.",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Partial Ads browsing experience",
              description: "",
            },
          ],
        },
        {
          name: "Exclusive Experience",
          planId: "cm53oc8a50004vwfy508n9x9u",
          items: [
            {
              id: generateUniqueRef(),
              title: "Reply and profile boost",
              description: "Largest",
            },
            {
              id: generateUniqueRef(),
              title: "Priority placement in search suggestions",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Priority support for reports and issues.",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Ads-free browsing experience",
              description: "",
            },
          ],
        },
        // government
        {
          name: "Exclusive Experience",
          planId: "cm53oc8a50006vwfyxyk8b7sq",
          items: [
            {
              id: generateUniqueRef(),
              title: "Reply and profile boost",
              description: "Larger",
            },
            {
              id: generateUniqueRef(),
              title: "Priority placement in search suggestions",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Priority support for reports and issues.",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Partial Ads browsing experience",
              description: "",
            },
          ],
        },
        {
          name: "Exclusive Experience",
          planId: "cm53oc8a50006vwfyxyk8b7sq",
          items: [
            {
              id: generateUniqueRef(),
              title: "Reply and profile boost",
              description: "Largest",
            },
            {
              id: generateUniqueRef(),
              title: "Priority placement in search suggestions",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Priority support for reports and issues.",
              description: "",
            },
            {
              id: generateUniqueRef(),
              title: "Ads-free browsing experience",
              description: "",
            },
          ],
        },
      ],
    });
    console.log("Inserted plan features");
  } catch (error: any) {
    logGameError('insertPlanFeatures', error, {});
    console.log("Error: Plan Features ", error?.message);
  }
};

const addGameCategories = async () => {
  const games = [
    {
      name: "Trivia & Quiz",
      description:
        "Fast-paced games requiring quick thinking, precise timing, and swift reactions",
    },
    {
      name: "Acronym Arcade",
      description:
        "Test your wit and speed in this fun-filled game of guessing acronyms — perfect for quick thinkers!",
    },
    {
      name: "MindMash",
      description:
        "Brain games that challenge your thinking and reflexes, featuring word puzzles, typing races, and problem-solving challenges.",
    },
    {
      name: "Academia Adventure",
      description:
        "Test your knowledge on everything from math to history and prove you're the ultimate academic adventurer",
    },
    {
      name: "Sports & Games",
      description:
        "Explore the world of sports, athletes, and games from popular global sports like football, soccer, basketball in a diverse array of questions and challenge participants",
    },
    {
      name: "Country Mania",
      description:
        "Test your geographical skills by answering questions about flags, capitals, landmarks in a fun and interactive way!",
    },
  ];

  const triviaGroups = [
    {
      name: "Themed Quest",
      description: "Embark on a journey through themed challenges",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Olympic Games",
        "Famous Athletes",
        "Football & Basketball",
        "Esports & Gaming",
        "Unusual Sports",
        "Board Games Trivia",
        "Cricket & Baseball",
        "Extreme Sports",
      ],
    },
    {
      name: "Science & Technology",
      description:
        "Dive into the wonders of science and technological advancements.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Space Exploration",
        "Scientific Discoveries",
        "Animal Kingdom",
        "The Solar System",
        "Human Anatomy",
        "Physics in Action",
        "Chemistry Around Us",
        "Breakthrough Experiments",
        "Breakthrough Experiments",
        "Famous Scientists",
        "Physics in Everyday Life",
        "Human Evolution",
      ],
    },
    {
      name: "History & Geography",
      description: "Learn about historical events and geographic wonders.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Ancient Civilizations",
        "World Wars",
        "Historic Inventions",
        "Geographic Wonders",
        "Capitals & Countries",
        "Historic Leaders",
        "Revolutions in History",
        "Famous Explorers",
      ],
    },
    {
      name: "Pop Culture",
      description: "Test your knowledge of movies, TV, music, and celebrities.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Movies & TV",
        "Famous Books",
        "Music Through the Decades",
        "Superheroes & Comics",
        "Internet Culture",
        "Celebrity Gossip",
        "Animation & Cartoons",
        "Streaming Platforms",
      ],
    },
    {
      name: "Culture & Lifestyle",
      description:
        "Discover cultural traditions and lifestyle trends around the world.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Foods & Drinks",
        "World Festivals",
        "Fashion Through History",
        "Art Movements",
        "Myths & Legends",
        "Indigenous Tribes",
        "Traditional Dances",
      ],
    },
    {
      name: "Literature & Language",
      description: "Celebrate the beauty of words, literature, and language.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Quotes",
        "Word Origins",
        "Global Languages",
        "Classic Novels",
        "Literary Genres",
        "Poetry Across Cultures",
        "Famous Authors",
        "Word Play and Riddles",
      ],
    },
    {
      name: "Entertainment & Media",
      description:
        "From Hollywood to the internet, dive into entertainment trivia.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Hollywood Trivia",
        "Iconic TV Shows",
        "Award Ceremonies",
        "Famous Directors",
        "Internet Trends",
        "Viral Videos",
        "Movie Quotes",
        "Video Games Evolution",
      ],
    },
    {
      name: "Nature & Environment",
      description: "Explore the beauty and challenges of the natural world.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Endangered Species",
        "National Parks",
        "Natural Disasters",
        "Environmental Activism",
        "Plants & Trees",
        "Ocean Mysteries",
        "Global Wildlife",
        "Conservation Heroes",
      ],
    },
    {
      name: "Technology Trends",
      description:
        "Keep up with the latest trends in technology and innovation.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Innovations of the 21st Century",
        "Famous Tech Companies",
        "History of Computers",
        "Smartphones & Gadgets",
        "Artificial Intelligence",
        "Renewable Energy",
        "Virtual Reality",
        "Robotics",
      ],
    },
    {
      name: "World Cultures",
      description: "Learn about global cultures, religions, and traditions.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Global Religions",
        "Exotic Customs",
        "Unique Festivals",
        "Cultural Etiquettes",
        "Iconic Artifacts",
        "World Cuisines",
        "Legendary Kings and Queens",
        "Languages of the World",
      ],
    },
    {
      name: "Fun & Riddles",
      description: "Enjoy brain-teasing puzzles and entertaining trivia.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Brain Teasers",
        "Logical Puzzles",
        "Tongue Twisters",
        "Word Scrambles",
        "General Fun Facts",
      ],
    },
    {
      name: "Travel & Destinations",
      description: "Discover iconic landmarks and hidden travel gems.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Landmarks",
        "Exotic Beaches",
        "Hidden Travel Gems",
        "Travel Tips & Hacks",
        "UNESCO Heritage Sites",
        "World's Largest Cities",
        "Adventure Destinations",
        "Iconic Mountains",
      ],
    },
    {
      name: "Myths & Legends",
      description:
        "Uncover myths, legends, and folklore from around the world.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Greek Mythology",
        "Folklore Tales",
        "Urban Legends",
        "Legendary Heroes",
        "Mythical Creatures",
        "Norse Mythology",
        "Asian Legends",
        "Ancient Deities",
      ],
    },
    {
      name: "Health & Wellness",
      description: "Trivia about health, wellness, and medical breakthroughs.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Medical Discoveries",
        "Fitness Trends",
        "Nutrition & Diet",
        "Alternative Medicine",
        "Mental Health Awareness",
        "Herbal Remedies",
        "Famous Doctors",
        "History of Medicine",
      ],
    },
    {
      name: "Fashion & Trends",
      description: "Explore the world of fashion, designers, and trends.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Runway Hits",
        "Famous Designers",
        "Decades of Style",
        "Accessory Trends",
        "Sustainable Fashion",
        "Street Style",
        "Haute Couture",
        "Iconic Fashion Moments",
      ],
    },
    {
      name: "Technology Innovations",
      description: "Discover how technology shapes our world.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Space Technologies",
        "Breakthrough Gadgets",
        "The Internet Evolution",
        "Blockchain and Cryptocurrencies",
        "Future of Technology",
        "Autonomous Vehicles",
        "Smart Cities",
        "AI and Ethics",
      ],
    },
    {
      name: "Business & Economy",
      description: "Test your knowledge of global business and economic facts.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Stock Market Facts",
        "Global Trade",
        "Famous Entrepreneurs",
        "History of Money",
        "Billion-Dollar Companies",
        "Startup Culture",
        "Economic Theories",
        "Business Scandals",
      ],
    },
    {
      name: "Music & Arts",
      description: "Trivia about music, arts, and cultural expression.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Composers",
        "Afrobeat",
        "Hip Hop",
        "Rnb",
        "Country Music",
        "Pop Music",
        "Iconic Paintings",
        "Instruments Across Cultures",
        "Street Art & Graffiti",
        "Music Awards",
        "Album Cover Trivia",
        "The History of Opera",
        "Evolution of Dance",
      ],
    },
    {
      name: "Geography Facts",
      description: "Expand your knowledge about Earth's geography.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Mountains & Peaks",
        "Deserts of the World",
        "Rivers & Oceans",
        "Unique Countries",
        "Climate Zones",
        "Geopolitical Trivia",
        "Island Nations",
        "Famous World Borders",
      ],
    },
    {
      name: "Space Mysteries",
      description: "Explore the mysteries of outer space.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Black Holes",
        "The Milky Way",
        "Mars Exploration",
        "Exoplanets",
        "Space Missions",
        "Astronomical Events",
        "Theories of the Universe",
        "Space-Time Concepts",
      ],
    },
    {
      name: "Historical Eras",
      description: "Learn about key historical periods and their significance.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "The Renaissance",
        "The Industrial Revolution",
        "The Medieval Period",
        "The Enlightenment",
        "The Cold War",
        "Ancient Empires",
        "Colonial Histories",
        "The Age of Exploration",
      ],
    },
    {
      name: "Food & Drinks",
      description: "Discover trivia about culinary delights and beverages.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Culinary Styles",
        "Famous Cocktails",
        "Street Foods",
        "Iconic Dishes",
        "Global Ingredients",
        "Food History",
        "Dessert Specialties",
        "Drinks Around the World",
      ],
    },
    {
      name: "Famous People",
      description: "Trivia about influential figures throughout history.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "World Leaders",
        "Influential Women",
        "Inventors & Thinkers",
        "Revolutionaries",
        "Explorers & Adventurers",
        "Celebrities Who Changed the World",
        "Scientists and Mathematicians",
        "Philosophers and Theologians",
      ],
    },
    {
      name: "Festivals & Celebrations",
      description: "Trivia about global festivals and iconic celebrations.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Carnival Traditions",
        "Winter Festivals",
        "Harvest Celebrations",
        "Religious Holidays",
        "Music Festivals",
        "National Holidays",
        "Iconic Global Events",
        "Local Parades",
      ],
    },
    {
      name: "Quirky & Bizarre",
      description: "Weird and quirky trivia to surprise and amaze.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Odd Jobs",
        "Strange Laws",
        "Unusual Inventions",
        "Rare Animal Species",
        "Weird World Records",
        "Bizarre Foods",
        "Crazy Rituals",
        "Outlandish Events",
      ],
    },
    {
      name: "Urban Life",
      description: "Trivia about cities, urban development, and cultures.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "City Skylines",
        "Megacities",
        "Famous Streets",
        "Urban Development",
        "Transportation Systems",
        "The Rise of Suburbs",
        "Urban Legends",
        "Historical Cities",
      ],
    },
    {
      name: "Internet & Technology",
      description: "Trivia about the internet and digital culture.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Evolution of Social Media",
        "Online Security Tips",
        "The Rise of E-commerce",
        "Internet Memes",
        "Famous Websites",
        "Gaming Communities",
        "Online Trends",
        "Digital Influencers",
      ],
    },
    {
      name: "Time & Space",
      description: "Learn about the mysteries of time and space.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Ancient Calendars",
        "Timekeeping Devices",
        "Measuring Distance",
        "Theories of Relativity",
        "Space-Time Paradoxes",
        "Evolution of Clocks",
        "Time Travel in Fiction",
        "Cosmic Timelines",
      ],
    },
    {
      name: "War & Conflict",
      description: "Trivia about wars, battles, and historical conflicts.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Revolutionary Wars",
        "Military Tactics",
        "Cold War Espionage",
        "Naval Battles",
        "Famous Generals",
        "Civil Wars",
        "Modern Conflicts",
        "Peace Treaties",
      ],
    },
    {
      name: "Psychology & Philosophy",
      description:
        "Explore the depths of the mind and profound philosophical ideas.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Philosophers",
        "Cognitive Biases",
        "Psychology Theories",
        "Human Emotions",
        "Thought Experiments",
        "Existential Questions",
        "Behavioral Science",
        "Personality Types",
      ],
    },
    {
      name: "Mythology Around the World",
      description:
        "Delve into myths, legends, and deities from different cultures worldwide.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Celtic Myths",
        "African Folklore",
        "Indian Epics",
        "Japanese Kami Legends",
        "Native American Myths",
        "Mesopotamian Gods",
        "Australian Dreamtime",
        "Slavic Folklore",
      ],
    },
    {
      name: "Inventions & Discoveries",
      description: "Trivia about human ingenuity and scientific breakthroughs.",
      gameId: "cm53lflwj000wuymrx0fvjomp",
      topics: [
        "Famous Inventors",
        "Groundbreaking Patents",
        "Space Innovations",
        "Medical Milestones",
        "Transportation Revolutions",
        "The Age of Electricity",
        "Everyday Inventions",
        "Technological Marvels",
      ],
    },
  ];

  const acronymCategories = [
    {
      name: "Pop Culture & Slang",
      description:
        "Acronyms derived from movies, TV shows, music, internet trends, and common texting slang.",
      topics: [
        "Movies",
        "TV Shows",
        "Music Genres",
        "Internet Memes",
        "Texting Slang",
      ],
    },
    {
      name: "Business & Corporate",
      description:
        "Acronyms used in industries, corporate communication, and professional terminology.",
      topics: [
        "Corporate Titles",
        "Startup Terms",
        "Marketing Jargon",
        "Finance Terms",
        "Project Management",
      ],
    },
    {
      name: "Science & Technology",
      description:
        "Acronyms related to scientific discoveries, innovations, and technological concepts.",
      topics: [
        "Physics",
        "Biology",
        "Computer Science",
        "Space Exploration",
        "Artificial Intelligence",
      ],
    },
    {
      name: "Government, Politics & Law",
      description:
        "Acronyms tied to government agencies, political terms, and legal systems.",
      topics: [
        "Government Agencies",
        "Political Parties",
        "Constitutional Terms",
        "Military Organizations",
        "Legal Terms",
      ],
    },
    {
      name: "Sports & Gaming",
      description:
        "Acronyms from sports leagues, teams, gaming culture, and esports.",
      topics: [
        "Football Leagues",
        "Video Games",
        "Board Games",
        "Sports Teams",
        "Gaming Strategies",
      ],
    },
    {
      name: "Health & Wellness",
      description:
        "Acronyms related to fitness, nutrition, medical terms, and wellness practices.",
      topics: [
        "Fitness Techniques",
        "Nutrition Plans",
        "Medical Terms",
        "Mental Health",
        "Healthcare Professions",
      ],
    },
    {
      name: "Education & Academics",
      description:
        "Acronyms from schools, universities, and academic research.",
      topics: [
        "Educational Degrees",
        "School Subjects",
        "Research Fields",
        "Academic Institutions",
        "Standardized Tests",
      ],
    },
    {
      name: "Travel & Geography",
      description:
        "Acronyms associated with travel, locations, and geographical landmarks.",
      topics: [
        "Airports",
        "Country Codes",
        "Geographical Landmarks",
        "Travel Agencies",
        "Transportation Modes",
      ],
    },
    {
      name: "Historical & Cultural",
      description:
        "Acronyms tied to historical events, cultural movements, and traditions.",
      topics: [
        "Historical Events",
        "Cultural Organizations",
        "Festivals",
        "Historical Figures",
        "Cultural Movements",
      ],
    },
    {
      name: "Entertainment & Media",
      description:
        "Acronyms from the entertainment industry, including awards and productions.",
      topics: [
        "Award Shows",
        "Streaming Platforms",
        "Media Companies",
        "Movie Franchises",
        "TV Networks",
      ],
    },
    {
      name: "Finance & Economics",
      description:
        "Acronyms used in banking, investments, and economic discussions.",
      topics: [
        "Banking Terms",
        "Stock Market",
        "Cryptocurrencies",
        "Economic Theories",
        "Investment Strategies",
      ],
    },
    {
      name: "Environment & Conservation",
      description:
        "Acronyms about sustainability, environmental organizations, and conservation efforts.",
      topics: [
        "Climate Change",
        "Sustainability Programs",
        "Conservation Organizations",
        "Recycling Initiatives",
        "Environmental Laws",
      ],
    },
    {
      name: "Fashion & Lifestyle",
      description:
        "Acronyms from fashion trends, lifestyle habits, and popular brands.",
      topics: [
        "Fashion Trends",
        "Beauty Brands",
        "Lifestyle Choices",
        "Fitness Trends",
        "Clothing Lines",
      ],
    },
    {
      name: "Military & Defense",
      description:
        "Acronyms related to military operations, strategies, and equipment.",
      topics: [
        "Military Ranks",
        "Defense Strategies",
        "Weapon Systems",
        "Peacekeeping Missions",
        "Military Bases",
      ],
    },
    {
      name: "Daily Life & General Knowledge",
      description: "Acronyms encountered in everyday life and general trivia.",
      topics: [
        "Household Items",
        "Common Phrases",
        "Everyday Services",
        "Public Transportation",
        "Popular Apps",
      ],
    },
  ];

  const academiaCategories = [
    {
      name: "Mathematics",
      description:
        "Test your skills in various branches of mathematics, from algebra to calculus.",
      topics: [
        "Algebra",
        "Geometry",
        "Calculus",
        "Trigonometry",
        "Statistics",
        "Probability",
      ],
    },
    {
      name: "Science",
      description:
        "Dive into the world of science and explore topics from biology to physics.",
      topics: [
        "Physics",
        "Chemistry",
        "Biology",
        "Earth Science",
        "Astronomy",
        "Genetics",
      ],
    },
    {
      name: "History",
      description:
        "Explore the past, from ancient civilizations to modern history.",
      topics: [
        "Ancient Civilizations",
        "World History",
        "U.S. History",
        "Historical Events",
        "Wars and Conflicts",
        "Famous Leaders",
      ],
    },
    {
      name: "Literature",
      description:
        "Test your knowledge of literature, from famous authors to literary terms.",
      topics: [
        "Famous Authors",
        "Poetry",
        "Novels",
        "Literary Terms",
        "Genres",
        "Book Summaries",
      ],
    },
    {
      name: "Geography",
      description:
        "Learn about the world's countries, capitals, and geography.",
      topics: [
        "Countries",
        "Capitals",
        "Landforms",
        "Climate Zones",
        "Continents",
        "Natural Wonders",
      ],
    },
    {
      name: "Language Arts",
      description:
        "Master the art of grammar, writing, and reading comprehension.",
      topics: [
        "Grammar",
        "Vocabulary",
        "Reading Comprehension",
        "Writing Skills",
        "Punctuation",
        "Spelling",
      ],
    },
    {
      name: "Art & Music",
      description:
        "Explore the worlds of art and music, from history to theory.",
      topics: [
        "Famous Artists",
        "Art History",
        "Music Theory",
        "Instruments",
        "Famous Composers",
        "Art Movements",
      ],
    },
    {
      name: "Physical Education",
      description:
        "Learn about fitness, sports rules, and the importance of teamwork.",
      topics: [
        "Sports Rules",
        "Fitness",
        "Nutrition",
        "Teamwork",
        "Strength Training",
        "Cardio",
      ],
    },
    {
      name: "Social Studies",
      description: "Explore society, culture, government, and economics.",
      topics: [
        "Government",
        "Economics",
        "Sociology",
        "Cultural Studies",
        "Political Systems",
        "Law",
      ],
    },
    {
      name: "Technology",
      description:
        "Test your knowledge of technology, from programming to innovations.",
      topics: [
        "Computers",
        "Programming",
        "Innovations",
        "Digital Literacy",
        "Cybersecurity",
        "Artificial Intelligence",
      ],
    },
    {
      name: "Foreign Languages",
      description: "Learn and test your skills in various foreign languages.",
      topics: ["Spanish", "French", "German", "Latin", "Mandarin", "Italian"],
    },
    {
      name: "Philosophy & Logic",
      description:
        "Engage with thought-provoking topics in philosophy and logic.",
      topics: [
        "Famous Philosophers",
        "Logical Reasoning",
        "Ethics",
        "Thought Experiments",
        "Philosophical Theories",
        "Metaphysics",
      ],
    },
    {
      name: "Environmental Studies",
      description:
        "Learn about the environment, from ecology to climate change.",
      topics: [
        "Conservation",
        "Ecology",
        "Climate Change",
        "Renewable Energy",
        "Pollution",
        "Biodiversity",
      ],
    },
    {
      name: "Health Education",
      description:
        "Understand the basics of health, from anatomy to mental well-being.",
      topics: [
        "Anatomy",
        "Nutrition",
        "Mental Health",
        "Personal Safety",
        "First Aid",
        "Public Health",
      ],
    },
    {
      name: "Current Events",
      description:
        "Stay updated with the world by learning about the latest news and global issues.",
      topics: [
        "News",
        "Politics",
        "World Affairs",
        "Global Issues",
        "Environmental Policies",
        "Human Rights",
      ],
    },
  ];

  const sportsCategories = [
    {
      name: "Football (Soccer)",
      description:
        "Explore the world of football(soccer) and test your knowledge.",
      topics: [
        "FIFA World Cup",
        "Club Football",
        "National Teams",
        "Football Tactics",
        "Football History",
        "Football Positions",
        "Famous Football Players",
        "Football Leagues",
        "Referee Rules",
        "Football Equipment",
        "Olympic Games",
        "Famous Athletes",
        "Football & Basketball",
        "Esports & Gaming",
        "Unusual Sports",
        "Board Games Trivia",
        "Cricket & Baseball",
        "Extreme Sports",
      ],
    },
    {
      name: "Team Sports",
      description:
        "Sports played by two or more teams, each trying to outperform the others to score points or goals.",
      topics: [
        "Basketball",
        "Baseball",
        "Rugby",
        "Hockey (Field and Ice)",
        "Volleyball",
        "Lacrosse",
        "Water Polo",
        "Handball",
      ],
    },
    {
      name: "Racquet Sports",
      description:
        "Sports played with rackets, involving striking a ball or shuttlecock back and forth over a net.",
      topics: ["Tennis", "Badminton", "Table Tennis", "Squash", "Pickleball"],
    },
    {
      name: "Combat Sports",
      description:
        "Sports that involve fighting, typically one-on-one, using various techniques and skills.",
      topics: ["Boxing", "MMA (Mixed Martial Arts)", "Wrestling", "Fencing"],
    },
    {
      name: "Water Sports",
      description:
        "Sports that take place in or on the water, often involving swimming, rowing, or sailing.",
      topics: [
        "Swimming",
        "Surfing",
        "Canoeing/Kayaking",
        "Sailing",
        "Rowing",
        "Water Polo",
      ],
    },
    {
      name: "Winter Sports",
      description:
        "Sports played in winter conditions, often on snow or ice, requiring specialized equipment.",
      topics: [
        "Skiing (Alpine and Nordic)",
        "Snowboarding",
        "Ice Skating",
        "Speed Skating",
      ],
    },
    {
      name: "Adventure Sports",
      description:
        "Sports involving an element of risk or excitement, typically done in outdoor or rugged environments.",
      topics: [
        "Rock Climbing",
        "Parkour",
        "Hiking",
        "Cycling",
        "Mountain Biking",
      ],
    },
    {
      name: "Motorsports",
      description:
        "Sports involving vehicles, often competitive races on tracks or off-road terrain.",
      topics: ["Formula 1", "MotoGP", "Rally Racing", "NASCAR", "Go-Karting"],
    },
    {
      name: "Strength Sports",
      description:
        "Sports focused on physical strength, including weightlifting and competitions that require force.",
      topics: [
        "Weightlifting",
        "Powerlifting",
        "CrossFit",
        "Strongman Competitions",
      ],
    },
    {
      name: "Individual Sports",
      description:
        "Sports typically played individually, focusing on personal skill and performance.",
      topics: [
        "Golf",
        "Tennis",
        "Bowling",
        "Archery",
        "Snooker",
        "Billiards",
        "Darts",
      ],
    },
    {
      name: "Equestrian Sports",
      description:
        "Sports that involve horse riding, ranging from racing to jumping and dressage.",
      topics: ["Horse Racing", "Polo", "Equestrian Jumping", "Dressage"],
    },
    {
      name: "Extreme Sports",
      description:
        "Sports that involve high levels of risk and require adrenaline and skill.",
      topics: [
        "Skateboarding",
        "BMX",
        "Snowboarding",
        "Surfing",
        "Freestyle Motocross",
      ],
    },
    {
      name: "Sports with Balls",
      description:
        "Sports where players use a ball as the primary equipment, including team-based and individual sports.",
      topics: [
        "Golf",
        "Tennis",
        "Baseball",
        "Basketball",
        "Cricket",
        "Rugby",
        "Football (American)",
      ],
    },
    {
      name: "Track Sports",
      description:
        "Sports that take place on a track, typically involving running, cycling, and field events.",
      topics: ["Track Cycling", "Sprinting", "Hurdles", "Relay Races"],
    },
    {
      name: "Fitness and Exercise",
      description:
        "Sports and activities focused on improving physical fitness and health.",
      topics: ["Gymnastics", "Pilates", "Yoga", "Martial Arts", "Zumba"],
    },
    {
      name: "Board Sports",
      description:
        "Sports that involve a board as the primary equipment, usually involving balance and coordination.",
      topics: ["Skateboarding", "Snowboarding", "Surfing", "Windsurfing"],
    },
    {
      name: "Water-based Racing",
      description:
        "Sports that involve racing on water using boats, jets, or other equipment.",
      topics: ["Jet Skiing", "Canoeing", "Kayaking", "Sailing", "Rowing"],
    },
    {
      name: "Games and Recreation",
      description:
        "Casual, fun sports and games usually played for leisure or social engagement.",
      topics: [
        "Ultimate Frisbee",
        "Dodgeball",
        "Kickball",
        "Bocce Ball",
        "Horseshoes",
      ],
    },
    {
      name: "Social Sports",
      description:
        "Casual sports that encourage social interaction and recreation.",
      topics: ["Softball", "Cricket", "Bowling", "Ping Pong", "Pool", "Darts"],
    },
    {
      name: "E-sports",
      description:
        "Competitive video gaming, often with professional leagues and tournaments.",
      topics: [
        "League of Legends",
        "Fortnite",
        "Counter-Strike",
        "Call of Duty",
        "Dota 2",
      ],
    },
  ];

  const countries = [
    {
      name: "Afghanistan",
      description:
        "A landlocked country located in South Asia and Central Asia.",
      topics: [],
    },
    {
      name: "Albania",
      description:
        "A country in Southeastern Europe, known for its beaches and rugged landscapes.",
      topics: [],
    },
    {
      name: "Algeria",
      description: "The largest country in Africa, located in North Africa.",
      topics: [],
    },
    {
      name: "Andorra",
      description:
        "A tiny country in the Pyrenees mountains between France and Spain.",
      topics: [],
    },
    {
      name: "Angola",
      description:
        "A country in Southern Africa, known for its oil reserves and natural beauty.",
      topics: [],
    },
    {
      name: "Antigua and Barbuda",
      description:
        "A small Caribbean nation known for its pristine beaches and colonial architecture.",
      topics: [],
    },
    {
      name: "Argentina",
      description:
        "A country in South America, famous for its football and the Pampas grasslands.",
      topics: [],
    },
    {
      name: "Armenia",
      description:
        "A landlocked country in the Caucasus region, known for its ancient churches and rich culture.",
      topics: [],
    },
    {
      name: "Australia",
      description:
        "An island continent famous for its unique wildlife, beaches, and the Great Barrier Reef.",
      topics: [],
    },
    {
      name: "Austria",
      description:
        "A landlocked country in Central Europe, known for its classical music and Alpine landscapes.",
      topics: [],
    },
    {
      name: "Azerbaijan",
      description:
        "A country in the Caucasus region, rich in oil resources and diverse cultures.",
      topics: [],
    },
    {
      name: "Bahamas",
      description:
        "An island nation in the Caribbean, known for its white sandy beaches and clear blue waters.",
      topics: [],
    },
    {
      name: "Bahrain",
      description:
        "A small island country in the Persian Gulf, known for its oil wealth and historical significance.",
      topics: [],
    },
    {
      name: "Bangladesh",
      description:
        "A densely populated country in South Asia, known for its vibrant culture and river delta.",
      topics: [],
    },
    {
      name: "Barbados",
      description:
        "An island nation in the Caribbean, famous for its beaches and rum.",
      topics: [],
    },
    {
      name: "Belarus",
      description:
        "A country in Eastern Europe, known for its forests and Soviet-era monuments.",
      topics: [],
    },
    {
      name: "Belgium",
      description:
        "A country in Western Europe, famous for its medieval towns, beer, and chocolates.",
      topics: [],
    },
    {
      name: "Belize",
      description:
        "A small Central American country known for its Caribbean coastline and Mayan ruins.",
      topics: [],
    },
    {
      name: "Benin",
      description:
        "A West African country known for its historical significance in the Kingdom of Dahomey.",
      topics: [],
    },
    {
      name: "Bhutan",
      description:
        "A landlocked country in the Himalayas, known for its focus on happiness and sustainability.",
      topics: [],
    },
    {
      name: "Bolivia",
      description:
        "A landlocked country in South America, known for its Andes Mountains and salt flats.",
      topics: [],
    },
    {
      name: "Bosnia and Herzegovina",
      description:
        "A country in Southeastern Europe, known for its cultural diversity and Ottoman influence.",
      topics: [],
    },
    {
      name: "Botswana",
      description:
        "A landlocked country in Southern Africa, famous for its wildlife and the Okavango Delta.",
      topics: [],
    },
    {
      name: "Brazil",
      description:
        "The largest country in South America, known for its Amazon rainforest and football culture.",
      topics: [],
    },
    {
      name: "Brunei",
      description:
        "A small, wealthy country on the island of Borneo, known for its oil resources and Islamic culture.",
      topics: [],
    },
    {
      name: "Bulgaria",
      description:
        "A country in Southeast Europe, known for its historical sites and diverse landscapes.",
      topics: [],
    },
    {
      name: "Burkina Faso",
      description:
        "A landlocked country in West Africa, known for its cultural diversity and natural resources.",
      topics: [],
    },
    {
      name: "Burundi",
      description:
        "A small, landlocked country in East Africa, facing challenges related to poverty and conflict.",
      topics: [],
    },
    {
      name: "Cabo Verde",
      description:
        "An island nation off the coast of West Africa, known for its Creole culture and music.",
      topics: [],
    },
    {
      name: "Cambodia",
      description:
        "A Southeast Asian country, famous for the Angkor Wat temples and Khmer culture.",
      topics: [],
    },
    {
      name: "Cameroon",
      description:
        "A country in Central Africa, known for its cultural diversity and natural resources.",
      topics: [],
    },
    {
      name: "Canada",
      description:
        "The second-largest country in the world, known for its vast landscapes and multicultural population.",
      topics: [],
    },
    {
      name: "Central African Republic",
      description:
        "A landlocked country in Central Africa, facing political instability and poverty.",
      topics: [],
    },
    {
      name: "Chad",
      description:
        "A landlocked country in North-Central Africa, known for its deserts and wildlife.",
      topics: [],
    },
    {
      name: "Chile",
      description:
        "A long, narrow country in South America, famous for its wine and the Andes mountains.",
      topics: [],
    },
    {
      name: "China",
      description:
        "The most populous country in the world, with a rich history and rapidly growing economy.",
      topics: [],
    },
    {
      name: "Colombia",
      description:
        "A country in South America known for its coffee, cultural diversity, and beautiful landscapes.",
      topics: [],
    },
    {
      name: "Comoros",
      description:
        "An island nation off the coast of East Africa, known for its rich marine biodiversity.",
      topics: [],
    },
    {
      name: "Congo, Democratic Republic of the",
      description:
        "A country in Central Africa, known for its vast rainforests and mineral wealth.",
      topics: [],
    },
    {
      name: "Congo, Republic of the",
      description:
        "A country in Central Africa, known for its oil reserves and rainforests.",
      topics: [],
    },
    {
      name: "Costa Rica",
      description:
        "A country in Central America, known for its biodiversity and commitment to environmental conservation.",
      topics: [],
    },
    {
      name: "Croatia",
      description:
        "A country in Southeastern Europe, famous for its Adriatic coastline and medieval towns.",
      topics: [],
    },
    {
      name: "Cuba",
      description:
        "An island nation in the Caribbean, known for its communist regime, vibrant culture, and cigars.",
      topics: [],
    },
    {
      name: "Cyprus",
      description:
        "An island nation in the Eastern Mediterranean, known for its ancient history and beaches.",
      topics: [],
    },
    {
      name: "Czech Republic",
      description:
        "A country in Central Europe, famous for its castles, beer culture, and history.",
      topics: [],
    },
    {
      name: "Denmark",
      description:
        "A Nordic country, known for its progressive society, design, and happy population.",
      topics: [],
    },
    {
      name: "Djibouti",
      description:
        "A small country in the Horn of Africa, known for its strategic location and naval ports.",
      topics: [],
    },
    {
      name: "Dominica",
      description:
        "A small island nation in the Caribbean, famous for its volcanic landscapes and rainforests.",
      topics: [],
    },
    {
      name: "Dominican Republic",
      description:
        "An island country in the Caribbean, known for its beaches and resorts.",
      topics: [],
    },
    {
      name: "East Timor",
      description:
        "A small country in Southeast Asia, known for its pristine beaches and vibrant culture.",
      topics: [],
    },
    {
      name: "Ecuador",
      description:
        "A country in South America, famous for the Galápagos Islands and the Andes mountains.",
      topics: [],
    },
    {
      name: "Egypt",
      description:
        "A country in North Africa, famous for its ancient civilization and monuments like the pyramids.",
      topics: [],
    },
    {
      name: "El Salvador",
      description:
        "A small country in Central America, known for its volcanic landscapes and coffee production.",
      topics: [],
    },
    {
      name: "Equatorial Guinea",
      description:
        "A small country in Central Africa, known for its oil resources and cultural diversity.",
      topics: [],
    },
    {
      name: "Eritrea",
      description:
        "A country in the Horn of Africa, known for its Red Sea coastline and historical sites.",
      topics: [],
    },
    {
      name: "Estonia",
      description:
        "A Baltic country in Northern Europe, known for its medieval architecture and high-tech society.",
      topics: [],
    },
    {
      name: "Eswatini",
      description:
        "A small country in Southern Africa, known for its traditional monarchy and wildlife reserves.",
      topics: [],
    },
    {
      name: "Ethiopia",
      description:
        "A country in the Horn of Africa, known for its ancient civilization and diverse cultures.",
      topics: [],
    },
    {
      name: "Fiji",
      description:
        "An island nation in the South Pacific, known for its coral reefs and tropical climate.",
      topics: [],
    },
    {
      name: "Finland",
      description:
        "A Nordic country known for its stunning landscapes, saunas, and high standard of living.",
      topics: [],
    },
    {
      name: "France",
      description:
        "A country in Western Europe, famous for its art, cuisine, and historical landmarks.",
      topics: [],
    },
    {
      name: "Gabon",
      description:
        "A country in Central Africa, known for its rainforests and oil reserves.",
      topics: [],
    },
    {
      name: "Gambia",
      description:
        "A small country in West Africa, known for its river and unique geography.",
      topics: [],
    },
    {
      name: "Georgia",
      description:
        "A country at the intersection of Europe and Asia, known for its ancient wine-making tradition.",
      topics: [],
    },
    {
      name: "Germany",
      description:
        "A major European country known for its history, economy, and cultural contributions.",
      topics: [],
    },
    {
      name: "Ghana",
      description:
        "A country in West Africa, known for its gold, cocoa, and vibrant culture.",
      topics: [],
    },
    {
      name: "Greece",
      description:
        "A country in Southern Europe, famous for its ancient ruins and Mediterranean coastline.",
      topics: [],
    },
    {
      name: "Grenada",
      description:
        "An island nation in the Caribbean, known for its nutmeg production and stunning beaches.",
      topics: [],
    },
    {
      name: "Guatemala",
      description:
        "A Central American country, famous for its ancient Mayan ruins and colorful markets.",
      topics: [],
    },
    {
      name: "Guinea",
      description:
        "A country in West Africa, known for its mineral resources and diverse cultures.",
      topics: [],
    },
    {
      name: "Guinea-Bissau",
      description:
        "A country in West Africa, known for its beaches and historical significance.",
      topics: [],
    },
    {
      name: "Guyana",
      description:
        "A country in South America, known for its rainforests and the Essequibo River.",
      topics: [],
    },
    {
      name: "Haiti",
      description:
        "A Caribbean country, known for its history of revolution and cultural resilience.",
      topics: [],
    },
    {
      name: "Honduras",
      description:
        "A Central American country, known for its Mayan ruins and natural resources.",
      topics: [],
    },
    {
      name: "Hungary",
      description:
        "A landlocked country in Central Europe, known for its rich cultural heritage and thermal baths.",
      topics: [],
    },
    {
      name: "Iceland",
      description:
        "A Nordic country known for its dramatic landscapes, volcanoes, and geothermal energy.",
      topics: [],
    },
    {
      name: "India",
      description:
        "A vast country in South Asia, known for its rich culture, history, and diverse religions.",
      topics: [],
    },
    {
      name: "Indonesia",
      description:
        "An island nation in Southeast Asia, famous for its tropical climate and biodiversity.",
      topics: [],
    },
    {
      name: "Iran",
      description:
        "A country in the Middle East, known for its ancient civilization and oil resources.",
      topics: [],
    },
    {
      name: "Iraq",
      description:
        "A country in the Middle East, known for its historical significance and rich culture.",
      topics: [],
    },
    {
      name: "Ireland",
      description:
        "An island nation in Western Europe, famous for its green landscapes, pubs, and folklore.",
      topics: [],
    },
    {
      name: "Israel",
      description:
        "A country in the Middle East, known for its historical and religious significance.",
      topics: [],
    },
    {
      name: "Italy",
      description:
        "A country in Southern Europe, famous for its art, architecture, and cuisine.",
      topics: [],
    },
    {
      name: "Jamaica",
      description:
        "An island nation in the Caribbean, known for its music, culture, and beaches.",
      topics: [],
    },
    {
      name: "Japan",
      description:
        "An island nation in East Asia, known for its technology, culture, and natural beauty.",
      topics: [],
    },
    {
      name: "Jordan",
      description:
        "A country in the Middle East, known for its ancient landmarks like Petra and the Dead Sea.",
      topics: [],
    },
    {
      name: "Kazakhstan",
      description:
        "A large landlocked country in Central Asia, known for its vast steppes and oil resources.",
      topics: [],
    },
    {
      name: "Kenya",
      description:
        "A country in East Africa, known for its wildlife safaris and natural beauty.",
      topics: [],
    },
    {
      name: "Kiribati",
      description:
        "A small island nation in the Pacific Ocean, facing challenges due to climate change.",
      topics: [],
    },
    {
      name: "Korea, North",
      description:
        "A country in East Asia, known for its authoritarian regime and history of conflict.",
      topics: [],
    },
    {
      name: "Korea, South",
      description:
        "A country in East Asia, known for its technology, culture, and economy.",
      topics: [],
    },
    {
      name: "Kuwait",
      description:
        "A small country in the Middle East, known for its oil reserves and wealthy economy.",
      topics: [],
    },
    {
      name: "Kyrgyzstan",
      description:
        "A country in Central Asia, known for its mountains and nomadic culture.",
      topics: [],
    },
    {
      name: "Laos",
      description:
        "A landlocked country in Southeast Asia, known for its Buddhist culture and natural beauty.",
      topics: [],
    },
    {
      name: "Latvia",
      description:
        "A Baltic country in Northern Europe, known for its medieval architecture and forests.",
      topics: [],
    },
    {
      name: "Lebanon",
      description:
        "A small country in the Middle East, known for its history, culture, and Mediterranean coastline.",
      topics: [],
    },
    {
      name: "Lesotho",
      description:
        "A landlocked country in Southern Africa, known for its mountainous terrain and wool production.",
      topics: [],
    },
    {
      name: "Liberia",
      description:
        "A country in West Africa, known for its history as a settlement for freed American slaves.",
      topics: [],
    },
    {
      name: "Libya",
      description:
        "A country in North Africa, known for its oil reserves and political instability.",
      topics: [],
    },
    {
      name: "Liechtenstein",
      description:
        "A small country in Central Europe, known for its wealth, banking industry, and medieval castles.",
      topics: [],
    },
    {
      name: "Lithuania",
      description:
        "A Baltic country in Northern Europe, known for its medieval architecture and culture.",
      topics: [],
    },
    {
      name: "Luxembourg",
      description:
        "A small, wealthy country in Western Europe, known for its banking sector and castles.",
      topics: [],
    },
    {
      name: "Madagascar",
      description:
        "An island country off the coast of Africa, known for its unique wildlife and rainforests.",
      topics: [],
    },
    {
      name: "Malawi",
      description:
        "A landlocked country in Southeast Africa, known for its lakes and wildlife.",
      topics: [],
    },
    {
      name: "Malaysia",
      description:
        "A country in Southeast Asia, known for its modern cities and tropical rainforests.",
      topics: [],
    },
    {
      name: "Maldives",
      description:
        "An island nation in the Indian Ocean, famous for its luxury resorts and coral reefs.",
      topics: [],
    },
    {
      name: "Mali",
      description:
        "A country in West Africa, known for its ancient culture and desert landscapes.",
      topics: [],
    },
    {
      name: "Malta",
      description:
        "An island nation in the Mediterranean, known for its history and beaches.",
      topics: [],
    },
    {
      name: "Marshall Islands",
      description:
        "An island country in the Pacific Ocean, known for its tropical climate and marine life.",
      topics: [],
    },
    {
      name: "Mauritania",
      description:
        "A country in West Africa, known for its desert landscapes and ancient history.",
      topics: [],
    },
    {
      name: "Mauritius",
      description:
        "An island nation in the Indian Ocean, known for its beaches, reefs, and luxury resorts.",
      topics: [],
    },
    {
      name: "Mexico",
      description:
        "A country in North America, known for its rich culture, history, and cuisine.",
      topics: [],
    },
    {
      name: "Micronesia",
      description:
        "A country in the Pacific Ocean, known for its islands and unique culture.",
      topics: [],
    },
    {
      name: "Moldova",
      description:
        "A landlocked country in Eastern Europe, known for its wine production and Soviet-era influence.",
      topics: [],
    },
    {
      name: "Monaco",
      description:
        "A small, wealthy country on the Mediterranean coast, known for its casinos and luxury.",
      topics: [],
    },
    {
      name: "Mongolia",
      description:
        "A country in East Asia, known for its vast steppes, nomadic culture, and history.",
      topics: [],
    },
    {
      name: "Montenegro",
      description:
        "A small country in Southeastern Europe, known for its Adriatic coast and rugged mountains.",
      topics: [],
    },
    {
      name: "Morocco",
      description:
        "A country in North Africa, known for its deserts, mountains, and ancient cities.",
      topics: [],
    },
    {
      name: "Mozambique",
      description:
        "A country in Southeast Africa, known for its Indian Ocean coastline and wildlife.",
      topics: [],
    },
    {
      name: "Myanmar",
      description:
        "A country in Southeast Asia, known for its Buddhist culture and colonial architecture.",
      topics: [],
    },
    {
      name: "Namibia",
      description:
        "A country in Southern Africa, known for its deserts and wildlife reserves.",
      topics: [],
    },
    {
      name: "Nauru",
      description:
        "The smallest country in the world, located in the Pacific Ocean, known for its phosphate mining.",
      topics: [],
    },
    {
      name: "Nepal",
      description:
        "A country in the Himalayas, known for its mountains and being the home of Mount Everest.",
      topics: [],
    },
    {
      name: "Netherlands",
      description:
        "A country in Western Europe, known for its tulips, windmills, and canals.",
      topics: [],
    },
    {
      name: "New Zealand",
      description:
        "An island nation in the Pacific Ocean, known for its nature, indigenous culture, and movie industry.",
      topics: [],
    },
    {
      name: "Nicaragua",
      description:
        "A country in Central America, known for its volcanic landscapes and colonial architecture.",
      topics: [],
    },
    {
      name: "Niger",
      description:
        "A landlocked country in West Africa, known for its desert landscapes and rich history.",
      topics: [],
    },
    {
      name: "Nigeria",
      description:
        "A country in West Africa, known for its large population, oil reserves, and vibrant culture.",
      topics: [],
    },
    {
      name: "North Macedonia",
      description:
        "A country in Southeast Europe, known for its lakes and ancient history.",
      topics: [],
    },
    {
      name: "Norway",
      description:
        "A Nordic country known for its fjords, mountains, and high quality of life.",
      topics: [],
    },
    {
      name: "Oman",
      description:
        "A country on the Arabian Peninsula, known for its desert landscapes and historic architecture.",
      topics: [],
    },
    {
      name: "Pakistan",
      description:
        "A country in South Asia, known for its diverse landscapes, culture, and rich history.",
      topics: [],
    },
    {
      name: "Palau",
      description:
        "An island country in the Pacific Ocean, famous for its biodiversity and diving spots.",
      topics: [],
    },
    {
      name: "Panama",
      description:
        "A country in Central America, famous for the Panama Canal and its beaches.",
      topics: [],
    },
    {
      name: "Papua New Guinea",
      description:
        "A country in Oceania, known for its biodiversity and indigenous cultures.",
      topics: [],
    },
    {
      name: "Paraguay",
      description:
        "A landlocked country in South America, known for its rivers and unique culture.",
      topics: [],
    },
    {
      name: "Peru",
      description:
        "A country in South America, known for its ancient Incan history and the Andes mountains.",
      topics: [],
    },
    {
      name: "Philippines",
      description:
        "An island nation in Southeast Asia, known for its beaches, wildlife, and history.",
      topics: [],
    },
    {
      name: "Poland",
      description:
        "A country in Central Europe, known for its history, culture, and scenic landscapes.",
      topics: [],
    },
    {
      name: "Portugal",
      description:
        "A country in Southern Europe, known for its beaches, wines, and historical landmarks.",
      topics: [],
    },
    {
      name: "Qatar",
      description:
        "A wealthy country in the Middle East, known for its oil reserves and modern architecture.",
      topics: [],
    },
    {
      name: "Romania",
      description:
        "A country in Eastern Europe, known for its castles, mountains, and rich history.",
      topics: [],
    },
    {
      name: "Russia",
      description:
        "The largest country in the world, spanning Eastern Europe and Asia, known for its history, culture, and landscapes.",
      topics: [],
    },
    {
      name: "Rwanda",
      description:
        "A country in East Africa, known for its wildlife, including mountain gorillas, and its recovery from the 1994 genocide.",
      topics: [],
    },
    {
      name: "Saint Kitts and Nevis",
      description:
        "A two-island nation in the Caribbean, known for its volcanic landscapes and beaches.",
      topics: [],
    },
    {
      name: "Saint Lucia",
      description:
        "An island nation in the Caribbean, known for its volcanic peaks and luxury resorts.",
      topics: [],
    },
    {
      name: "Saint Vincent and the Grenadines",
      description:
        "An island nation in the Caribbean, known for its sailing and beaches.",
      topics: [],
    },
    {
      name: "Samoa",
      description:
        "An island nation in the Pacific Ocean, known for its Polynesian culture and beautiful beaches.",
      topics: [],
    },
    {
      name: "San Marino",
      description:
        "One of the world's oldest republics, located in Italy, known for its medieval architecture.",
      topics: [],
    },
    {
      name: "Sao Tome and Principe",
      description:
        "An island nation in the Gulf of Guinea, known for its cocoa production and tropical climate.",
      topics: [],
    },
    {
      name: "Saudi Arabia",
      description:
        "A country in the Middle East, known for its oil reserves, Islamic history, and desert landscapes.",
      topics: [],
    },
    {
      name: "Senegal",
      description:
        "A country in West Africa, known for its beaches, cultural heritage, and music.",
      topics: [],
    },
    {
      name: "Serbia",
      description:
        "A country in Southeastern Europe, known for its medieval history and vibrant culture.",
      topics: [],
    },
    {
      name: "Seychelles",
      description:
        "An island nation in the Indian Ocean, known for its beaches and marine biodiversity.",
      topics: [],
    },
    {
      name: "Sierra Leone",
      description:
        "A country in West Africa, known for its beaches, natural resources, and history of conflict.",
      topics: [],
    },
    {
      name: "Singapore",
      description:
        "A city-state in Southeast Asia, known for its cleanliness, economy, and cultural diversity.",
      topics: [],
    },
    {
      name: "Slovakia",
      description:
        "A landlocked country in Central Europe, known for its castles, mountains, and culture.",
      topics: [],
    },
    {
      name: "Slovenia",
      description:
        "A small country in Central Europe, known for its mountains, lakes, and history.",
      topics: [],
    },
    {
      name: "Solomon Islands",
      description:
        "An island nation in the Pacific Ocean, known for its WWII history and marine biodiversity.",
      topics: [],
    },
    {
      name: "Somalia",
      description:
        "A country in the Horn of Africa, known for its coastline and cultural history.",
      topics: [],
    },
    {
      name: "South Africa",
      description:
        "A country in Southern Africa, known for its diverse culture, wildlife, and history.",
      topics: [],
    },
    {
      name: "South Sudan",
      description:
        "The world's newest country, located in East-Central Africa, facing ongoing conflicts.",
      topics: [],
    },
    {
      name: "Spain",
      description:
        "A country in Southwestern Europe, known for its history, culture, and beautiful landscapes.",
      topics: [],
    },
    {
      name: "Sri Lanka",
      description:
        "An island country in South Asia, known for its beaches, wildlife, and Buddhist heritage.",
      topics: [],
    },
    {
      name: "Sudan",
      description:
        "A country in North-East Africa, known for its ancient history and political struggles.",
      topics: [],
    },
    {
      name: "Suriname",
      description:
        "A country in South America, known for its rainforests and diverse culture.",
      topics: [],
    },
    {
      name: "Sweden",
      description:
        "A Nordic country, known for its welfare system, forests, and historical sites.",
      topics: [],
    },
    {
      name: "Switzerland",
      description:
        "A landlocked country in Europe, known for its neutrality, banking system, and mountains.",
      topics: [],
    },
    {
      name: "Syria",
      description:
        "A country in the Middle East, known for its ancient history and ongoing civil war.",
      topics: [],
    },
    {
      name: "Taiwan",
      description:
        "A self-governing island nation in East Asia, known for its technology and cultural influences.",
      topics: [],
    },
    {
      name: "Tajikistan",
      description:
        "A landlocked country in Central Asia, known for its mountains and Persian heritage.",
      topics: [],
    },
    {
      name: "Tanzania",
      description:
        "A country in East Africa, known for its wildlife reserves, including Serengeti National Park.",
      topics: [],
    },
    {
      name: "Thailand",
      description:
        "A country in Southeast Asia, known for its beaches, temples, and vibrant street life.",
      topics: [],
    },
    {
      name: "Togo",
      description:
        "A country in West Africa, known for its beaches and cultural diversity.",
      topics: [],
    },
    {
      name: "Tonga",
      description:
        "An island nation in the South Pacific, known for its monarchy and tropical beauty.",
      topics: [],
    },
    {
      name: "Trinidad and Tobago",
      description:
        "An island nation in the Caribbean, known for its carnival and diverse culture.",
      topics: [],
    },
    {
      name: "Tunisia",
      description:
        "A country in North Africa, known for its Mediterranean beaches and ancient ruins.",
      topics: [],
    },
    {
      name: "Turkey",
      description:
        "A country straddling Eastern Europe and Asia, known for its culture, history, and food.",
      topics: [],
    },
    {
      name: "Turkmenistan",
      description:
        "A country in Central Asia, known for its deserts and gas reserves.",
      topics: [],
    },
    {
      name: "Tuvalu",
      description:
        "One of the smallest countries in the world, known for its islands and climate change challenges.",
      topics: [],
    },
    {
      name: "Uganda",
      description:
        "A country in East Africa, known for its wildlife, including mountain gorillas.",
      topics: [],
    },
    {
      name: "Ukraine",
      description:
        "A country in Eastern Europe, known for its history, culture, and political conflict.",
      topics: [],
    },
    {
      name: "United Arab Emirates",
      description:
        "A country in the Arabian Peninsula, known for its modern cities and oil wealth.",
      topics: [],
    },
    {
      name: "United Kingdom",
      description:
        "A country in Western Europe, known for its monarchy, history, and cultural contributions.",
      topics: [],
    },
    {
      name: "United States",
      description:
        "A country in North America, known for its global influence, economy, and diverse landscapes.",
      topics: [],
    },
    {
      name: "Uruguay",
      description:
        "A small country in South America, known for its beaches, politics, and football culture.",
      topics: [],
    },
    {
      name: "Uzbekistan",
      description:
        "A landlocked country in Central Asia, known for its Silk Road heritage and deserts.",
      topics: [],
    },
    {
      name: "Vanuatu",
      description:
        "An island nation in the Pacific Ocean, known for its volcanic landscapes and indigenous culture.",
      topics: [],
    },
    {
      name: "Vatican City",
      description:
        "The smallest country in the world, an independent city-state located within Rome, Italy.",
      topics: [],
    },
    {
      name: "Venezuela",
      description:
        "A country in South America, known for its oil reserves and political instability.",
      topics: [],
    },
    {
      name: "Vietnam",
      description:
        "A country in Southeast Asia, known for its history, food, and landscapes.",
      topics: [],
    },
    {
      name: "Yemen",
      description:
        "A country in the Arabian Peninsula, known for its ancient history and ongoing conflict.",
      topics: [],
    },
    {
      name: "Zambia",
      description:
        "A landlocked country in Southern Africa, known for its wildlife and Victoria Falls.",
      topics: [],
    },
    {
      name: "Zimbabwe",
      description:
        "A country in Southern Africa, known for its wildlife and political history.",
      topics: [],
    },
  ];

  const popCultureRooms = [
    {
      name: "Hollywood Hits",
      description:
        "Guess acronyms inspired by blockbuster movies and famous Hollywood dialogues.",
    },
    {
      name: "TV Time",
      description:
        "Decode acronyms based on popular TV shows and their iconic moments.",
    },
    {
      name: "Chart-Topping Tunes",
      description:
        "Uncover acronyms from hit songs, artists, and music genres.",
    },
    {
      name: "Internet Memes",
      description: "Crack acronyms from viral memes and internet sensations.",
    },
    {
      name: "Slang Savvy",
      description:
        "Test your knowledge of trendy texting and social media slang.",
    },
    {
      name: "Streaming Stars",
      description:
        "Guess acronyms from famous series and characters on streaming platforms.",
    },
    {
      name: "Pop Icons",
      description:
        "Identify acronyms related to legendary pop culture figures and celebrities.",
    },
    {
      name: "Award Season",
      description:
        "Explore acronyms tied to award-winning movies, shows, and performances.",
    },
    {
      name: "Fandom Frenzy",
      description:
        "Guess acronyms from famous fan bases and their beloved franchises.",
    },
    {
      name: "Classic Cinema",
      description:
        "Decode acronyms from timeless movies and classic Hollywood.",
    },
    {
      name: "Social Media Buzz",
      description:
        "Uncover acronyms from trending hashtags and viral challenges.",
    },
    {
      name: "Gaming Glory",
      description:
        "Identify acronyms from iconic video games and esports legends.",
    },
    {
      name: "Retro Vibes",
      description: "Guess acronyms inspired by 80s and 90s pop culture.",
    },
    {
      name: "Blockbuster Bonanza",
      description:
        "Decode acronyms from the biggest box office hits of all time.",
    },
    {
      name: "Lyrics Labyrinth",
      description: "Unravel acronyms hidden in famous song lyrics.",
    },
    {
      name: "Animated Adventures",
      description: "Guess acronyms from beloved animated movies and series.",
    },
    {
      name: "Comedy Gold",
      description:
        "Identify acronyms from iconic comedians and hilarious sitcoms.",
    },
    {
      name: "Drama Queens",
      description:
        "Decode acronyms tied to emotional TV dramas and soap operas.",
    },
    {
      name: "Fashion Faves",
      description:
        "Uncover acronyms related to iconic fashion moments and designers.",
    },
    {
      name: "Romantic Classics",
      description: "Guess acronyms from beloved romantic movies and songs.",
    },
    {
      name: "Streaming Craze",
      description:
        "Decode acronyms from trending shows and movies on streaming platforms.",
    },
    {
      name: "Sci-Fi Spectacles",
      description:
        "Identify acronyms from legendary sci-fi movies and franchises.",
    },
    {
      name: "Fantasy Fandom",
      description: "Unravel acronyms from magical worlds and fantasy sagas.",
    },
    {
      name: "Superhero Spotlight",
      description:
        "Guess acronyms tied to superheroes and their epic adventures.",
    },
    {
      name: "Reality TV Drama",
      description: "Decode acronyms from famous reality shows and their stars.",
    },
    {
      name: "Villain Vault",
      description:
        "Identify acronyms from iconic villains and their evil plans.",
    },
    {
      name: "Musical Legends",
      description: "Guess acronyms from legendary bands and solo artists.",
    },
    {
      name: "Teen Trends",
      description:
        "Decode acronyms from shows, movies, and slang popular among teens.",
    },
    {
      name: "Horror Haven",
      description:
        "Identify acronyms from spine-chilling horror movies and stories.",
    },
    {
      name: "Adventure Awaits",
      description:
        "Unravel acronyms tied to epic adventure movies and characters.",
    },
    {
      name: "Action Packed",
      description: "Guess acronyms from thrilling action movies and series.",
    },
    {
      name: "K-Pop Craze",
      description: "Decode acronyms from famous K-Pop groups and songs.",
    },
    {
      name: "Bollywood Beats",
      description: "Identify acronyms from iconic Bollywood movies and stars.",
    },
    {
      name: "Slang Central",
      description: "Guess acronyms from global slang and internet culture.",
    },
    {
      name: "Dance Floor Anthems",
      description: "Decode acronyms from famous party and dance songs.",
    },
    {
      name: "Award Show Icons",
      description: "Identify acronyms from unforgettable award show moments.",
    },
    {
      name: "Cult Classics",
      description:
        "Unravel acronyms from movies and shows with a cult following.",
    },
    {
      name: "Fantasy TV Tales",
      description: "Guess acronyms from magical TV shows and their characters.",
    },
    {
      name: "Sitcom Spotlight",
      description:
        "Decode acronyms from beloved sitcoms and their hilarious casts.",
    },
    {
      name: "True Crime Stories",
      description:
        "Identify acronyms from gripping true crime series and podcasts.",
    },
    {
      name: "Digital Influencers",
      description: "Guess acronyms from famous YouTubers and TikTok stars.",
    },
    {
      name: "Streaming Binge",
      description: "Decode acronyms tied to binge-worthy shows and series.",
    },
    {
      name: "Texting Trends",
      description: "Unravel acronyms from modern texting habits and emojis.",
    },
    {
      name: "Inspirational Icons",
      description: "Guess acronyms from motivational figures in pop culture.",
    },
    {
      name: "Gamer's Galaxy",
      description: "Decode acronyms from iconic games and online communities.",
    },
    {
      name: "Epic Sagas",
      description:
        "Identify acronyms from long-running TV and movie franchises.",
    },
    {
      name: "Music Madness",
      description: "Guess acronyms from top-charting songs and album titles.",
    },
    {
      name: "Virtual Celebrities",
      description: "Decode acronyms tied to avatars and virtual influencers.",
    },
  ];

  const footballGameRooms = [
    {
      name: "Goal Masters",
      description: "Show your soccer knowledge and outscore your rivals!",
    },
    {
      name: "Kickoff Clash",
      description: "A thrilling room for ultimate football trivia battles.",
    },
    {
      name: "Penalty Pros",
      description: "Test your skills in a room inspired by penalty shootouts.",
    },
    {
      name: "Dribble Kings",
      description: "Compete in a game room focused on dribbling legends.",
    },
    {
      name: "FIFA Frenzy",
      description: "Take on FIFA-themed challenges and claim victory!",
    },
    {
      name: "Champions Arena",
      description:
        "Enter a room celebrating the greatest Champions League moments.",
    },
    {
      name: "World Cup Wizards",
      description: "Prove your expertise in World Cup history and facts.",
    },
    {
      name: "Striker's Zone",
      description:
        "A room dedicated to the most iconic goal scorers in football.",
    },
    {
      name: "Legendary Boots",
      description: "Answer questions about the greatest players of all time.",
    },
    {
      name: "Tactics Board",
      description: "A game room for football strategy and tactics enthusiasts.",
    },
  ];

  const nigeriaStateRooms = [
    { name: "Abia Braves", description: "Join the game in God's Own State." },
    {
      name: "Adamawa Kickers",
      description: "Test your skills in the Land of Beauty.",
    },
    { name: "Akwa Ibom Stars", description: "Play in the Land of Promise." },
    {
      name: "Anambra Kings",
      description: "Compete in the Light of the Nation.",
    },
    { name: "Bauchi Strikers", description: "Battle in the Pearl of Tourism." },
    {
      name: "Bayelsa United",
      description: "Challenge yourself in the Glory of All Lands.",
    },
    {
      name: "Benue Warriors",
      description: "Compete in the Food Basket of the Nation.",
    },
    {
      name: "Borno Knights",
      description: "Join the fun in the Home of Peace.",
    },
    {
      name: "Cross River Legends",
      description: "Explore the Land of Tourism.",
    },
    {
      name: "Delta Diamonds",
      description: "Shine in the Big Heart of the Nation.",
    },
    {
      name: "Ebonyi Titans",
      description: "Compete in the Salt of the Nation.",
    },
    { name: "Edo Royals", description: "Play in the Heartbeat of the Nation." },
    {
      name: "Ekiti Champs",
      description: "Join the game in the Land of Honor.",
    },
    {
      name: "Enugu Flames",
      description: "Challenge yourself in the Coal City State.",
    },
    {
      name: "Gombe Falcons",
      description: "Play in the Jewel in the Savannah.",
    },
    {
      name: "Imo Stallions",
      description: "Join the fun in the Eastern Heartland.",
    },
    { name: "Jigawa Jets", description: "Fly high in the New World." },
    { name: "Kaduna Warriors", description: "Play in the Centre of Learning." },
    { name: "Kano Rovers", description: "Explore the Centre of Commerce." },
    {
      name: "Katsina Stars",
      description: "Shine bright in the Home of Hospitality.",
    },
    { name: "Kebbi Tigers", description: "Battle in the Land of Equity." },
    { name: "Kogi Strikers", description: "Compete in the Confluence State." },
    {
      name: "Kwara Falcons",
      description: "Soar high in the State of Harmony.",
    },
    { name: "Lagos Legends", description: "Play in the Centre of Excellence." },
    {
      name: "Nasarawa Lions",
      description: "Join the game in the Home of Solid Minerals.",
    },
    { name: "Niger Gladiators", description: "Compete in the Power State." },
    { name: "Ogun Giants", description: "Battle in the Gateway State." },
    { name: "Ondo Trailblazers", description: "Explore the Sunshine State." },
    { name: "Osun Wizards", description: "Play in the Land of Virtue." },
    { name: "Oyo Masters", description: "Compete in the Pace Setter State." },
    {
      name: "Plateau Heroes",
      description: "Explore the Home of Peace and Tourism.",
    },
    {
      name: "Rivers Sharks",
      description: "Join the game in the Treasure Base of the Nation.",
    },
    {
      name: "Sokoto Wolves",
      description: "Play in the Seat of the Caliphate.",
    },
    {
      name: "Taraba Legends",
      description: "Compete in the Nature's Gift to the Nation.",
    },
    {
      name: "Yobe Eagles",
      description: "Soar high in the Pride of the Sahel.",
    },
    {
      name: "Zamfara Hawks",
      description: "Challenge yourself in the Home of Agricultural Products.",
    },
    {
      name: "FCT Titans",
      description: "Join the game in the Centre of Unity.",
    },
  ];

  const scienceRooms = [
    {
      name: "Physics Pioneers",
      description: "Explore the wonders of motion, energy, and matter.",
    },
    {
      name: "Chemistry Lab",
      description: "Dive into the world of atoms, elements, and reactions.",
    },
    {
      name: "Biology Explorers",
      description: "Uncover the mysteries of life and living organisms.",
    },
    {
      name: "Space Odyssey",
      description: "Journey through the cosmos and explore the universe.",
    },
    {
      name: "Earth Science Hub",
      description: "Learn about the planet's structure, climate, and history.",
    },
    {
      name: "Genetics Lab",
      description: "Discover the secrets of DNA and the code of life.",
    },
    {
      name: "Tech Wizards",
      description: "Innovate with cutting-edge technology and inventions.",
    },
    {
      name: "Environmental Quest",
      description:
        "Understand ecosystems and the importance of sustainability.",
    },
    {
      name: "Quantum Realm",
      description: "Enter the mind-bending world of quantum physics.",
    },
    {
      name: "Astronomy Club",
      description: "Gaze at the stars and uncover celestial secrets.",
    },
    {
      name: "Robotics Arena",
      description: "Build and program the machines of the future.",
    },
    {
      name: "Medical Marvels",
      description: "Learn about breakthroughs in health and medicine.",
    },
    {
      name: "Geology Rocks",
      description: "Study the Earth's rocks, minerals, and natural phenomena.",
    },
    {
      name: "AI Frontiers",
      description: "Explore artificial intelligence and machine learning.",
    },
    {
      name: "Science Trivia",
      description:
        "Test your knowledge with fun and challenging science facts.",
    },
  ];

  const mindMashGames = [
    {
      name: "TypeMania",
      description:
        "A fast-paced typing game where players compete to type words or phrases as quickly and accurately as possible.",
    },
    {
      name: "Hangman",
      description:
        "A classic word-guessing game where players try to reveal a hidden word by guessing one letter at a time before running out of attempts.",
    },
    {
      name: "Anagram",
      description:
        "A challenging word puzzle game where players rearrange letters to form new words or phrases.",
    },
    {
      name: "Unscramble",
      description:
        "A fun and engaging game where players unscramble jumbled letters to discover the correct word or phrase.",
    },

    {
      name: "WordMaker",
      description:
        "Given a base word, form as many smaller words as possible using its letters. A fun and challenging game to test your vocabulary skills!",
    },
    {
      name: "LuckyFlip",
      description:
        "This game combines excitement with unpredictability, making it perfect for casual gamers and risk-takers alike.",
    },

    {
      name: "LuckyWhiz",
      description:
        "A game of luck and logic, where you make quick decisions to win. Guess correctly and rise to the top!",
    },
    {
      name: "LuckySpin",
      description:
        "Spin the wheel of fortune and guess the word or number! The more you play, the luckier you get!",
    },
  ];

  const typeManiaRooms = [
    {
      name: "Speed Racer",
      description:
        "Race against the clock to type words as quickly as possible.",
    },
    {
      name: "Perfect Precision",
      description:
        "Type each word with accuracy to score high without any mistakes.",
    },
    {
      name: "Rapid Fire",
      description: "A fast-paced typing challenge where every second counts!",
    },
    {
      name: "Accuracy Master",
      description:
        "Focus on typing correctly and fast to outpace your competitors.",
    },
    {
      name: "Timed Typist",
      description:
        "Type as many words as you can in the shortest time possible!",
    },
  ];

  const hangManRooms = [
    {
      name: "Classic Hangout",
      description:
        "Test your vocabulary skills with classic hangman challenges.",
    },
    {
      name: "Mystery Words",
      description:
        "Guess the hidden words in this thrilling hangman experience.",
    },
    {
      name: "Speed Hangman",
      description: "Race against the clock to solve hangman puzzles.",
    },
    {
      name: "Trivia Hangman",
      description:
        "Combine trivia knowledge with hangman fun in this unique room.",
    },
    {
      name: "Themed Hangman",
      description:
        "Enjoy hangman games with themes like movies, sports, and more.",
    },
  ];

  const anagramGameRooms = [
    {
      name: "Anagram Arena",
      description:
        "Compete with others to solve anagrams and climb the leaderboard.",
    },
    {
      name: "Word Shuffle",
      description:
        "Unravel the mystery of shuffled letters in this exciting game room.",
    },
    {
      name: "Quick Race",
      description:
        "Race against the clock to unscramble words and earn points.",
    },
    {
      name: "Letter Twist",
      description:
        "Test your word skills in a series of challenging anagram puzzles.",
    },
    {
      name: "Anagram Blitz",
      description:
        "A fast-paced anagram-solving room for the ultimate wordsmiths.",
    },
  ];

  const unscrambleGameRooms = [
    {
      name: "Unscramble Frenzy",
      description:
        "Solve scrambled words in a high-energy, competitive environment.",
    },
    {
      name: "Word Unjumble",
      description:
        "Relax and unscramble words at your own pace in this casual room.",
    },
    {
      name: "Unscramble Quest",
      description:
        "Embark on a journey through progressively harder unscramble challenges.",
    },
    {
      name: "Puzzle Unscramble",
      description:
        "Test your brainpower by solving intricate scrambled word puzzles.",
    },
    {
      name: "Speed Unscramble",
      description:
        "Compete against the clock to unscramble words and set records.",
    },
  ];

  const luckyFlipGameRooms = [
    {
      name: "Fortune",
      description:
        "Test your luck in the Fortune room, where every flip could lead to massive rewards or unexpected surprises.",
    },
    {
      name: "Blaze",
      description:
        "Step into Blaze, a high-energy room where the stakes are hot, and the rewards are even hotter!",
    },
    {
      name: "Goldmine",
      description:
        "Explore Goldmine, where each flip uncovers hidden treasures and massive multipliers.",
    },
    {
      name: "Spark",
      description:
        "Light up your luck in Spark, a quick-paced room designed for instant thrills and big wins.",
    },
    {
      name: "Mystic",
      description:
        "Unveil the unknown in Mystic, a room filled with secrets and magical rewards waiting to be discovered.",
    },
  ];

  const wordMakerGameRooms = [
    {
      name: "WordMaker Playground",
      description:
        "Build as many words as possible from random sets of letters.",
    },
    {
      name: "Letter Crafter",
      description: "Combine letters to craft unique and high-scoring words.",
    },
    {
      name: "WordMaker Blitz",
      description:
        "A fast-paced game where quick thinking makes you a word master.",
    },
    {
      name: "Letter Alchemy",
      description:
        "Transform scrambled letters into powerful words in this magical room.",
    },
    {
      name: "WordMaster Workshop",
      description: "Hone your word-making skills and outsmart your opponents.",
    },
  ];

  const luckyWhizGameRooms = [
    {
      name: "Whiz Fortune",
      description:
        "Test your luck and knowledge in this exciting game of chance.",
    },
    {
      name: "Trivia Jackpot",
      description:
        "Spin the wheel and answer trivia for a chance to hit the jackpot.",
    },
    {
      name: "Lucky Genius",
      description: "Combine your wits and luck to outshine your opponents.",
    },
    {
      name: "Fortune Frenzy",
      description:
        "A high-stakes game where luck and quick thinking are your best allies.",
    },
    {
      name: "Spin & Win",
      description: "Spin the wheel, answer questions, and claim your winnings!",
    },
  ];

  const luckySpinGameRooms = [
    {
      name: "Spin Mania",
      description:
        "Spin the wheel and win big rewards in this thrilling game room.",
    },
    {
      name: "Wheel of Fortune",
      description: "Test your luck and take a chance to claim amazing prizes.",
    },
    {
      name: "Lucky Spins Galore",
      description:
        "Endless spins and endless fun in this ultimate lucky spin challenge.",
    },
    {
      name: "Fortune Spin",
      description: "Step up, spin the wheel, and let fortune decide your fate.",
    },
    {
      name: "Golden Wheel",
      description:
        "A high-stakes spinning game where luck is the ultimate treasure.",
    },
  ];

  // await prisma.gameRoom.createMany({ data: luckyFlipGameRooms.map(p => ({...p, catId: "cm5v9hv6200008aox1sjuemwv" }))})
  // console.log("Data created")

  // await prisma.gameCategory.createMany({ data: mindMashGames.map((item) => ({...item, gameId: "cm58umo4c0000cniowaf6gc5c" }))});
  // console.log("Data created")
};

const executeRecords = async () => {
  // await insertPlanFeatures()
  // await prisma.user.deleteMany();
  // await createDummyUsers();
  // await createDummyRedisMonthlyScoreRecord()
  // await deleteAllRecords()
  // clearRedisKeysByPattern(`player:*:category:*:2024:12:today:3`)
  // await getTopRankingPlayersOfTheYearByCategory();
  await addGameCategories();
};

executeRecords();

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
