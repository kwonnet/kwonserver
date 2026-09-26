import {
  QueryParams,
} from "@/schema";
import {
  getNewsfeed} from "@/services/v1/posts";
import { validateZodInput, generateUniqueRef } from "@/utils";
import { Response, Request } from "express";
import { AuthUser } from "@/types/user";
import axios from "axios"
import { storeDataInCacheMemory } from "@/interceptors"
import { getTrendingTopics } from "@/services/v1/discover";




export const getTrendController = async (
  req: Request,
  res: Response
) => {
  try {

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData){
      return res
        .status(400)
        .send(zodResult.message);
    }

    const { limit, country } = zodData

    const result = await getTrendingTopics(country, limit, 10)

    if(typeof result.data !== "string"){
      storeDataInCacheMemory(req, result.data, {ttl: 240000, global: true})
    }

    return res.status(result.status).send(result.data);
  
  } catch (error: any) {
    console.log(error?.message, "Error in gettting latest trends")
    return res.status(400).send(error?.message);
  }
};