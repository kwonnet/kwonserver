import { subscribePushNotification, unsubscribePushNotification } from '@/services/v1/notifications';
import { Response } from "express";
import type {Request} from "@/types/express";
export const subscribePushNotifController = async (req: Request, res: Response) => {
  const result = await subscribePushNotification(req.body, req.user!);
  return res.status(result.status).send(result.data);
};
export const unsubscribePushNotifController = async (req: Request, res: Response) => {
  if (typeof req.body?.endpoint !== 'string' || req.body.endpoint.length > 2048) return res.status(400).send('Invalid endpoint');
  try {await unsubscribePushNotification(req.body.endpoint, req.user!); return res.status(204).send();}
  catch {return res.status(500).send('Unable to disable notifications');}
};
