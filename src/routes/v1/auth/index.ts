import express, {  } from "express";
import {authEmailActionController} from '@/controllers/v1/auth';
import {consumeAuthRateLimit,normalizedIp,verifiedWebContext} from '@/utils/auth-security';
import { authMiddleware } from "@/middleware";
import { twoFactorManagementController, verifyTwoFactorLoginController, accountSettingsController, passwordUpdateController, authSessionsController, loginEventsController, revokeAuthSessionController, googleSignInController, getMeController, logoutController, refreshTokenController, signInController, signUpController } from "@/controllers/v1/auth";

const router = express.Router();
const limitAuth: express.RequestHandler = async (req, res, next) => {
  try {
    const bridge=verifiedWebContext(req);
    const ip=bridge?.ip??normalizedIp(req.ip)??normalizedIp(req.socket.remoteAddress)??'unknown';
    const result=await consumeAuthRateLimit(`${req.method}:${req.route.path}`,ip);
    if(!result.allowed){
      res.setHeader('Retry-After',String(result.retryAfter));
      res.status(429).json({message:'Too many requests. Please try again in 15 minutes.'});return;
    }
    next();
  } catch {res.status(503).json({message:'Please try again shortly.'});}
};

router.post("/signup", limitAuth, signUpController)
for (const action of ['forgot-password', 'reset-password', 'resend-verification', 'verify-email']) router.post(`/${action}`, limitAuth, authEmailActionController);

router.post("/signin", limitAuth, signInController)
router.post("/google", limitAuth, googleSignInController)
router.post("/logout", limitAuth, logoutController)

router.post("/refresh-token", limitAuth, refreshTokenController)

router.get("/me", limitAuth, authMiddleware({checkPermWithEmail: true}), getMeController)

router.get("/session-status", limitAuth, authMiddleware(), getMeController)

router.get("/settings", limitAuth, authMiddleware(), accountSettingsController)
router.patch("/password", limitAuth, authMiddleware(), passwordUpdateController)

router.get("/sessions", limitAuth, authMiddleware(), authSessionsController)
router.get("/login-events", limitAuth, authMiddleware(), loginEventsController)
router.delete("/sessions/:id", limitAuth, authMiddleware(), revokeAuthSessionController)

router.post('/two-factor/verify',limitAuth,verifyTwoFactorLoginController);
for(const action of ['setup','enable','disable','recovery-codes'])router.post(`/two-factor/${action}`,limitAuth,authMiddleware(),twoFactorManagementController);

const authRoutes = router

export default authRoutes;
