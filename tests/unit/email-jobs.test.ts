import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({db:{authEmailToken:{findUnique:vi.fn()},coinWithdrawal:{findUnique:vi.fn()},emailMessage:{updateMany:vi.fn(),findUniqueOrThrow:vi.fn(),update:vi.fn(),findMany:vi.fn()}},send:vi.fn(),close:vi.fn(),create:vi.fn(),queue:{getJob:vi.fn(),add:vi.fn()}}));
vi.mock('@/db',()=>({default:deps.db}));
vi.mock('nodemailer',()=>({default:{createTransport:deps.create}}));
vi.mock('@/cron/jobs/queue',()=>({emailQueue:deps.queue}));
import {renderWelcomeEmail,deliverEmailMessage,recoverEmailMessages,enqueueEmailMessage,closeEmailTransport} from '@/services/email';
import logger from '@/logger';
beforeEach(async()=>{await closeEmailTransport();vi.resetAllMocks();vi.stubEnv('APP_LOGO','https://images.test.invalid/kwonnet-logo.png');vi.stubEnv('SMTP_HOST','smtp.test.invalid');vi.stubEnv('SMTP_USER','test');vi.stubEnv('SMTP_PASSWORD','test-only');vi.stubEnv('SMTP_FROM','hello@kwonnet.test');vi.stubEnv('WEB_APP_URL','https://kwonnet.test');deps.create.mockReturnValue({sendMail:deps.send,close:deps.close});deps.send.mockResolvedValue({accepted:['recipient@test.invalid']});deps.db.emailMessage.updateMany.mockResolvedValue({count:1});deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({id:'event',attempts:1,user:{name:'Creator',email:'recipient@test.invalid',status:'ACTIVE',deletedAt:null,deactivatedAt:null}});});
afterEach(()=>vi.unstubAllEnvs());
it('renders responsive MJML with safe interpolation, founder signature and text alternative',async()=>{const result=await renderWelcomeEmail('<script>alert(1)</script>','https://kwonnet.test');expect(result.html).toContain('Kelvin Torver Peter');expect(result.html).toContain('#0084C7');expect(result.html).not.toContain('<script>');expect(result.html).toContain('&lt;script&gt;');expect(result.text).toContain('https://kwonnet.test');expect(result.html).toContain('privacy-policy');});
it('rejects insecure template links',async()=>{await expect(renderWelcomeEmail('Creator','http://kwonnet.test')).rejects.toThrow('CONFIG');});
it('sends a stable-message-id email and persists success only after SMTP acceptance',async()=>{await deliverEmailMessage('event');expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({to:'recipient@test.invalid',messageId:'<welcome.event@kwonnet.test>',subject:expect.stringContaining('Welcome to Kwonnet')}));expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'SENT',sentAt:expect.any(Date),leaseUntil:null})});expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({requireTLS:true,disableFileAccess:true,disableUrlAccess:true}));});
it('does not send a row already leased by another worker or previously completed',async()=>{deps.db.emailMessage.updateMany.mockResolvedValue({count:0});await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();});
it.each([{deletedAt:new Date()},{deactivatedAt:new Date()},{status:'BANNED'}])('cancels mail for an unavailable account %j',async override=>{deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({attempts:1,user:{name:'Creator',status:'ACTIVE',...override}});await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:{status:'CANCELLED',leaseUntil:null}});});
it('retains unconfigured messages without consuming retry attempts',async()=>{vi.stubEnv('SMTP_HOST','');await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'CONFIG'});expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'PENDING',attempts:{decrement:1},lastErrorCode:'CONFIG'})});expect(deps.send).not.toHaveBeenCalled();});
it.each([1,5])('bounds SMTP retries and excludes raw credential errors at attempt %s',async attempts=>{deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue({attempts,user:{name:'Creator',email:'recipient@test.invalid',status:'ACTIVE'}});deps.send.mockRejectedValue(Object.assign(new Error('secret-password-leak'),{code:'EAUTH'}));await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'EAUTH'});const update=deps.db.emailMessage.update.mock.calls[0][0];expect(update.data.status).toBe(attempts===5?'FAILED':'PENDING');expect(JSON.stringify(update)).not.toContain('secret-password-leak');expect(update.data.lastErrorCode).toBe('EAUTH');});
it('treats rejected SMTP recipients as failed delivery rather than sent',async()=>{deps.send.mockResolvedValue({accepted:[]});await expect(deliverEmailMessage('event')).rejects.toMatchObject({code:'EENVELOPE'});expect(deps.db.emailMessage.update).toHaveBeenCalledWith({where:{id:'event'},data:expect.objectContaining({status:'PENDING',lastErrorCode:'EENVELOPE'})});});
it('recovers persisted events without duplicate queue jobs and retries failed enqueue jobs',async()=>{const retry=vi.fn();deps.db.emailMessage.findMany.mockResolvedValue([{id:'one'},{id:'two'},{id:'three'}]);deps.queue.getJob.mockResolvedValueOnce(null).mockResolvedValueOnce({getState:async()=> 'failed',retry}).mockResolvedValueOnce({getState:async()=> 'active'});await recoverEmailMessages();expect(deps.queue.add).toHaveBeenCalledTimes(1);expect(deps.queue.add).toHaveBeenCalledWith('email',{id:'one'},expect.objectContaining({jobId:'email-one'}));expect(retry).toHaveBeenCalledOnce();});
it('requeues a retained completed job when the durable email retry is due',async()=>{
 const remove=vi.fn();deps.queue.getJob.mockResolvedValue({getState:async()=> 'completed',remove});
 await enqueueEmailMessage('event');expect(remove).toHaveBeenCalledOnce();
 expect(deps.queue.add).toHaveBeenCalledWith('email',{id:'event'},expect.objectContaining({jobId:'email-event',removeOnComplete:{age:86400,count:1000}}));
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
it('renders branded verification and reset templates with escaped names and a single-use link',async()=>{
 const {renderAuthEmail}=await import('@/services/email');
 vi.stubEnv('APP_LOGO','https://kwonnet.test/logo-320x320.png');
 for(const kind of ['VERIFY_EMAIL','PASSWORD_RESET','PASSWORD_CHANGED']) {
  const result=await renderAuthEmail('<script>','https://kwonnet.test',kind,'https://kwonnet.test/auth/verify-email#token=test');
  expect(result.html).toContain('logo-320x320.png');expect(result.html).not.toContain('<script>');expect(result.html).toContain('&lt;script&gt;');expect(result.text).toContain('https://kwonnet.test/auth/verify-email#token=test');
 }
});

it('welcome uses APP_LOGO as an external image and rejects missing or embedded logo configuration',async()=>{
 vi.stubEnv('APP_LOGO','https://images.test.invalid/custom-brand.png');
 const welcome=await renderWelcomeEmail('Creator','https://kwonnet.test');
 expect(welcome.html).toContain('src="https://images.test.invalid/custom-brand.png"');expect(welcome.html).not.toContain('data:image');expect(welcome.html).not.toContain('cid:');
 for(const value of ['', 'data:image/png;base64,AAAA', 'http://images.test.invalid/logo.png']){vi.stubEnv('APP_LOGO',value);await expect(renderWelcomeEmail('Creator','https://kwonnet.test')).rejects.toMatchObject({code:'CONFIG',settings:['APP_LOGO']});}
});
it('sends encrypted withdrawal OTPs with intent details and cancels superseded authorization',async()=>{
 vi.stubEnv('AUTH_EMAIL_TOKEN_SECRET','test-withdrawal-secret-at-least-32-characters');const {encryptEmailToken,hashEmailToken}=await import('@/utils/auth-security');
 const message={id:'event',userId:'user',kind:'WITHDRAWAL_OTP',withdrawalId:'withdrawal',actionTokenId:'challenge',attempts:1,user:{name:'Creator',email:'recipient@test.invalid',status:'ACTIVE'}};
 const action={id:'challenge',userId:'user',purpose:'WITHDRAWAL_OTP',subjectId:'withdrawal',recipientHash:hashEmailToken(message.user.email),encryptedToken:encryptEmailToken('012345'),usedAt:null,expiresAt:new Date(Date.now()+60000)};
 const withdrawal={id:'withdrawal',otpChallengeId:'challenge',status:'QUOTED',gateway:'BACHS',coins:{toString:()=> '5000'},currency:'USD',amount:{toFixed:()=> '56.25'},destination:{type:'crypto',asset:'USDC_BASE',address:'0x123'}};
 deps.db.emailMessage.findUniqueOrThrow.mockResolvedValue(message);deps.db.authEmailToken.findUnique.mockResolvedValue(action);deps.db.coinWithdrawal.findUnique.mockResolvedValue(withdrawal);
 await deliverEmailMessage('event');expect(deps.send).toHaveBeenLastCalledWith(expect.objectContaining({subject:'Kwonnet withdrawal confirmation code',text:expect.stringContaining('012345')}));expect(deps.send.mock.calls.at(-1)![0].text).toContain('USDC_BASE: 0x123');
 deps.db.coinWithdrawal.findUnique.mockResolvedValue({...withdrawal,destination:{type:'bank',accountNumber:'0123456789'}});await deliverEmailMessage('event');expect(deps.send.mock.calls.at(-1)![0].text).toContain('ending 6789');
 for(const override of [null,{usedAt:new Date()},{expiresAt:new Date(0)},{userId:'other'},{subjectId:'other'},{purpose:'VERIFY_EMAIL'},{id:'old'},{recipientHash:'old'}]){deps.db.authEmailToken.findUnique.mockResolvedValue(override===null?null:{...action,...override});deps.send.mockClear();await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();}
 deps.db.authEmailToken.findUnique.mockResolvedValue(action);deps.db.coinWithdrawal.findUnique.mockResolvedValueOnce(null);await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();deps.db.coinWithdrawal.findUnique.mockResolvedValue({...withdrawal,status:'RESERVED'});await deliverEmailMessage('event');expect(deps.send).not.toHaveBeenCalled();
});

it('renders a branded responsive withdrawal code email with a masked bank destination and exact expiry',async()=>{
 const {renderWithdrawalEmail}=await import('@/services/email');
 const result=await renderWithdrawalEmail('Alex Morgan','https://kwonnet.test','012345',new Date('2026-10-21T14:30:00Z'),{
  id:'withdrawal-reference',gateway:'BACHS',coins:{toString:()=> '500'},currency:'NGN',amount:{toFixed:()=> '7200.00'},receiveAmount:'7200',receiveCurrency:'NGN',destination:{type:'bank',accountNumber:'0790347316',accountName:'ALEX MORGAN'},
 });
 expect(result.html).toContain('src="https://images.test.invalid/kwonnet-logo.png"');
 expect(result.html).toContain('012345');expect(result.html).toContain('₦7,200.00');expect(result.html).toContain('ending 7316');expect(result.html).not.toContain('0790347316');
 expect(result.html).toContain('max-width:480px');expect(result.html).toContain('Return to your wallet');expect(result.html).toContain('Torzwar TechNova Limited');
 expect(result.text).toContain('21 Oct 2026, 14:30 UTC');expect(result.text).not.toContain('expires in 10 minutes');
 expect(result.html).not.toMatch(/{{\w+}}/);expect(result.html).not.toContain('Crypto amounts are estimates');
});
it('escapes withdrawal email fields and shows crypto estimates without exposing the code in links',async()=>{
 const {renderWithdrawalEmail}=await import('@/services/email');
 const result=await renderWithdrawalEmail('<script>','https://kwonnet.test','012345',new Date('2026-10-21T14:30:00Z'),{
  id:'reference<img>',gateway:'FLUTTERWAVE',coins:{toString:()=> '5000'},currency:'USD',amount:{toFixed:()=> '56.25'},receiveAmount:'56.251234',receiveCurrency:'USDC',destination:{type:'crypto',asset:'USDC_BASE',address:'0x<script>alert(1)</script>'},
 });
 expect(result.html).toContain('56.251234 USDC');expect(result.html).toContain('ESTIMATED AMOUNT TO RECEIVE');expect(result.html).toContain('Crypto amounts are estimates');
 expect(result.html).not.toContain('<script>');expect(result.html).not.toContain('<img>');expect(result.html).toContain('&lt;script&gt;');
 expect(result.html.match(/href="[^"]*"/g)?.some(link=>link.includes('012345'))).toBe(false);
 await expect(renderWithdrawalEmail('Alex','http://kwonnet.test','012345',new Date(),{} as any)).rejects.toThrow('CONFIG');
 await expect(renderWithdrawalEmail('Alex','https://kwonnet.test','not-a-code',new Date(),{} as any)).rejects.toThrow('Invalid withdrawal confirmation details');
});
