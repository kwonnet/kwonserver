"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const middleware_1 = require("@/middleware");
const locations_1 = require("@/controllers/v1/locations");
const router = express_1.default.Router();
router.get("/", (0, middleware_1.authMiddleware)(), locations_1.getContinentsAndCountriesController);
const locationRoutes = router;
exports.default = locationRoutes;
