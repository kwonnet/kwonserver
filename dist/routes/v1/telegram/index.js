"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telegram_1 = require("@/controllers/v1/telegram");
const router = express_1.default.Router();
router.get("/", telegram_1.getWebhookController);
const telegramRoutes = router;
exports.default = telegramRoutes;
