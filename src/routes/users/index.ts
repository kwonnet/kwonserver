
import express from "express";
import { authMiddleware } from "@/middleware";
import { searchUserController, userAchievementsController, userActiveSubscriptionController, userStatsController } from "@/controllers/users";

const router = express.Router();

router.post("/search", authMiddleware, searchUserController)

router.get("/:id/achievements", authMiddleware, userAchievementsController)

router.get("/:id/stats", authMiddleware, userStatsController)

router.get("/:id/pro", authMiddleware, userActiveSubscriptionController)





export default router
