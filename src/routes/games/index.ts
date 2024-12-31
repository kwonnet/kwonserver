import express from "express";
import { createGameCategoryController, createGameCategoryRoomController, createGameController, getGameCategoriesController, getGameCategoriesRankingsController, getGameCategoryRoomsController, getGameLeaderboardController, getGamePlayerRankingsController, getGamesController, getGamesRankingArchiveController, getGamesRankingArchiveStatsController, getGameWinnersController, getGameWinnersStatsController, getUserGameRankingArchiveController, getUserGamesRankingArchiveStatsController } from "@/controllers/games";
import { authMiddleware } from "@/middleware";

const router = express.Router();

router.post("/", createGameController)

router.get("/", getGamesController)

router.post("/categories", createGameCategoryController)

router.post("/categories/:id/rooms", createGameCategoryRoomController)

router.get("/leaderboard", getGameLeaderboardController)

router.get("/categories/rankings", authMiddleware, getGameCategoriesRankingsController)

router.get("/categories/ranking-archive/stats", authMiddleware, getGamesRankingArchiveStatsController)

router.get("/categories/ranking-archive", authMiddleware, getGamesRankingArchiveController)

router.get("/categories/:id", getGameCategoriesController)

router.get("/categories/:id/rooms", getGameCategoryRoomsController)

router.get("/users/:id/ranking-archive/stats", authMiddleware, getUserGamesRankingArchiveStatsController)

router.get("/users/:id/ranking-archive", authMiddleware, getUserGameRankingArchiveController)

router.get("/users/:id/rankings", authMiddleware, getGamePlayerRankingsController)

router.get("/winners/stats", authMiddleware, getGameWinnersStatsController)

router.get("/winners", authMiddleware, getGameWinnersController)



export default router