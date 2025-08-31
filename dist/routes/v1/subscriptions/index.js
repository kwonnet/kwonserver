"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const subscriptions_1 = require("@/controllers/v1/subscriptions");
const router = express_1.default.Router();
router.get("/plans", subscriptions_1.getSubscriptionPlansController);
router.post("/premium", (0, middleware_1.authMiddleware)(), subscriptions_1.subscriptionPremiumController);
router.post("/cancel", (0, middleware_1.authMiddleware)(), subscriptions_1.cancelSubscriptionController);
router.post("/invoices", (0, middleware_1.authMiddleware)(), subscriptions_1.getSubTmaInvoiceController);
const subscriptionRoutes = router;
exports.default = subscriptionRoutes;
