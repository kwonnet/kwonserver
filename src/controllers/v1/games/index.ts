import { Response } from "express";
import type {Request} from "@/types/express";
import {
  createGame,
  createGameCategory,
  createGameCategoryRoom,
  getGameCategories,
  getGameCategoriesRankings,
  getGameCategoryRooms,
  getGameLeaderboard,
  getGamePlayerRankings,
  getGames,
  getGamesRankingArchiveData,
  getGamesRankingArchiveStats,
  getGameWinners,
  getGameWinnersStats,
  getUserGameRankingArchiveData,
  getUserGamesRankingArchiveStats,
} from "@/services/v1/games";
import {
  createGameCategoryRoomSchema,
  createGameCategorySchema,
  createGameSchema,
  querySchema,
  userRankQuerySchema,
  winnersQuerySchema,
} from "@/schema/gameSchema";
import { validateZodInput } from "@/utils";
import { GameMode } from "@prisma/client";

export const getGameLeaderboardController = async (
  req: Request,
  res: Response
) => {
  const query = req.query as { [key: string]: string };
  const page = parseInt(query?.page ?? 1);
  const limit = parseInt(query?.limit ?? 10);
  const catId = query.catId;
  const ranking = query.ranking;
  const _mode = query?.mode?.toUpperCase()
  if(!Object.values(GameMode).includes(_mode as GameMode)){
    return res.status(400).send("Invalid mode value - value can be either single or multi")
  }
  const mode =  _mode === GameMode.MULTI ? GameMode.MULTI : GameMode.SINGLE
  const data = await getGameLeaderboard({ page, limit, catId, ranking, mode });
  return res.json(data);
};

export const createGameController = async (req: Request, res: Response) => {
  try {
    const zodResult = await createGameSchema.parseAsync(req.body);
    const result = await createGame(zodResult);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGamesController = async (req: Request, res: Response) => {
  try {
    const result = await getGames();
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createGameCategoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = await createGameCategorySchema.parseAsync(req.body);
    const result = await createGameCategory(zodResult);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createGameCategoryRoomController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = await createGameCategoryRoomSchema.parseAsync(req.body);
    const result = await createGameCategoryRoom(zodResult);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGameCategoriesController = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await getGameCategories(req.params.id);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGameCategoryRoomsController = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await getGameCategoryRooms(req.params.id, String(req.query.mode));
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGamePlayerRankingsController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = validateZodInput(req.query as any, userRankQuerySchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const mode = "multi"

    const result = await getGamePlayerRankings(
      zodData.userId,
      zodData.rankType,
      mode
    );
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGameWinnersStatsController = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await getGameWinnersStats();
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getGameWinnersController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = validateZodInput(req.query as any, winnersQuerySchema);

    const zodData = zodResult.data;

    console.log(zodData);

    if (!zodData) return res.status(400).send(zodResult.message);
    const result = await getGameWinners(zodData);
    console.log(result);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getGameCategoriesRankingsController = async (
  req: Request,
  res: Response
) => {
  try {
    const rankingTypeSchema = userRankQuerySchema.pick({ rankType: true, mode: true });

    const zodResult = validateZodInput(req.query as any, rankingTypeSchema);

    const zodData = zodResult.data;

    console.log("RankingsController ", zodData);

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await getGameCategoriesRankings(zodData.rankType, zodData.mode);

    console.log("Ranking result ", result);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getGamesRankingArchiveStatsController = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await getGamesRankingArchiveStats();
    // console.log(result)
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getGamesRankingArchiveController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = validateZodInput(req.query as any, winnersQuerySchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await getGamesRankingArchiveData(zodData);
    console.log("Archive data ", result)
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserGamesRankingArchiveStatsController = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await getUserGamesRankingArchiveStats(String(req.user?.id));
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserGameRankingArchiveController = async (
  req: Request,
  res: Response
) => {
  try {
    const userArchiveSchema = querySchema.pick({
      catId: true,
      month: true,
      year: true,
      userId: true,
    });
    const zodResult = validateZodInput(req.query as any, userArchiveSchema);

    const zodData = zodResult.data;

    console.log("user ranking archive",zodData)

    if (!zodData) return res.status(400).send(zodResult.message);
    const result = await getUserGameRankingArchiveData(zodData);
    console.log("user ranking archive",result)
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};
