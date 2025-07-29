import express from "express";
import { getTipsController } from "@/controllers/v1/tips";
import { authMiddleware } from "@/middleware";

const router = express.Router();

router.get("/", authMiddleware(), getTipsController)

const tipRoutes = router

export default tipRoutes
