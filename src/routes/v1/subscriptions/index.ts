import {subscriptionChangeQuoteController,subscriptionCatalogController,subscriptionCheckoutController,subscriptionCheckoutStatusController,subscriptionAdminController} from '@/controllers/v1/subscriptions';

import {accountBenefitsController} from "@/controllers/v1/subscriptions";
import express from "express";
import { authMiddleware } from "@/middleware";
import { cancelSubscriptionController, getSubscriptionPlansController, subscriptionPremiumController } from "@/controllers/v1/subscriptions";

const router = express.Router();
router.get('/catalog',authMiddleware(),subscriptionCatalogController);
router.post('/change-quote',authMiddleware(),subscriptionChangeQuoteController);
router.post('/checkouts',authMiddleware(),subscriptionCheckoutController);
router.get('/checkouts/:id',authMiddleware(),subscriptionCheckoutStatusController);
router.get('/admin',authMiddleware(),subscriptionAdminController);
router.post('/admin/trials',authMiddleware(),subscriptionAdminController);
router.delete('/admin/trials/:id',authMiddleware(),subscriptionAdminController);

router.get("/benefits",authMiddleware(),accountBenefitsController);

router.get("/plans", getSubscriptionPlansController)

router.post("/premium", authMiddleware(), subscriptionPremiumController)

router.post("/cancel", authMiddleware(), cancelSubscriptionController)

const subscriptionRoutes = router

export default subscriptionRoutes
