
import { createTaskController, getTaskController, getTasksController, getUserCompletedTasksController } from "@/controllers/v1/task";
import { authMiddleware } from "@/middleware";
import express from "express";

const router = express.Router();

router.post("/", authMiddleware(), createTaskController)

router.get("/users/:id/completed", authMiddleware(), getUserCompletedTasksController)

router.get("/:id", getTaskController)

router.get("/", authMiddleware(), getTasksController)

const taskRoutes = router

export default taskRoutes
