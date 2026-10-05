
import { engagementTasksController, engagementClaimController, engagementAdminController, createTaskController, getTaskController, getTasksController, getUserCompletedTasksController } from "@/controllers/v1/task";
import { authMiddleware } from "@/middleware";
import express from "express";

const router = express.Router();

router.get("/engagement", authMiddleware({checkPermission:true}), engagementTasksController)
router.post("/engagement/:id/claim", authMiddleware({checkPermission:true}), engagementClaimController)
router.patch("/engagement/:id", authMiddleware({checkPermission:true}), engagementAdminController)

router.post("/", authMiddleware({checkPermission:true}), createTaskController)

router.get("/users/:id/completed", authMiddleware(), getUserCompletedTasksController)

router.get("/:id", getTaskController)

router.get("/", authMiddleware(), getTasksController)

const taskRoutes = router

export default taskRoutes
