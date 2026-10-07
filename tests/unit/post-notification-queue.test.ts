import {beforeEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({getJob:vi.fn(),add:vi.fn(),count:vi.fn(),findFirst:vi.fn()}));
vi.mock('@/cron/jobs/queue',()=>({notificationQueue:{getJob:deps.getJob,add:deps.add}}));
vi.mock('@/db',()=>({default:{notification:{count:deps.count,findFirst:deps.findFirst}}}));
import {enqueuePostPublicationNotification,getNotificationStreamSnapshot} from '@/services/v1/notifications';
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
