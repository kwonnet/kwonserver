
import express from "express";
import { authMiddleware } from "@/middleware";
import { getPaymentLinkController, syncFlwSubscriptionPlansController, verifyFlwPaymentController } from "@/controllers/v1/payments";

const router = express.Router();

router.post("/flw/link", authMiddleware(), getPaymentLinkController)

router.get("/flw/verify", verifyFlwPaymentController)

router.post("/flw/sync-subscription-plans", authMiddleware(false),  syncFlwSubscriptionPlansController)

const paymentRoutes = router

export default paymentRoutes

