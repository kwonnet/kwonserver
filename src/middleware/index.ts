import { Request, Response, NextFunction } from "express";
import { decryptString, jwtVerify } from "@/utils";
import { encrytionKey } from "@/config";
import { RequestWithUser } from "@/types";
import { getAuthorizationToken } from "@/utils/helpers";


export const authMiddleware = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {

        const authToken = getAuthorizationToken(req)

        if(!authToken) return res.status(401).send("Invalid auth token, please try again")

        const payload = jwtVerify(authToken) as { token: string, [key: string]: any}

        if(!payload) return res.status(401).send("Invalid auth token, please try again")
        // decrypt the token
        const user = decryptString(String(payload.token), encrytionKey)
        // console.log("Auth Middleware ", user)
        req.user = user;
        next()
    } catch (error) {
        return res.status(403).send("Authorization failed, please close the app and open try again");
    }
}
