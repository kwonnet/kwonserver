import express from "express";
import { getTmaPaymentInvoiceController, purchaseCoinsController, getCoinsController } from "@/controllers/v1/coins";
import { authMiddleware } from "@/middleware";

const router = express.Router();

router.get("/", getCoinsController)

router.post("/invoices", authMiddleware(), getTmaPaymentInvoiceController)

router.post("/purchase", authMiddleware(), purchaseCoinsController)

const coinRoutes = router

export default coinRoutes
