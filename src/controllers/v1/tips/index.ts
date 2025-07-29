import { getTipPackages } from "@/services/v1/tips";
import { Request, Response } from "express";

export const getTipsController = async (req: Request, res: Response) => {
    const result = await getTipPackages();
  
    return res.status(result.status).send(result.data);
  };