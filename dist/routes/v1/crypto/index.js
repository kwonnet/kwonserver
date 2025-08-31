"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = require("@/controllers/v1/crypto");
const router = express_1.default.Router();
router.get("/addresses", crypto_1.getWalletAddressesController);
const cryptoRoutes = router;
exports.default = cryptoRoutes;
