import {EventEmitter} from 'node:events';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({snapshot:vi.fn(),init:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn()}));
vi.mock('@/services/v1/notifications',()=>({getNotificationStreamSnapshot:deps.snapshot}));
vi.mock('@/services/v1/notifications/live',()=>({subscribeUserRealtime:deps.subscribe}));
vi.mock('@/sseEmitter',()=>({default:{init:deps.init}}));
import {notificationStreamController} from '@/controllers/v1/notifications';
const receivers=new Map<string,(hint:any)=>void>();
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();receivers.clear();deps.snapshot.mockImplementation(async userId=>({userId,latestNotificationId:null,totalUnseenCount:0}));deps.subscribe.mockImplementation(async(id,receive)=>{receivers.set(id,receive);return deps.unsubscribe;});});
afterEach(()=>vi.useRealTimers());
function response(){const res=Object.assign(new EventEmitter(),{setHeader:vi.fn(),write:vi.fn(),end:vi.fn(),status:vi.fn(),writableNeedDrain:false});res.end.mockImplementation(()=>res.emit('close'));return res;}
it('queries only on connection and committed hints, coalesces changes and cleans up',async()=>{
 const res=response();await notificationStreamController({user:{id:'viewer'}} as any,res as any);
 expect(deps.snapshot).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(300000);expect(deps.snapshot).toHaveBeenCalledTimes(1);
 deps.snapshot.mockResolvedValue({userId:'viewer',latestNotificationId:'reward',totalUnseenCount:1});
 receivers.get('viewer')!({userId:'viewer',kind:'notifications'});receivers.get('viewer')!({userId:'viewer',kind:'notifications'});
 await vi.advanceTimersByTimeAsync(100);expect(deps.snapshot).toHaveBeenCalledTimes(2);expect(res.write).toHaveBeenCalledWith(expect.stringContaining('reward'));
 res.emit('close');await vi.advanceTimersByTimeAsync(300000);expect(deps.snapshot).toHaveBeenCalledTimes(2);expect(deps.unsubscribe).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('closes failed snapshots so reconnect can catch up instead of polling',async()=>{
 deps.snapshot.mockRejectedValueOnce(Error('DB unavailable'));const res=response();await notificationStreamController({user:{id:'viewer'}} as any,res as any);expect(res.end).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('routes wallet and message hints without additional notification queries',async()=>{
 const res=response();await notificationStreamController({user:{id:'viewer'}} as any,res as any);
 receivers.get('viewer')!({userId:'viewer',kind:'messages',conversationId:'chat'});receivers.get('viewer')!({userId:'viewer',kind:'wallet'});
 await vi.advanceTimersByTimeAsync(1000);expect(deps.snapshot).toHaveBeenCalledTimes(1);expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"conversationId":"chat"'));res.emit('close');
});
it('buffers changes arriving during subscription until stream headers are initialized',async()=>{
 deps.subscribe.mockImplementation(async(id,receive)=>{receive({userId:id,kind:'auth',sessionId:'revoked'});expect(deps.init).not.toHaveBeenCalled();return deps.unsubscribe;});
 const res=response();await notificationStreamController({user:{id:'viewer'}} as any,res as any);expect(res.write).toHaveBeenCalledWith(expect.stringContaining('revoked'));res.emit('close');
});

it('emits an inbox refresh when read/content changes leave unseen counts unchanged',async()=>{
 const res=response();await notificationStreamController({user:{id:'viewer'}} as any,res as any);res.write.mockClear();
 receivers.get('viewer')!({userId:'viewer',kind:'notifications'});await vi.advanceTimersByTimeAsync(100);
 expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: notifications_updated'));res.emit('close');
});
