import express, {  } from "express";
import { authMiddleware } from "@/middleware";
import { accountSettingsController, passwordUpdateController, authSessionsController, loginEventsController, revokeAuthSessionController, googleSignInController, getMeController, logoutController, refreshTokenController, signInController, signUpController } from "@/controllers/v1/auth";

const router = express.Router();

router.post("/signup", signUpController)

router.post("/signin", signInController)
router.post("/google", googleSignInController)
router.post("/logout", logoutController)

router.post("/refresh-token", refreshTokenController)

router.get("/me", authMiddleware({checkPermWithEmail: true}), getMeController)

router.get("/session-status", authMiddleware(), getMeController)

router.get("/settings", authMiddleware(), accountSettingsController)
router.patch("/password", authMiddleware(), passwordUpdateController)

router.get("/sessions", authMiddleware(), authSessionsController)
router.get("/login-events", authMiddleware(), loginEventsController)
router.delete("/sessions/:id", authMiddleware(), revokeAuthSessionController)

const authRoutes = router

export default authRoutes;
