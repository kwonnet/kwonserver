import sseEmitter from '@/sseEmitter';
import { subscribePushNotification, unsubscribePushNotification, getNotificationStreamSnapshot, getAuthorNotificationSubscription, setAuthorNotificationSubscription } from '@/services/v1/notifications';
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

/** Commit-driven hints plus an authoritative snapshot on each connection. */
export async function notificationStreamController(req: Request, res: Response) {
  const {subscribeUserRealtime}=await import('@/services/v1/notifications/live');
  const userId=req.user!.id;
  let closed=false,pending=false,dirty=false,initialized=false,forceSnapshot=false,previous='';
  const buffered:import('@/services/v1/notifications/live').RealtimeHint[]=[];
  let unsubscribe:(()=>Promise<void>)|undefined;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  let refreshTimer:ReturnType<typeof setTimeout>|undefined;
  res.once('close',async()=>{closed=true;clearInterval(heartbeat);clearTimeout(refreshTimer);if(unsubscribe)await unsubscribe();});
  const refresh=async()=>{
    if(closed)return;
    if(pending){dirty=true;return;}
    pending=true;
    try {
      do {
        dirty=false;
        const force=forceSnapshot;forceSnapshot=false;
        const snapshot=await getNotificationStreamSnapshot(userId);
        const serialized=JSON.stringify(snapshot);
        if(!closed&&(force||previous!==serialized)){res.write(`event: notifications_updated\ndata: ${serialized}\n\n`);previous=serialized;}
      }while(dirty&&!closed);
    }catch(error){logger.warn({event:'notification_stream_snapshot_failed',error},'Reconnect to recover notification state');res.end();}
    finally{pending=false;}
  };
  const receive=(hint:import('@/services/v1/notifications/live').RealtimeHint)=>{
      if(closed||hint.kind==='feed')return;
      if(!initialized){buffered.push(hint);return;}
      if(res.writableNeedDrain){res.end();return;}
      if(hint.kind==='notifications') {
        forceSnapshot=true;
        if(!refreshTimer)refreshTimer=setTimeout(async()=>{refreshTimer=undefined;await refresh();},100);
      }
      res.write(`event: account_updated\ndata: ${JSON.stringify(hint)}\n\n`);
    };
  try {
    unsubscribe=await subscribeUserRealtime(userId,receive,()=>res.end());
    if(closed){await unsubscribe();return;}
    sseEmitter.init(req,res);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Accel-Buffering','no');
    res.write('retry: 5000\n\n');
    initialized=true;
    for(const hint of buffered)receive(hint);
    buffered.length=0;
    heartbeat=setInterval(()=>{if(!closed&&!res.writableNeedDrain)res.write(': heartbeat\n\n');},15000);
    heartbeat.unref();
    await refresh();
  }catch(error){logger.warn({event:'notification_stream_unavailable',error},'Realtime connection unavailable');if(!res.headersSent)res.status(503);res.end();}
}
