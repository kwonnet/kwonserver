import prisma from "@/db";
import redisClient from "@/redis";
import {
  AcronymGameAnswer,
  GameCatType,
  GamePlayerInfo,
  GameRoomAnswer,
  GameType,
  SocketGameRoom,
  ThemedGameAnswer,
  User,
} from "@/types";
import {
  generateUniqueRef,
  getPlayerRankingKey,
  getPlayerRedisKeys,
  getPlayerRewardKeys,
  parseStringNumbers,
} from "@/utils";
import { GameMode, Wallet } from "@prisma/client";
import wordlist from 'wordlist-english';
import {logServiceError,logServiceTrace} from '@/logger/events'; // ES Modules


export const getRedisHashKey = async <T = any>(key: string) => {
  const result = await redisClient.hGetAll(key);

  if (Object.values(result).length === 0) return null;

  return parseStringNumbers(result) as T;
};

// PostgreSQL is authoritative. Never overwrite committed balances with a Redis snapshot.
// Keep these exported names for existing callers during the cutover.
export const syncRedisUserWalletToPrisma = async (_userId: string) => ({ message: "PostgreSQL wallet is authoritative", isError: false });
export const syncRedisSenderRecipientWalletToPrisma = async (_senderId: string, _recipientId: string) => ({
  message: "PostgreSQL wallets are authoritative", isError: false,
  data: { isSenderExists: true, isRecipientExists: true },
});
export const syncPrismaUserWalletToRedis = async (userId: string, _wallet: Wallet) => {
  try {
    // Invalidation avoids out-of-order asynchronous snapshots overwriting newer ones.
    await redisClient.del(`user:${userId}:wallet`);
    return { message: "Wallet cache invalidated", isError: false };
  } catch (serviceError) {
    logServiceError("helper", "syncPrismaUserWalletToRedis", serviceError);

    // A committed payment must not be reported as failed because its cache is down.
    return { message: "Wallet committed; cache invalidation unavailable", isError: true };
  }
};
export const syncPrismaSenderRecipientWalletToRedis = async (args: {
  isSenderExists: boolean; isRecipientExists: boolean; senderWallet: Wallet; recipientWallet: Wallet;
}) => {
  await Promise.all([syncPrismaUserWalletToRedis(args.senderWallet.userId, args.senderWallet),
    syncPrismaUserWalletToRedis(args.recipientWallet.userId, args.recipientWallet)]);
};

// Function to get leaderboard
export const getRewardTopRankingPlayers = async (
  {
    page,
    limit,
    catId,
    rankingKey,
    mode
  }: {
    page: number;
    limit: number;
    catId: string;
    rankingKey: string;
    mode: "single" | "multi"
  },
  rewardType: "MONTH" | "WEEK" | "DAY"
) => {
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
      const playerKeys = getPlayerRedisKeys(item.value, catId, mode);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      // Get player's rank from the sorted set leaderboard
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player stat
      const keys = getPlayerRewardKeys(item.value, catId, mode);
      const key =
        rewardType === "MONTH"
          ? keys.month
          : rewardType === "WEEK"
          ? keys.week
          : keys.day;
      const stat = await redisClient.hGetAll(key);
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, item.value);
      // to get the rank of each player without zRevRank, we can use
      // const rank = offset + index + 1
      // provided "limit" will remain constant
      return {
        ...player,
        score: parseInt(stat.score, 10) || 0,
        numPlayed: parseInt(stat.numPlayed, 10) || 0,
        rank: playerRank !== null ? playerRank + 1 : 0,
      };
    })
  );
  return playersData;
};

// Function to get a category ranking based on MONTH, WEEK or DAY using offset
export const getCategoryRankingPlayerData = async (
  {
    offset,
    limit,
    catId,
    rankingKey,
    mode
  }: {
    offset: number;
    limit: number;
    catId: string;
    rankingKey: string;
    mode: "single" | "multi"
  },
  type: "MONTH" | "WEEK" | "DAY"
) => {
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
      const playerKeys = getPlayerRedisKeys(item.value, catId, mode);
      // Get player details from hash
      const playerInfo = await redisClient.hGetAll(playerKeys.info);
      // Get player's rank from the sorted set leaderboard
      const player = playerInfo as unknown as GamePlayerInfo;
      // Get player stat
      const keys = getPlayerRewardKeys(item.value, catId, mode);
      const key =
        type === "MONTH" ? keys.month : type === "WEEK" ? keys.week : keys.day;
      const stat = await redisClient.hGetAll(key);
      // Get player's rank from the sorted set leaderboard
      const playerRank = await redisClient.zRevRank(rankingKey, item.value);
      // to get the rank of each player without zRevRank, we can use
      // const rank = offset + index + 1
      // provided "limit" will remain constant
      return {
        ...player,
        score: parseInt(stat.score, 10) || 0,
        numPlayed: parseInt(stat.numPlayed, 10) || 0,
        rank: playerRank !== null ? playerRank + 1 : 0,
      };
    })
  );
  return playersData;
};

