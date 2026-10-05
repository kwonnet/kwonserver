
import express from "express";
import { authMiddleware } from "@/middleware";
import { subscribePushNotifController, unsubscribePushNotifController } from "@/controllers/v1/notifications";

const router = express.Router();

router.post("/subscribe", authMiddleware(), subscribePushNotifController)

router.post("/unsubscribe", authMiddleware(), unsubscribePushNotifController)


const notificationsRoutes = router

export default notificationsRoutes
