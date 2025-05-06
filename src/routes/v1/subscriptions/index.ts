
import express from "express";
import { authMiddleware } from "@/middleware";
import { cancelSubscriptionController, getSubscriptionPlansController, getSubTmaInvoiceController, subscriptionPremiumController } from "@/controllers/v1/subscriptions";

const router = express.Router();

router.get("/plans", getSubscriptionPlansController)

router.post("/premium", authMiddleware(), subscriptionPremiumController)

router.post("/cancel", authMiddleware(), cancelSubscriptionController)

router.post("/invoices", authMiddleware(), getSubTmaInvoiceController)

const subscriptionRoutes = router

export default subscriptionRoutes
