import {randomUUID} from "node:crypto";
import {z} from "zod/v3";
import {authRequestMetadata} from "@/utils/auth-security";
import { Response } from "express";
import type {Request} from "@/types/express";
import { generateToken, getAuthTokenUser, getRefreshAuthTokenUser } from "@/utils";
import { getAccountSettings, updateAccountPassword, createUser, loginUser, loginGoogleUser, startAuthSession, validateAuthSession, touchAuthSession, listAuthSessions, listLoginEvents, revokeAuthSession, sessionProvider } from "@/services/v1/auth";
import type { LookupResult } from 'ip-location-api';
import { lookup } from '@/utils/ipLocation';
import { PasswordUpdateSchema, SignInSchema, SignUpSchema } from "@/schema/auth";
import { ZodError } from "zod/v3";
import logger from "@/logger";
import {safeError} from '@/logger/sanitize';
import { SessionUser, AuthUser } from "@/types/user";
import { getAuthUser } from "@/services/v1/utils";
import { allowedOrigins } from "@/config";

export const logoutController = async (req: Request, res: Response) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).send("Invalid request origin");
  let revocationFailed = false;
  try {
    const authorization = req.get?.("authorization");
    const token = authorization !== undefined ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : req.cookies?.tx_a_t;
    const user = token ? getAuthTokenUser(token, true) : null;
    if (user?.sessionId) {
      try {await revokeAuthSession(user.id, user.sessionId, "LOGOUT");}
      catch {revocationFailed = true;}
    }
  } catch { /* Local cookie removal must remain possible during API outages. */ }
  for (const name of ["tx_a_t", "x_a_t"]) res.clearCookie(name, { httpOnly: true, secure: true, sameSite: "none", path: "/" });
  return res.status(revocationFailed ? 503 : 204).send();
};

const composeAuthUser = (user: AuthUser): SessionUser => {
  return { id: user.id, name: user.name, email: String(user.email), username: user.username, role: user.role }
}

export const signUpController = async (req: Request, res: Response) => {
  try {

    // await reload({fields: 'all'})

    const body = await SignUpSchema.parseAsync(req.body)

    // console.log("Authenticating user")

    const metadata = await authRequestMetadata(req);
    const location = metadata.location;

    // create or login a user
    const result = await createUser(body, location as Partial<LookupResult> | null);
    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }
    return res.status(202).send({verificationRequired: true, message: 'Account created. Check your email for a verification link before signing in.'});
  } catch (error: any) {
    if(error instanceof ZodError) {
      const issues = error.issues
      const message = issues.map((issue) => issue.message).join(", ")
      return res.status(400).send(message);
    }
    return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
  }
};


export const signInController = async (req: Request, res: Response) => {
  try {

    const LoginSchema = SignInSchema.pick({
      email: true,
      password: true,
    })
    const body = await LoginSchema.parseAsync(req.body)

    // create or login a user
    const result = await loginUser(body);
    // console.log(result)
    if ( typeof result.data === "string" || result.status !== 200){
      // console.log(result)
      return res.status(result.status).send(result.data);
    }
    const user = result.data
    const {accessToken, trackedUser} = await issueTrackedLogin(req, user, "PASSWORD");

    // set cookies
    res.cookie("tx_a_t", accessToken, {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: true, // Ensures the cookie is sent over HTTPS only
      maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
      sameSite: "none", // Restricts cross-site requests
    });
    // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
    // return response
    return res.send({ user: trackedUser, accessToken });
  } catch (error: any) {
    if(error instanceof ZodError) {
      const issues = error.issues
      const message = issues.map((issue) => issue.message).join(", ")
      return res.status(400).send(message);
    }
    return res.status(500).send("Error: Sorry an error occurred trying to process request. Please refresh the page and try again.");
  }
};

export const getMeController = async (req: Request, res: Response) => {
    try {
      
      // const user = req.user as UserPublic;
    
      // const result = await getAuthUser(user.id, true);
      // @ts-ignore
      return res.status(200).send(req.user);
      
    } catch (error) {
      return res
        .status(403)
        .send("Authorization failed, please close the app and open try again");
    }
  };

export const refreshTokenController = async (req: Request, res: Response) => {
  try {
    const authToken = req.body.token;

    if (!authToken)
      return res.status(401).send("Invalid auth token, please try again");

    let jwtUser;
    try {jwtUser = getRefreshAuthTokenUser(authToken);} catch {return res.status(401).send("Invalid auth token, please try again");}

    if(!jwtUser) return res.status(401).send("Invalid auth token, please try again");
   
    if (!await validateAuthSession(jwtUser)) return res.status(401).send("Session revoked or expired");
    const result = await getAuthUser(jwtUser?.id, {includeEmail: true});

    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }

    const user = result.data

    if (!jwtUser.sessionId || req.body?.newSession === true) {
      // A saved-account switch is a new device session, retaining provider attribution.
      const provider = jwtUser.sessionId ? await sessionProvider(jwtUser.id, jwtUser.sessionId) : "LEGACY";
      const {accessToken, trackedUser} = await issueTrackedLogin(req, user, provider, jwtUser.sessionId ? "ACCOUNT_SWITCH" : "LEGACY_UPGRADE");
      return res.status(200).send({user: trackedUser, accessToken});
    }
    await touchAuthSession(jwtUser);
    const accessToken = generateToken({...composeAuthUser(user), sessionId: jwtUser.sessionId}, {expiresIn: "24h"});
    return res.status(200).send({user: {...user, sessionId: jwtUser.sessionId}, accessToken});

  } catch (error: any) {
    return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
  }
};




