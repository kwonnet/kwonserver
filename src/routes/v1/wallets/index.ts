import {withdrawalSettingsController,withdrawalBanksController,resolveWithdrawalBankController,quoteCoinWithdrawalController,confirmCoinWithdrawalController,listCoinWithdrawalsController,withdrawalStatusController} from '@/controllers/v1/wallets';

import {getPurchasesController,getRefundQuoteController,requestRefundController,refundStatusController} from "@/controllers/v1/wallets";
import express from "express";
import { authMiddleware } from "@/middleware";
import { claimDailyBonusController, claimDailyTaskController, fundCoinsController, getTxnHistoryController, getUserCoinsWalletController, transferCoinsController } from "@/controllers/v1/wallets";

const router = express.Router();

router.get("/", authMiddleware(), getUserCoinsWalletController)

router.post("/transfer", authMiddleware(), transferCoinsController)

router.post("/fund", authMiddleware(), fundCoinsController)

router.get("/purchases",authMiddleware(),getPurchasesController);
router.get("/purchases/:id/refund",authMiddleware(),getRefundQuoteController);
router.post("/purchases/:id/refund",authMiddleware(),requestRefundController);
router.post("/refunds/:id/verify",authMiddleware(),refundStatusController);

router.get("/history", authMiddleware(), getTxnHistoryController)

router.post("/daily-bonus", authMiddleware(), claimDailyBonusController)

router.post("/daily-task", authMiddleware(), claimDailyTaskController)

router.get('/withdrawals/settings',authMiddleware(),withdrawalSettingsController);
router.get('/withdrawals/banks',authMiddleware(),withdrawalBanksController);
router.post('/withdrawals/banks/resolve',authMiddleware(),resolveWithdrawalBankController);
router.post('/withdrawals/quote',authMiddleware(),quoteCoinWithdrawalController);
router.post('/withdrawals/:id/confirm',authMiddleware(),confirmCoinWithdrawalController);
router.get('/withdrawals',authMiddleware(),listCoinWithdrawalsController);
router.post('/withdrawals/:id/verify',authMiddleware(),withdrawalStatusController);
const walletRoutes = router

export default walletRoutes
