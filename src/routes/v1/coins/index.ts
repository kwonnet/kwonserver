import express from "express";
import { purchaseCoinsController, getCoinsController } from "@/controllers/v1/coins";
import { authMiddleware } from "@/middleware";

const router = express.Router();

router.get("/", getCoinsController)

router.post("/purchase", authMiddleware(), purchaseCoinsController)

const coinRoutes = router

export default coinRoutes
