
import express from "express";
import { authMiddleware } from "@/middleware";
import { subscribePushNotifController, unsubscribePushNotifController, authorNotificationSubscriptionController } from "@/controllers/v1/notifications";

const router = express.Router();

router.post("/subscribe", authMiddleware(), subscribePushNotifController)

router.post("/unsubscribe", authMiddleware(), unsubscribePushNotifController)

router.get('/authors/:authorId', authMiddleware(), authorNotificationSubscriptionController);
router.put('/authors/:authorId', authMiddleware(), authorNotificationSubscriptionController);


const notificationsRoutes = router

export default notificationsRoutes
