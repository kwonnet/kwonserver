import {EventEmitter} from 'node:events';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({snapshot:vi.fn(),init:vi.fn()}));
vi.mock('@/services/v1/notifications',()=>({getNotificationStreamSnapshot:deps.snapshot}));
vi.mock('@/sseEmitter',()=>({default:{init:deps.init}}));
import {notificationStreamController} from '@/controllers/v1/notifications';
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();deps.snapshot.mockResolvedValue({userId:'viewer',latestNotificationId:null,totalUnseenCount:0});});
afterEach(()=>vi.useRealTimers());
function response(){return Object.assign(new EventEmitter(),{setHeader:vi.fn(),write:vi.fn(),writableNeedDrain:false});}
it('sends private notifications over the requesting stream only and updates when the inbox changes',async()=>{
 const res=response();notificationStreamController({user:{id:'viewer'}} as any,res as any);
 await vi.advanceTimersByTimeAsync(0);
 expect(deps.snapshot).toHaveBeenCalledWith('viewer');expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: notifications_updated'));
 res.write.mockClear();await vi.advanceTimersByTimeAsync(5000);expect(res.write).not.toHaveBeenCalled();
 deps.snapshot.mockResolvedValue({userId:'viewer',latestNotificationId:'new-post-notification',totalUnseenCount:1});
 await vi.advanceTimersByTimeAsync(5000);expect(res.write).toHaveBeenCalledWith(expect.stringContaining('new-post-notification'));
 expect(deps.init).toHaveBeenCalledOnce();expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering','no');
 res.emit('close');deps.snapshot.mockClear();await vi.advanceTimersByTimeAsync(30000);expect(deps.snapshot).not.toHaveBeenCalled();
});
it('recovers a failed refresh without closing the stream or overlapping queries',async()=>{
 const res=response();deps.snapshot.mockRejectedValueOnce(new Error('Database unavailable'));
 notificationStreamController({user:{id:'viewer'}} as any,res as any);await vi.advanceTimersByTimeAsync(5000);
 expect(res.write).toHaveBeenCalledWith(expect.stringContaining('notifications_updated'));
 let resolve:any;deps.snapshot.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 await vi.advanceTimersByTimeAsync(5000);const calls=deps.snapshot.mock.calls.length;
 await vi.advanceTimersByTimeAsync(10000);expect(deps.snapshot).toHaveBeenCalledTimes(calls);
 res.emit('close');res.write.mockClear();resolve({userId:'viewer',latestNotificationId:'late',totalUnseenCount:1});await vi.advanceTimersByTimeAsync(0);expect(res.write).not.toHaveBeenCalled();
});
