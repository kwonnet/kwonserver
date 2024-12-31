import express from "express";
import { getTmaPaymentInvoiceController, purchaseCoinsController, getCoinsController } from "@/controllers/coins";
import { authMiddleware } from "@/middleware";

const router = express.Router();

router.get("/", getCoinsController)

router.post("/invoices", authMiddleware, getTmaPaymentInvoiceController)

router.post("/purchase", authMiddleware, purchaseCoinsController)

export default router