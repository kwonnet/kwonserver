import { QueryParams } from "@/schema";
import { validateZodInput } from "@/utils";
import { Response, Request } from "express";
import { getTrendingTopics } from "@/services/v1/discover";

export const getTrendController = async (
  req: Request,
  res: Response
) => {
  // Visibility changes must not leave private topics in a shared/CDN cache.
  res.setHeader("Cache-Control", "private, no-store");
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


    return res.status(result.status).send(result.data);
  
  } catch (error: any) {
    console.log(error?.message, "Error in gettting latest trends")
    return res.status(400).send(error?.message);
  }
};