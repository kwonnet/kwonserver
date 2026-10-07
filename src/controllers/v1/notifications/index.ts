import { subscribePushNotification, unsubscribePushNotification, getAuthorNotificationSubscription, setAuthorNotificationSubscription } from '@/services/v1/notifications';
import logger from '@/logger';
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

export async function authorNotificationSubscriptionController(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  const authorId = req.params.authorId;
  if (typeof authorId !== 'string' || !authorId || authorId.length > 128) return res.status(400).send('Invalid account');
  if (req.method === 'PUT' && typeof req.body?.enabled !== 'boolean') return res.status(400).send('enabled must be a boolean');
  try {
    const result = req.method === 'GET'
      ? await getAuthorNotificationSubscription(authorId, req.user!.id)
      : await setAuthorNotificationSubscription(authorId, req.user!.id, req.body.enabled);
    return res.status(result.status).send(result.data);
  } catch (err) {
    logger.error({err, authorId, subscriberId: req.user!.id}, 'Author notification preference failed');
    return res.status(503).send('Unable to save post notifications. Please try again.');
  }
}
