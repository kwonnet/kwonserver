import { Request, Response } from "express";
import { encrytionKey, telegramBotToken } from "@/config";
import { InitData, parse, validate } from "@telegram-apps/init-data-node";
import { authZodSchema } from "@/schema";
import { encryptString, generateToken, getAuthTokenUser, jwtSign } from "@/utils";
import { createOrLoginUser, createUser, getAuthUser, loginUser } from "@/services/v1/auth";
import { AuthUser, RequestWithUser } from "@/types";
import { lookup, reload, LookupResult } from 'ip-location-api'
import { AccountSchema } from "@/schema/auth";
import { ZodError } from "zod";


const validateAuthToken = (query?: string) => {
  if (!query) return null;
  try {
    validate(query, telegramBotToken, { expiresIn: 3600 });
    return parse(query);
  } catch (error) {
    return null;
  }
};

const validateInitData = (body: InitData) => {
  try {
    const result = authZodSchema.passthrough().parse(body);
    return result;
  } catch (error) {
    return null;
  }
};

export const authController = async (req: Request, res: Response) => {
  try {
    console.log("Authenticating user")

    const clientIp = req?.ip?.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req?.ip ?? '';

    console.log("user Ip: ", clientIp)

    const location = await lookup(clientIp)

    console.log("user Location: ", location)


    const { tmaRaw, tmaData, ref } = req.body;

    const user1 = validateAuthToken(tmaRaw);

    const user2 = validateInitData(tmaData);

    const authUser = user1 ? user1 : user2 ? user2 : null;

    if (!authUser)
      return res.status(400).send("Invalid payload received, please try again");
    // create  new user or check if it already exists
    const user = authUser.user;
    const userObj = {
      id: String(user?.id),
      telId: String(user?.id),
      avatar: String(user?.photoUrl),
      name: String(user?.firstName),
      username: String(user?.username),
    };
    // create or login a user
    const result = await createOrLoginUser(userObj, ref);
    if (result.status !== 200)
      return res.status(result.status).send(result.data);
    // encrypt the object
    const strUser = JSON.stringify(result.data);
    const encrypted = encryptString(strUser, encrytionKey);
    // sign jwt token auth token
    const token = jwtSign({ token: encrypted }, {expiresIn: "1d"});
    // set cookies
    res.cookie("x_a_t", token, {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: true, // Ensures the cookie is sent over HTTPS only
      maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
      sameSite: "none", // Restricts cross-site requests
    });
    // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
    // return response
    return res.send({ user: result.data, token });
  } catch (error: any) {
    return res
      .status(500)
      .send(
        "Error: Sorry an error occurred trying to process request. Please close this app & open again."
      );
  }
};

export const signUpController = async (req: Request, res: Response) => {
  try {

    // await reload({fields: 'all'})

    const body = await AccountSchema.parseAsync(req.body)

    console.log("Authenticating user")

    const clientIp = req?.ip?.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req?.ip ?? '';

    console.log("user clientIp Ip: ", clientIp)

    const lookupIP = !clientIp || clientIp?.includes("::1") ? "8.8.8.8" : clientIp;

    console.log("user lookupIP Ip: ", lookupIP)

    const location = await lookup(lookupIP)

    
    console.log("user Location: ", location)

    // create or login a user
    const result = await createUser(body, location);
    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }
    const user = result.data
    // generate access token
    const accessToken = generateToken(
      { id: user.id, name: user.name, email: user.email, username: user.username },
      { expiresIn: "24h" }
    );
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

    const LoginSchema = AccountSchema.pick({
      email: true,
      password: true,
    })
    const body = await LoginSchema.parseAsync(req.body)

    const clientIp = req?.ip?.includes('::ffff:') ? req.ip.split('::ffff:')[1] : req?.ip ?? '';

    console.log("user Ip: ", clientIp)

    const location = await lookup(clientIp)

    console.log("user Location: ", location)

    // create or login a user
    const result = await loginUser(body);
    if ( typeof result.data === "string" || result.status !== 200){
      console.log(result)
      return res.status(result.status).send(result.data);
    }
    const user = result.data
    // generate access token
    const accessToken = generateToken(
      { id: user.id, name: user.name, email: user.email, username: user.username },
      { expiresIn: "24h" }
    );
    
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

export const getMeController = async (req: RequestWithUser, res: Response) => {
    try {
      const user = req.user as AuthUser;
    
      const result = await getAuthUser(user.id);
  
      return res.status(result.status).send(result.data);
      
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
   
    const result = await getAuthUser(jwtUser?.id);

    if ( typeof result.data === "string" || result.status !== 200){
      return res.status(result.status).send(result.data);
    }

    const user = result.data

    // generate access token
    const accessToken = generateToken(
      { id: user.id, name: user.name, email: user.email, username: user.username },
      { expiresIn: "24h" }
    );

    return res.status(200).send({ user, accessToken })

  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
  }
};


