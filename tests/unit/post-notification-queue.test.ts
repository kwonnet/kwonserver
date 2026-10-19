import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({getJob:vi.fn(),add:vi.fn(),addBulk:vi.fn(),count:vi.fn(),findFirst:vi.fn()}));
vi.mock('@/cron/jobs/queue',()=>({notificationQueue:{getJob:deps.getJob,add:deps.add,addBulk:deps.addBulk}}));
vi.mock('@/db',()=>({default:{notification:{count:deps.count,findFirst:deps.findFirst}}}));
import {enqueuePostPublicationNotification,getNotificationStreamSnapshot,enqueueNotificationDelivery,enqueueNotificationDeliveries} from '@/services/v1/notifications';
beforeEach(()=>{vi.clearAllMocks();deps.getJob.mockResolvedValue(null);deps.add.mockResolvedValue({});});
it('enqueues immediate delivery with a stable post ID and retained outcomes',async()=>{
 await enqueuePostPublicationNotification('post');
 expect(deps.add).toHaveBeenCalledWith('post-published',{postId:'post'},expect.objectContaining({jobId:'post-notification-post',attempts:3,removeOnComplete:{age:86400,count:1000}}));
});
it('deduplicates active jobs and retries a failed job',async()=>{
 const retry=vi.fn();const getState=vi.fn().mockResolvedValue('active');deps.getJob.mockResolvedValue({getState,retry});
 await enqueuePostPublicationNotification('post');expect(deps.add).not.toHaveBeenCalled();expect(retry).not.toHaveBeenCalled();
 getState.mockResolvedValue('failed');await enqueuePostPublicationNotification('post');expect(retry).toHaveBeenCalledOnce();
});
it('leaves committed publication recovery available when Redis fails',async()=>{
 deps.getJob.mockRejectedValue(new Error('Redis unavailable'));await expect(enqueuePostPublicationNotification('post')).resolves.toBeUndefined();expect(deps.add).not.toHaveBeenCalled();
});
it('binds SSE snapshots to the viewer and current visibility without sending private post content',async()=>{
 deps.findFirst.mockResolvedValue({id:'notification'});deps.count.mockResolvedValue(2);
 expect(await getNotificationStreamSnapshot('viewer')).toEqual({userId:'viewer',latestNotificationId:'notification',totalUnseenCount:2});
 expect(deps.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({recipientId:'viewer',OR:expect.any(Array)}),select:{id:true}}));
});

it('queues a durable award notification with a stable recipient-notification job ID',async()=>{
 await enqueueNotificationDelivery('award-1');
 expect(deps.add).toHaveBeenCalledWith('notification',{notificationId:'award-1'},expect.objectContaining({jobId:'notification-award-1',attempts:3}));
});
it('deduplicates award jobs and leaves the durable inbox recoverable if Redis is down',async()=>{
 const retry=vi.fn();deps.getJob.mockResolvedValue({getState:async()=> 'waiting',retry});
 await enqueueNotificationDelivery('award-1');expect(deps.add).not.toHaveBeenCalled();
 deps.getJob.mockResolvedValue({getState:async()=> 'failed',retry});
 await enqueueNotificationDelivery('award-1');expect(retry).toHaveBeenCalledOnce();
 deps.getJob.mockRejectedValue(new Error('Redis unavailable'));
 await expect(enqueueNotificationDelivery('award-1')).resolves.toBeUndefined();
});

it('submits award notifications in one bulk queue call without individual lookups',async()=>{
 await enqueueNotificationDeliveries(['award-1','award-2']);
 expect(deps.getJob).not.toHaveBeenCalled();expect(deps.addBulk).toHaveBeenCalledOnce();
 expect(deps.addBulk.mock.calls[0][0]).toEqual(['award-1','award-2'].map(notificationId=>expect.objectContaining({name:'notification',data:{notificationId},opts:expect.objectContaining({jobId:`notification-${notificationId}`,attempts:3})})));
});
it('keeps batch inbox recovery available when bulk queue submission fails',async()=>{
 deps.addBulk.mockRejectedValueOnce(new Error('Redis down'));
 await expect(enqueueNotificationDeliveries(['award-1'])).resolves.toBeUndefined();
});
