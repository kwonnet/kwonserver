"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const coins_1 = require("@/controllers/v1/coins");
const middleware_1 = require("@/middleware");
const router = express_1.default.Router();
router.get("/", coins_1.getCoinsController);
router.post("/invoices", (0, middleware_1.authMiddleware)(), coins_1.getTmaPaymentInvoiceController);
router.post("/purchase", (0, middleware_1.authMiddleware)(), coins_1.purchaseCoinsController);
const coinRoutes = router;
exports.default = coinRoutes;
