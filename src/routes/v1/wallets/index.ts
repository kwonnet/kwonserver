
import express from "express";
import { authMiddleware } from "@/middleware";
import { claimDailyBonusController, claimDailyTaskController, fundCoinsController, getProofTokenController, getTxnHistoryController, getUserCoinsWalletController, saveUserWalletAddressController, transferCoinsController, withdrawCoinsController } from "@/controllers/v1/wallets";

const router = express.Router();

router.get("/", authMiddleware(), getUserCoinsWalletController)

router.get("/proof", authMiddleware(), getProofTokenController)

router.post("/addresses", authMiddleware(), saveUserWalletAddressController)

router.post("/transfer", authMiddleware(), transferCoinsController)

router.post("/withdraw", authMiddleware(), withdrawCoinsController)

router.post("/fund", authMiddleware(), fundCoinsController)

router.get("/history", authMiddleware(), getTxnHistoryController)

router.post("/daily-bonus", authMiddleware(), claimDailyBonusController)

router.post("/daily-task", authMiddleware(), claimDailyTaskController)

const walletRoutes = router

export default walletRoutes
