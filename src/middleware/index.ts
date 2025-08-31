import { Request, Response, NextFunction } from "express";
import { decryptString, jwtVerify } from "@/utils";
import { encrytionKey } from "@/config";
import { getAuthorizationToken, getReqInfo, removeProperty } from "@/utils/helpers";
import v1Routes from "@/routes/v1";
import logger from "@/logger";
import { SessionUser } from "@/types/user";
import { getAuthUser } from "@/services/v1/utils";

export const versionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const version = req.url.split("/")[2];
  // if (version === 'v2') {
  //   return v2Routes(req, res, next);
  // }
  return v1Routes(req, res, next);
};

export const authMiddleware =
  (params?: { required?: boolean; checkPermission?: boolean, checkPermWithEmail?: boolean }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { required = true, checkPermission = false, checkPermWithEmail = false } = params || {};

      const authToken = getAuthorizationToken(req);

      if (!required && !authToken) return next();

      if (!authToken)
        return res.status(401).send("Invalid auth token, please try again");

      const payload = jwtVerify(authToken) as {
        data: string;
        [key: string]: any;
      };

      if (!required && !payload) {
        return next();
      }
      if (!payload)
        return res.status(401).send("Invalid auth token, please try again");
      // decrypt the token
      const user = decryptString<SessionUser>(payload.data, encrytionKey);
      logger.info(user, "Auth Middleware ");
      if (checkPermission || checkPermWithEmail) {
        const result = await getAuthUser(user.id, { includeEmail: true });

        if (typeof result.data === "string" || result.status !== 200) {
          return res.status(result.status).send(result.data);
        }
        const _user = !checkPermWithEmail ? removeProperty(result.data, "email") : result.data;
        req.user = _user;
      } else {
        req.user = user;
      }

      next();
    } catch (error: any) {
      logger.error(error?.message);
      return res
        .status(403)
        .send("Authorization failed, please logout & login to try again");
    }
  };

export const detectBotMiddleware =
  (required: boolean = true) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reqInfo = await getReqInfo(req);

      if (!required && reqInfo.isBot) return next();

      if (reqInfo.isBot) {
        return res.status(400).send("Failed to process, bot request detected");
      }
      return next();
    } catch (error: any) {
      logger.error(error?.message);
      return res
        .status(400)
        .send("Failed to process request, please try again");
    }
  };
