
import express from "express";
import { authMiddleware } from "@/middleware";
import { bachsConfigController, createBachsCheckoutController, bachsStatusController, bachsWebhookController, getPaymentLinkController, syncFlwSubscriptionPlansController, verifyFlwPaymentController } from "@/controllers/v1/payments";

const router = express.Router();
router.get('/bachs/config', authMiddleware(), bachsConfigController);
router.post('/bachs/checkouts', authMiddleware(), createBachsCheckoutController);
router.get('/bachs/checkouts/:id', authMiddleware(), bachsStatusController);
router.post('/bachs/checkouts/:id/verify', authMiddleware(), bachsStatusController);
router.post('/bachs/webhook', bachsWebhookController);

router.post("/flw/link", authMiddleware(), getPaymentLinkController)

router.get("/flw/verify", verifyFlwPaymentController)

router.post("/flw/verify", verifyFlwPaymentController)

router.post("/flw/sync-subscription-plans", authMiddleware(),  syncFlwSubscriptionPlansController)

const paymentRoutes = router

export default paymentRoutes

