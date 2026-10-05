import express, {  } from "express";
import { authMiddleware } from "@/middleware";
import { googleSignInController, getMeController, logoutController, refreshTokenController, signInController, signUpController } from "@/controllers/v1/auth";

const router = express.Router();

router.post("/signup", signUpController)

router.post("/signin", signInController)
router.post("/google", googleSignInController)
router.post("/logout", logoutController)

router.post("/refresh-token", refreshTokenController)

router.get("/me", authMiddleware({checkPermWithEmail: true}), getMeController)

const authRoutes = router

export default authRoutes;
