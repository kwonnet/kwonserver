"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const auth_1 = require("@/controllers/v1/auth");
const router = express_1.default.Router();
router.post("/signup", auth_1.signUpController);
router.post("/signin", auth_1.signInController);
router.post("/refresh-token", auth_1.refreshTokenController);
router.get("/me", (0, middleware_1.authMiddleware)({ checkPermWithEmail: true }), auth_1.getMeController);
const authRoutes = router;
exports.default = authRoutes;
