
import {accountBenefitsController} from "@/controllers/v1/subscriptions";
import express from "express";
import { authMiddleware } from "@/middleware";
import { cancelSubscriptionController, getSubscriptionPlansController, subscriptionPremiumController } from "@/controllers/v1/subscriptions";

const router = express.Router();

router.get("/benefits",authMiddleware(),accountBenefitsController);

router.get("/plans", getSubscriptionPlansController)

router.post("/premium", authMiddleware(), subscriptionPremiumController)

router.post("/cancel", authMiddleware(), cancelSubscriptionController)

const subscriptionRoutes = router

export default subscriptionRoutes
