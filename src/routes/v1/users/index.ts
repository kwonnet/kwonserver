
import express from "express";
import { authMiddleware } from "@/middleware";
import { blockUserController, followUserController, getConnectionsController, getUserProfileOverviewController, muteUserController, profileVisitorController, reportUserController, searchUserController, searchUsersController, userAchievementsController, userActiveSubscriptionController, userLocationController, userStatsController, userUserTaskSettingsController } from "@/controllers/v1/users";

const router = express.Router();

router.post("/search", authMiddleware(), searchUserController)

router.get("/search", authMiddleware(), searchUsersController)

router.get("/:id/achievements", authMiddleware(), userAchievementsController)

router.get("/:id/stats", authMiddleware(), userStatsController)

router.get("/:id/pro", authMiddleware(), userActiveSubscriptionController)

router.get("/:id/task-settings", authMiddleware(), userUserTaskSettingsController)

router.post("/follows", authMiddleware(), followUserController)

router.post("/locations", authMiddleware(), userLocationController)

router.get("/connections", authMiddleware(), getConnectionsController)

router.get("/:id/overview", authMiddleware(), getUserProfileOverviewController)

router.post("/:id/block", authMiddleware(), blockUserController)

router.post("/:id/mute", authMiddleware(), muteUserController)

router.post("/:id/reports", authMiddleware(), reportUserController)

router.post("/:id/visitors", authMiddleware(), profileVisitorController)

const userRoutes = router

export default userRoutes