export const getGameType = (gameName: string) => {
  const name = gameName.toLowerCase();
  if (name.includes("acronym")) return GameType.ACRONYM;
  if (name.includes("academia")) return GameType.ACADEMIA;
  if (name.includes("sports")) return GameType.SPORTS;
  if (name.includes("country")) return GameType.COUNTRY;
  if (name.includes("mindmash")) return GameType.MINDMASH;
  return GameType.TRIVIA;
};

export const getGameCatType = (catName: string) => {
  const name = catName.toLowerCase();
  if (name.includes(GameCatType.ANAGRAM.toLowerCase())) return GameCatType.ANAGRAM;
  if (name.includes(GameCatType.HANGMAN.toLowerCase())) return GameCatType.HANGMAN;
  if (name.includes(GameCatType.TYPEMANIA.toLowerCase())) return GameCatType.TYPEMANIA;
  if (name.includes(GameCatType.UNSCRAMBLE.toLowerCase())) return GameCatType.UNSCRAMBLE;
  if (name.includes(GameCatType.LUCKYSPIN.toLowerCase())) return GameCatType.LUCKYSPIN;
  if (name.includes(GameCatType.LUCKYWHIZ.toLowerCase())) return GameCatType.LUCKYWHIZ;
  if (name.includes(GameCatType.WORDMAKER.toLowerCase())) return GameCatType.WORDMAKER;
  if (name.includes(GameCatType.LUCKYFLIP.toLowerCase())) return GameCatType.LUCKYFLIP;
  return undefined;
};

export const composeGameAnswer = ({
  params,
  room,
  user,
}: {
  params: GameRoomAnswer;
  user: User;
  room: SocketGameRoom;
}):AcronymGameAnswer | ThemedGameAnswer  => {
  if (params.gameType === GameType.ACRONYM) {
    const body: AcronymGameAnswer = {
      ...params,
      votes: [],
      name: user.name,
      room: room.name,
      roomId: room.id,
      catId: room.catId,
      playerId: user.id,
      answerId: generateUniqueRef(),
      gameType: GameType.ACRONYM,
      voted: false,
      score: 0,
      mode: room.mode
    };
    return body;
  }
  const body: ThemedGameAnswer = {
    ...params,
    roomId: room.id,
    catId: room.catId,
    playerId: user.id,
    name: user.name,
    mode: room.mode
  };
  return body;
};

// Helper function to get the frequency of each letter in the word
function getLetterFrequency(word: string): { [key: string]: number } {
  const freq: { [key: string]: number } = {};

  for (let char of word) {
    freq[char] = (freq[char] || 0) + 1;
  }

  return freq;
}
function canFormFromBaseWord(baseWord: string, word: string): boolean {
  const baseWordFreq = getLetterFrequency(baseWord);
  const wordFreq = getLetterFrequency(word);
  // Check if every letter in the word is present in baseWord with enough frequency
  for (let letter in wordFreq) {
    if (!baseWordFreq[letter] || baseWordFreq[letter] < wordFreq[letter]) {
      return false;
    }
  }

  return true;
}

function filterWordsFromBaseWord(baseWord: string, guesses: { text: string, timer: number }[]) {
  return guesses.filter(g => canFormFromBaseWord(baseWord, g.text));
}

export const calculateWordMakerPlayerScore = (baseWord:string,entries: {
  timer: number;
  text: string;
}[]) => {
    logServiceTrace("helper", "calculateWordMakerPlayerScore", "Base word: ");
    const words:string[] = wordlist['english'];
    // filter words with length greater than 2
    const playerEntries = entries.filter(w => w.text.length > 2)
    logServiceTrace("helper", "calculateWordMakerPlayerScore", "playerEntries: ");
    // get valid words from base word
    const validBaseWords =  filterWordsFromBaseWord(baseWord.toLocaleLowerCase(), playerEntries)
    logServiceTrace("helper", "calculateWordMakerPlayerScore", "valid words ");
    // check if english words exist
    const validEnglishWords = validBaseWords.filter(w => words.includes(w.text))
    logServiceTrace("helper", "calculateWordMakerPlayerScore", "englishWords: ");
    // calculate score
    const score =  validEnglishWords.reduce((total, item) => {
      return total + (item.text.length * 5) + item.timer; // Sum up scores for all guesses
    }, 0);

    return {score, answer: validEnglishWords.map(i => i.text).join(",")};

}



