import { Request, Response } from "express";
import { generateToken, getAuthTokenUser } from "@/utils";
import { createUser, loginUser } from "@/services/v1/auth";
import type { LookupResult } from 'ip-location-api';
import { lookup } from '@/utils/ipLocation';
import { SignInSchema, SignUpSchema } from "@/schema/auth";
import { ZodError } from "zod";
import logger from "@/logger";
import { SessionUser, AuthUser } from "@/types/user";
import { getAuthUser } from "@/services/v1/utils";

const composeAuthUser = (user: AuthUser): SessionUser => {
  return { id: user.id, name: user.name, email: String(user.email), username: user.username, role: user.role }
}

export const signUpController = async (req: Request, res: Response) => {
  try {

    // await reload({fields: 'all'})

    const body = await SignUpSchema.parseAsync(req.body)

    // console.log("Authenticating user")

    const clientIp = req?.ip?.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req?.ip ?? '';

    // console.log("user clientIp Ip: ", clientIp)

    const lookupIP = !clientIp || clientIp?.includes("::1") ? "8.8.8.8" : clientIp;

    // console.log("user lookupIP Ip: ", lookupIP)

    const location = await lookup(lookupIP)

    // console.log("user Location: ", location)

    // create or login a user
    const result = await createUser(body, location);
    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }
    const user = result.data
    // generate access token
    const accessToken = generateToken( composeAuthUser(user),{ expiresIn: "24h" });
    // set cookies
    res.cookie("tx_a_t", accessToken, {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: true, // Ensures the cookie is sent over HTTPS only
      maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
      sameSite: "none", // Restricts cross-site requests
    });
    // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
    // return response
    return res.send({ user: result.data, accessToken });
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

    const clientIp = req?.ip?.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req?.ip ?? '';

    // console.log("user Ip: ", clientIp)

    // const location = await lookup(clientIp)

    // console.log("user Location: ", location)

    // create or login a user
    const result = await loginUser(body);
    // console.log(result)
    if ( typeof result.data === "string" || result.status !== 200){
      // console.log(result)
      return res.status(result.status).send(result.data);
    }
    const user = result.data
    // generate access token
    const accessToken = generateToken(composeAuthUser(user), { expiresIn: "24h" });

    // logger.info(user, "Signed in user")
    
    // set cookies
    res.cookie("tx_a_t", accessToken, {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: true, // Ensures the cookie is sent over HTTPS only
      maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
      sameSite: "none", // Restricts cross-site requests
    });
    // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
    // return response
    return res.send({ user: result.data, accessToken });
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

    const jwtUser = getAuthTokenUser(authToken)

    if(!jwtUser) return res.status(401).send("Invalid auth token, please try again");
   
    const result = await getAuthUser(jwtUser?.id, {includeEmail: true});

    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }

    const user = result.data

    // generate access token
    const accessToken = generateToken(composeAuthUser(user), { expiresIn: "24h" });

    return res.status(200).send({ user, accessToken })

  } catch (error: any) {
    return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
  }
};



