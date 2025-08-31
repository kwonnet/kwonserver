import { DailyTaskZodSchema, IDZodSchema, QuerySchema, TaskZodSchema } from "@/schema";
import { createTask, getTask, getTasks, getUserCompletedTasks } from "@/services/v1/tasks";
import { validateZodInput } from "@/utils";
import { Request, Response } from "express";
import { AuthUser } from "@/types/user";

export const createTaskController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;
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