export const googleSignInController = async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const idToken = req.body?.idToken;
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 16_384) return res.status(400).send("Invalid Google token");
  try {
    // Match password signup: one trusted lookup object feeds account creation
    // and authentication history. Existing-account signin never updates its profile.
    const metadata = await authRequestMetadata(req);
    const result = await loginGoogleUser(idToken, metadata.location as Partial<LookupResult> | null);
    if (result.status !== 200 || typeof result.data === "string") return res.status(result.status).send(result.data);
    const user = result.data;
    const {accessToken, trackedUser} = await issueTrackedLogin(req, user, "GOOGLE", "SIGN_IN", metadata);
    return res.status(200).send({user: trackedUser, accessToken});
  } catch {
    return res.status(500).send("Unable to sign in with Google. Please try again");
  }
};


async function issueTrackedLogin(req: Request, user: AuthUser, provider: import('@prisma/client').AuthProvider, kind = 'SIGN_IN', metadata?: Awaited<ReturnType<typeof authRequestMetadata>>) {
  const sessionId = randomUUID();
  // Sign before writing telemetry: signing failures create no successful login event.
  const accessToken = generateToken({...composeAuthUser(user), sessionId}, {expiresIn: '24h'});
  await startAuthSession(user.id, provider, metadata ?? await authRequestMetadata(req), kind, sessionId);
  return {accessToken, trackedUser: {...user, sessionId}};
}
const authPageSchema = z.object({page: z.coerce.number().int().min(1).max(10000).default(1)});
export const authSessionsController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const query = authPageSchema.safeParse(req.query);
  if (!query.success) return res.status(400).send('Invalid pagination');
  try {return res.json(await listAuthSessions(req.user!.id, req.user!.sessionId, query.data.page));}
  catch {return res.status(503).send('Session history unavailable');}
};
export const loginEventsController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const query = authPageSchema.safeParse(req.query);
  if (!query.success) return res.status(400).send('Invalid pagination');
  try {return res.json(await listLoginEvents(req.user!.id, query.data.page));}
  catch {return res.status(503).send('Login history unavailable');}
};
export const revokeAuthSessionController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).send('Invalid session ID');
  try {return await revokeAuthSession(req.user!.id, req.params.id) ? res.status(204).send() : res.status(404).send('Session not found');}
  catch {return res.status(503).send('Unable to revoke session');}
};

export const guardAuthStream = (req: Request, res: Response, next: import('express').NextFunction) => {
  const user = req.user!;
  if (user.sessionId) {
    const timer = setInterval(() => {
      void validateAuthSession(user).then(active => {if (!active) res.end();}).catch(() => res.end());
    }, 30_000);
    timer.unref();
    res.on('close', () => clearInterval(timer));
  }
  next();
};

export const accountSettingsController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {return res.json(await getAccountSettings(req.user!.id, req.user!.sessionId));}
  catch {return res.status(503).json({error: 'Account settings unavailable'});}
};
export const passwordUpdateController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const parsed = PasswordUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error: parsed.error.issues[0].message});
  try {
    const result = await updateAccountPassword(req.user!.id, req.user!.sessionId, parsed.data);
    return res.status(result.status).json(result.status === 200 ? result.data : {error: result.data});
  } catch {return res.status(500).json({error: 'Unable to update password'});}
};

export async function authEmailActionController(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const {requestAuthEmail, consumeAuthEmail} = await import('@/services/v1/auth');
    const action = req.path.split('/').pop();
    if (action === 'forgot-password' || action === 'resend-verification') {
      const {email} = z.object({email: z.string().trim().toLowerCase().email().max(254)}).strict().parse(req.body);
      const result = await requestAuthEmail(email, action === 'forgot-password' ? 'PASSWORD_RESET' : 'VERIFY_EMAIL');
      return res.status(result.status).json(result.data);
    }
    const input = z.object({token: z.string().min(1).max(128), ...(action === 'reset-password' ? {newPassword: PasswordUpdateSchema.shape.newPassword} : {})}).strict().parse(req.body);
    const result = await consumeAuthEmail(input.token, action === 'reset-password' ? 'PASSWORD_RESET' : 'VERIFY_EMAIL', 'newPassword' in input ? input.newPassword as string : undefined);
    return res.status(result.status).json(result.data);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({message: 'Check your email address, link and password. Passwords must be 8–32 characters.'});
    logger.error({event: 'auth_email_action_failed', errorType: err instanceof Error ? err.name : 'Unknown', err: safeError(err)}, 'Account email action failed');
    return res.status(503).json({message: 'Unable to process this request. Please try again.'});
  }
}
