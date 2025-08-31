"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const task_1 = require("@/controllers/v1/task");
const middleware_1 = require("@/middleware");
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
router.post("/", (0, middleware_1.authMiddleware)(), task_1.createTaskController);
router.get("/users/:id/completed", (0, middleware_1.authMiddleware)(), task_1.getUserCompletedTasksController);
router.get("/:id", task_1.getTaskController);
router.get("/", (0, middleware_1.authMiddleware)(), task_1.getTasksController);
const taskRoutes = router;
exports.default = taskRoutes;
