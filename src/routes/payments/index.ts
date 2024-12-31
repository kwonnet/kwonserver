
import express from "express";
import { authMiddleware } from "@/middleware";
import { getPaymentLinkController, verifyFlwPaymentController } from "@/controllers/payments";

const router = express.Router();

router.post("/link", authMiddleware, getPaymentLinkController)

router.get("/verify", verifyFlwPaymentController)

export default router
