import {z} from 'zod/v3';
import {WalletError} from '@/services/walletLedger';
import {getEngagementTasks, claimEngagementTask, configureEngagementTask} from '@/services/v1/tasks';
import { DailyTaskZodSchema, IDZodSchema, QuerySchema, TaskZodSchema } from "@/schema";
import { createTask, getTask, getTasks, getUserCompletedTasks } from "@/services/v1/tasks";
import { validateZodInput } from "@/utils";
import { Response } from "express";
import type {Request} from "@/types/express";
import { AuthUser } from "@/types/user";

export const createTaskController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;
    if (!['ADMIN','SUPER'].includes(user.role)) return res.status(403).json({error:'Administrator access required'});
    const zodResult = validateZodInput(req.body, TaskZodSchema);
    if (!zodResult.data) return res.status(400).send(zodResult.message);
    const result = await createTask(zodResult.data, user.id);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res
      .status(400)
      .send("Error: Unable to process request, please try again later!");
  }
};

export const getTasksController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.query as any, QuerySchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);
    const result = await getTasks(user.id, zodData);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res
      .status(400)
      .send("Error: Unable to process request, please try again later!");
  }
};

export const getTaskController = async (req: Request, res: Response) => {
  try {
    const zodResult = validateZodInput(req.params, IDZodSchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await getTask(zodData.id);
    
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res
      .status(400)
      .send("Error: Unable to process request, please try again later!");
  }
};

export const getUserCompletedTasksController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.query as any, QuerySchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await getUserCompletedTasks(user.id, zodData);

    return res.status(result.status).send(result.data);

  } catch (error: any) {
    return res
      .status(400)
      .send("Error: Unable to process request, please try again later!");
  }
};


export async function engagementTasksController(req: Request, res: Response) {
 res.setHeader('Cache-Control','private, no-store');
 try {return res.json(await getEngagementTasks(req.user!.id));} catch {return res.status(503).json({error:'Task progress is unavailable. Please try again.'});}
}
export async function engagementClaimController(req: Request, res: Response) {
 res.setHeader('Cache-Control','private, no-store');
 if (!z.string().regex(/^[a-z-]{1,40}$/).safeParse(req.params.id).success) return res.status(400).json({error:'Invalid task'});
 try {return res.json(await claimEngagementTask(req.user!.id, req.params.id, req.get('Idempotency-Key')!));}
 catch(error) {return res.status(error instanceof WalletError ? error.status : 500).json({error:error instanceof WalletError ? error.message : 'Unable to claim. Retry with the same request key.'});}
}
export async function engagementAdminController(req: Request, res: Response) {
 if (!['ADMIN','SUPER'].includes(req.user!.role)) return res.status(403).json({error:'Administrator access required'});
 const input=z.object({enabled:z.boolean().optional(),target:z.number().int().min(1).max(1000).optional()}).strict().refine(value=>Object.keys(value).length>0).safeParse(req.body);
 if (!input.success) return res.status(400).json({error:'Invalid task configuration'});
 try {return res.json(await configureEngagementTask(req.params.id,input.data));} catch {return res.status(404).json({error:'Task unavailable'});}
}
