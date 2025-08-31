"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const payments_1 = require("@/controllers/v1/payments");
const router = express_1.default.Router();
router.post("/flw/link", (0, middleware_1.authMiddleware)(), payments_1.getPaymentLinkController);
router.get("/flw/verify", payments_1.verifyFlwPaymentController);
router.post("/flw/verify", payments_1.verifyFlwPaymentController);
router.post("/flw/sync-subscription-plans", (0, middleware_1.authMiddleware)(), payments_1.syncFlwSubscriptionPlansController);
const paymentRoutes = router;
exports.default = paymentRoutes;
