import express, {  } from "express";
import {authEmailActionController} from '@/controllers/v1/auth';
import redis from '@/redis';
import {createHash} from 'node:crypto';
import { authMiddleware } from "@/middleware";
import { accountSettingsController, passwordUpdateController, authSessionsController, loginEventsController, revokeAuthSessionController, googleSignInController, getMeController, logoutController, refreshTokenController, signInController, signUpController } from "@/controllers/v1/auth";

const router = express.Router();
const limitAccountEmail: express.RequestHandler = async (req, res, next) => {
  try {
    if (!redis.isReady) return void res.status(503).json({message: 'Please try again shortly.'});
    const key = `auth-email:rate:${createHash('sha256').update(req.ip || req.socket.remoteAddress || 'unknown').digest('hex')}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 900);
    if (count > 20) {res.setHeader('Retry-After', '900');return void res.status(429).json({message: 'Too many requests. Please try again in 15 minutes.'});}
    next();
  } catch {res.status(503).json({message: 'Please try again shortly.'});}
};

router.post("/signup", limitAccountEmail, signUpController)
for (const action of ['forgot-password', 'reset-password', 'resend-verification', 'verify-email']) router.post(`/${action}`, limitAccountEmail, authEmailActionController);

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
