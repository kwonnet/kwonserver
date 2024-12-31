
import express from "express";
import { authMiddleware } from "@/middleware";
import { cancelSubscriptionController, getSubscriptionPlansController, getSubTmaInvoiceController, subscriptionPremiumController } from "@/controllers/subscriptions";

const router = express.Router();

router.get("/plans", getSubscriptionPlansController)

router.post("/premium", authMiddleware, subscriptionPremiumController)

router.post("/cancel", authMiddleware, cancelSubscriptionController)

router.post("/invoices", authMiddleware, getSubTmaInvoiceController)


export default router
