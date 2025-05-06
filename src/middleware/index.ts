import { Request, Response, NextFunction } from "express";
import { decryptString, jwtVerify } from "@/utils";
import { encrytionKey } from "@/config";
import { RequestWithUser } from "@/types";
import { getAuthorizationToken } from "@/utils/helpers";
import v1Routes from "@/routes/v1";
import logger from "@/logger";



export const versionMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const version = req.url.split('/')[2];
    // if (version === 'v2') {
    //   return v2Routes(req, res, next);
    // }
    return v1Routes(req, res, next);
  };


export const authMiddleware = (required: boolean = true) => async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {

        const authToken = getAuthorizationToken(req)

        if(!required && !authToken) return next()

        if(!authToken) return res.status(401).send("Invalid auth token, please try again")

        const payload = jwtVerify(authToken) as { data: string, [key: string]: any}

        if(!required && !payload){
            return next()
        }
        
        if(!payload) return res.status(401).send("Invalid auth token, please try again")
        // decrypt the token
        const user = decryptString(payload.data, encrytionKey)
        logger.info(user,"Auth Middleware ")
        req.user = user;
        next()
    } catch (error: any) {
        logger.error(error?.message)
        return res.status(403).send("Authorization failed, please close the app and open try again");
    }
}
