import { getTipPackages } from "@/services/v1/tips";
import { Response } from "express";
import type {Request} from "@/types/express";

export const getTipsController = async (req: Request, res: Response) => {
    const result = await getTipPackages();
  
    return res.status(result.status).send(result.data);
  };