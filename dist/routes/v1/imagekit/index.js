"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const imagekit_1 = require("@/controllers/v1/imagekit");
const router = express_1.default.Router();
router.post("/", (0, middleware_1.authMiddleware)(), imagekit_1.getImagekitAuthParams);
router.delete("/:fileId", (0, middleware_1.authMiddleware)(), imagekit_1.deleteImagekitFile);
const imagekitRoutes = router;
exports.default = imagekitRoutes;
