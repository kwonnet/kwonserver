
import express from "express";
import { authMiddleware } from "@/middleware";
import { subscribePushNotifController } from "@/controllers/v1/notifications";

const router = express.Router();

router.post("/subscribe", authMiddleware(), subscribePushNotifController)

// router.post("/unsubscribe", authMiddleware, cancelSubscriptionController)


const notificationsRoutes = router

export default notificationsRoutes
