"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const notifications_1 = require("@/controllers/v1/notifications");
const router = express_1.default.Router();
router.post("/subscribe", (0, middleware_1.authMiddleware)(), notifications_1.subscribePushNotifController);
// router.post("/unsubscribe", authMiddleware, cancelSubscriptionController)
const notificationsRoutes = router;
exports.default = notificationsRoutes;
