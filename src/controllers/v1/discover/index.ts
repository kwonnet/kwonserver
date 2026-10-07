import { QueryParams } from "@/schema";
import { validateZodInput } from "@/utils";
import { Response } from "express";
import type {Request} from "@/types/express";
import { getDiscoverTrends } from "@/services/v1/discover";

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

    const mode = req.query.mode;
    const topic = req.query.topic;
    if ((mode !== undefined && mode !== 'foryou') || (topic !== undefined && typeof topic !== 'string')) return res.status(400).send('Invalid trend filter');
    const result = await getDiscoverTrends({ viewerId: req.user?.id, personalized: mode === 'foryou', country, limit, topic: topic as string | undefined })


    return res.status(result.status).send(result.data);
  
  } catch (error: any) {
    console.log(error?.message, "Error in gettting latest trends")
    return res.status(400).send(error?.message);
  }
};