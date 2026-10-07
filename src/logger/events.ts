import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import type {RequestHandler} from 'express';
import logger from './index';
import {safeError} from './sanitize';
const requests = new AsyncLocalStorage<{requestId:string}>();
export function logServiceError(service: string, operation: string, error: unknown, recovered = false) {
  const details={event:recovered?'service_fallback':'service_failed',service,operation,...requests.getStore(),err:safeError(error)};
  if(recovered) logger.warn(details,`${service}.${operation} continued with fallback`);
  else logger.error(details, `${service}.${operation} failed`);
}
export function logServiceTrace(service: string, operation: string, message: string) {
  logger.info({event:'service_progress',service,operation,...requests.getStore()},message);
}
export const requestLoggingMiddleware: RequestHandler = (req,res,next) => {
  const requestId=randomUUID(), started=performance.now();
  res.setHeader('X-Request-ID',requestId);
  requests.run({requestId},()=>{
    logger.info({event:'request_started',requestId,method:req.method},'API request started');
    let finished=false;
    const log = (aborted: boolean) => {
      if(finished) return; finished=true;
      const details={event:aborted?'request_aborted':res.statusCode>=400?'request_failed':'request_completed',requestId,
        method:req.method,route:typeof req.route?.path==='string'?req.route.path:'unmatched',statusCode:res.statusCode,
        durationMs:Math.round(performance.now()-started),userId:(req as any).user?.id};
      if(aborted) logger.warn(details,'API request ended before the response completed');
      else if(res.statusCode>=500) logger.error(details,'API request failed');
      else if(res.statusCode>=400) logger.warn(details,'API request rejected');
      else logger.info(details,'API request completed');
    };
    res.once('finish',()=>log(false)); res.once('close',()=>log(!res.writableFinished)); next();
  });
};

type ObservableWorker = {name: string; on: (event: any, handler: (...args:any[])=>void)=>unknown};
export function logWorkerLifecycle(worker: ObservableWorker) {
  const started = new Map<string,number>();
  const context=(job:any)=>({queue:worker.name,job:job?.name,jobId:job?.id,attempt:job?.attemptsMade,
    ...Object.fromEntries(['id','userId','categoryId','subscriptionId','postId'].filter(key=>typeof job?.data?.[key]==='string').map(key=>[key==='id'?'resourceId':key,job.data[key]]))});
  worker.on('ready',()=>logger.info({event:'queue_ready',queue:worker.name},'Queue worker ready'));
  const elapsed=(job:any)=>job?.id&&started.has(job.id)?Math.round(performance.now()-started.get(job.id)!):undefined;
  worker.on('active',job=>{if(job.id)started.set(job.id,performance.now());logger.info({event:'job_started',...context(job),attempt:job.attemptsMade+1},'Queue job started');});
  worker.on('completed',job=>{logger.info({event:'job_completed',...context(job),durationMs:elapsed(job)},'Queue job completed');if(job.id)started.delete(job.id);});
  worker.on('failed',(job,err)=>{logger.error({event:'job_failed',...context(job),durationMs:elapsed(job),err:safeError(err)},'Queue job failed');if(job?.id)started.delete(job.id);});
  worker.on('stalled',jobId=>logger.warn({event:'job_stalled',queue:worker.name,jobId},'Queue job stalled'));
  worker.on('progress',(job,progress)=>logger.info({event:'job_progress',...context(job),progress:typeof progress==='number'?progress:undefined},'Queue job progress'));
  worker.on('drained',()=>logger.info({event:'queue_idle',queue:worker.name},'Queue has no waiting jobs'));
  worker.on('paused',()=>logger.info({event:'queue_paused',queue:worker.name},'Queue worker paused'));
  worker.on('resumed',()=>logger.info({event:'queue_resumed',queue:worker.name},'Queue worker resumed'));
  worker.on('closed',()=>logger.info({event:'queue_closed',queue:worker.name},'Queue worker closed'));
  worker.on('error',err=>logger.error({event:'queue_error',queue:worker.name,err:safeError(err)},'Queue worker error'));
}
