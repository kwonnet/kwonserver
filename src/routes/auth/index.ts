import express, {  } from "express";
import { authMiddleware } from "@/middleware";
import { authController, getMeController, refreshTokenController } from "@/controllers/auth";

const router = express.Router();

router.post("/", authController)

router.post("/refresh-token", refreshTokenController)

router.get("/me", authMiddleware, getMeController)


export default router