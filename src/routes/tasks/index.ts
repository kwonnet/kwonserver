
import { createTaskController, getTaskController, getTasksController, getUserCompletedTasksController } from "@/controllers/task";
import { authMiddleware } from "@/middleware";
import express from "express";

const router = express.Router();

router.post("/", authMiddleware, createTaskController)

router.get("/users/:id/completed", authMiddleware, getUserCompletedTasksController)

router.get("/:id", getTaskController)

router.get("/", authMiddleware, getTasksController)


export default router
