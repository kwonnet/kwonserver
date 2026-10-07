import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({db:{emailMessage:{updateMany:vi.fn(),findUniqueOrThrow:vi.fn(),update:vi.fn(),findMany:vi.fn()}},send:vi.fn(),close:vi.fn(),create:vi.fn(),queue:{getJob:vi.fn(),add:vi.fn()}}));
vi.mock('@/db',()=>({default:deps.db}));
vi.mock('nodemailer',()=>({default:{createTransport:deps.create}}));
vi.mock('@/cron/jobs/queue',()=>({emailQueue:deps.queue}));
import {renderWelcomeEmail,deliverEmailMessage,recoverEmailMessages,enqueueEmailMessage,closeEmailTransport} from '@/services/email';
import logger from '@/logger';
beforeEach(async()=>{await closeEmailTransport();vi.resetAllMocks();vi.stubEnv('SMTP_HOST','smtp.test.invalid');vi.stubEnv('SMTP_USER','test');vi.stubEnv('SMTP_PASSWORD','test-only');vi.stubEnv('SMTP_FROM','hello@kwonnet.test');vi.stubEnv('WEB_APP_URL','https://kwonnet.test');deps.create.mockReturnValue({sendMail:deps.send,close:deps.close});deps.send.mockResolvedValue({accepted:['recipient@test.invalid']});deps.db.emailMessage.updateMany.mockResolvedValue({count:1});deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({id:'event',attempts:1,user:{name:'Creator',email:'recipient@test.invalid',status:'ACTIVE',deletedAt:null,deactivatedAt:null}});});
afterEach(()=>vi.unstubAllEnvs());
it('renders responsive MJML with safe interpolation, founder signature and text alternative',async()=>{const result=await renderWelcomeEmail('<script>alert(1)</script>','https://kwonnet.test');expect(result.html).toContain('Kelvin Torver Peter');expect(result.html).toContain('#0084C7');expect(result.html).not.toContain('<script>');expect(result.html).toContain('&lt;script&gt;');expect(result.text).toContain('https://kwonnet.test');expect(result.html).toContain('privacy-policy');});
it('rejects insecure template links',async()=>{await expect(renderWelcomeEmail('Creator','http://kwonnet.test')).rejects.toThrow('CONFIG');});
it('sends a stable-message-id email and persists success only after SMTP acceptance',async()=>{await deliverEmailMessage('event');expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({to:'recipient@test.invalid',messageId:'<welcome.event@kwonnet.test>',subject:expect.stringContaining('Welcome to Kwonnet')}));expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'SENT',sentAt:expect.any(Date),leaseUntil:null})});expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({requireTLS:true,disableFileAccess:true,disableUrlAccess:true}));});
it('does not send a row already leased by another worker or previously completed',async()=>{deps.db.emailMessage.updateMany.mockResolvedValue({count:0});await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();});
it.each([{deletedAt:new Date()},{deactivatedAt:new Date()},{status:'BANNED'}])('cancels mail for an unavailable account %j',async override=>{deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({attempts:1,user:{name:'Creator',status:'ACTIVE',...override}});await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:{status:'CANCELLED',leaseUntil:null}});});
it('retains unconfigured messages without consuming retry attempts',async()=>{vi.stubEnv('SMTP_HOST','');await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'CONFIG'});expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'PENDING',attempts:{decrement:1},lastErrorCode:'CONFIG'})});expect(deps.send).not.toHaveBeenCalled();});
it.each([1,5])('bounds SMTP retries and excludes raw credential errors at attempt %s',async attempts=>{deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({attempts,user:{name:'Creator',email:'recipient@test.invalid',status:'ACTIVE'}});deps.send.mockRejectedValue(Object.assign(new Error('secret-password-leak'),{code:'EAUTH'}));await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'EAUTH'});const update=deps.db.emailMessage.update.mock.calls[0][0];expect(update.data.status).toBe(attempts===5?'FAILED':'PENDING');expect(JSON.stringify(update)).not.toContain('secret-password-leak');expect(update.data.lastErrorCode).toBe('EAUTH');});
it('treats rejected SMTP recipients as failed delivery rather than sent',async()=>{deps.send.mockResolvedValue({accepted:[]});await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'EENVELOPE'});expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'PENDING',lastErrorCode:'EENVELOPE'})});});
it('recovers persisted events without duplicate queue jobs and retries failed enqueue jobs',async()=>{const retry=vi.fn();deps.db.emailMessage.findMany.mockResolvedValue([{id:'one'},{id:'two'},{id:'three'}]);deps.queue.getJob.mockResolvedValueOnce(null).mockResolvedValueOnce({getState:async()=> 'failed',retry}).mockResolvedValueOnce({getState:async()=> 'active'});await recoverEmailMessages();expect(deps.queue.add).toHaveBeenCalledTimes(1);expect(deps.queue.add).toHaveBeenCalledWith('welcome',{id:'one'},expect.objectContaining({jobId:'email-one'}));expect(retry).toHaveBeenCalledOnce();});
it('requeues a retained completed job when the durable email retry is due',async()=>{
 const remove=vi.fn();deps.queue.getJob.mockResolvedValue({getState:async()=> 'completed',remove});
 await enqueueEmailMessage('event');expect(remove).toHaveBeenCalledOnce();
 expect(deps.queue.add).toHaveBeenCalledWith('welcome',{id:'event'},expect.objectContaining({jobId:'email-event',removeOnComplete:{age:86400,count:1000}}));
});
it('accepts a standard display-name SMTP_FROM value',async()=>{
 vi.stubEnv('SMTP_FROM','Kwonnet <hello@kwonnet.test>');await deliverEmailMessage('event');
 expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({from:{name:'Kelvin Torver Peter · Kwonnet',address:'hello@kwonnet.test'}}));
});
it('logs successful delivery and failed SMTP attempts with safe event IDs',async()=>{
 await deliverEmailMessage('event');expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({event:'email_delivery_sent',emailMessageId:'event'}),expect.any(String));
 deps.send.mockRejectedValue(Object.assign(new Error('credential-in-provider-response'),{code:'EAUTH'}));
 await expect(deliverEmailMessage('event')).rejects.toThrow('SMTP authentication failed');
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({event:'email_delivery_retry_scheduled',emailMessageId:'event',errorCode:'EAUTH'}),expect.any(String));
 expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('credential-in-provider-response');
});
