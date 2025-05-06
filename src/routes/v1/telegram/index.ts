
import express from "express";
import { getWebhookController } from "@/controllers/v1/telegram";

const router = express.Router();

router.get("/",  getWebhookController)

const telegramRoutes = router

export default telegramRoutes
