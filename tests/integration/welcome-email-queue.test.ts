import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@prisma/client';
import {Worker,QueueEvents} from 'bullmq';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
const smtp=vi.hoisted(()=>({send:vi.fn().mockResolvedValue({accepted:['registered@test.invalid']}),close:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail:smtp.send,close:smtp.close})}}));
import {createUser} from '@/services/v1/auth';
import {deliverEmailMessage,recoverEmailMessages,closeEmailTransport} from '@/services/email';
import {emailQueue} from '@/cron/jobs/queue';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:10})});
let userId:string;let worker:Worker;let events:QueueEvents;
beforeAll(async()=>{
 vi.stubEnv('SMTP_HOST','smtp.test.invalid');vi.stubEnv('SMTP_USER','fixture');vi.stubEnv('SMTP_PASSWORD','fixture-password');vi.stubEnv('SMTP_FROM','Kwonnet <hello@test.invalid>');vi.stubEnv('WEB_APP_URL','https://kwonnet.test');
 await emailQueue.obliterate({force:true});
 events=new QueueEvents(emailQueue.name,{connection:{host:'127.0.0.1',port:16379}});await events.waitUntilReady();
});
afterAll(async()=>{
 if(worker)await worker.close();await events.close();await emailQueue.obliterate({force:true});await closeEmailTransport();
 if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect();vi.unstubAllEnvs();
});
it('queues registration immediately, delivers to the registered address and retains the completed job for inspection',async()=>{
 const signup=await createUser({name:'Email creator',email:'welcome-queue-fixture@test.invalid',password:'test-password'});
 expect(signup.status).toBe(200);userId=(signup.data as any).id;
 const outbox=await db.emailMessage.findFirstOrThrow({where:{userId}});
 const job=await emailQueue.getJob(`email-${outbox.id}`);expect(job).not.toBeNull();
 expect(await job!.getState()).toBe('waiting');
 worker=new Worker(emailQueue.name,job=>deliverEmailMessage(job.data.id),{connection:{host:'127.0.0.1',port:16379},concurrency:1});
 await job!.waitUntilFinished(events,10000);
 expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({to:'welcome-queue-fixture@test.invalid',messageId:`<email.${outbox.id}@kwonnet.test>`}));
 expect(await db.emailMessage.findUnique({where:{id:outbox.id}})).toMatchObject({status:'SENT',attempts:1,sentAt:expect.any(Date)});
 expect(await (await emailQueue.getJob(job!.id!))!.getState()).toBe('completed');
 await recoverEmailMessages();expect(smtp.send).toHaveBeenCalledOnce();
});
it('persists and logs failed delivery, then recovers a due email without resending completed messages',async()=>{
 // Give failure/recovery its own consumer and transport, rather than letting
 // the previous test's background consumer retain restored mock references.
 await worker.close();await closeEmailTransport();
 // Make the retry fixture unambiguously due across host/container clock jitter.
 const message=await db.emailMessage.create({data:{userId,eventKey:`retry-fixture:${userId}`,nextAttemptAt:new Date(0)}});
 smtp.send.mockImplementation(async mail=>{
  if(mail.messageId===`<welcome.${message.id}@kwonnet.test>`) throw Object.assign(new Error('credential-in-response'),{code:'EAUTH'});
  return {accepted:[mail.to]};
 });
 const failed=await emailQueue.add('welcome',{id:message.id},{jobId:`email-${message.id}`,attempts:1,removeOnFail:false});
 worker=new Worker(emailQueue.name,job=>deliverEmailMessage(job.data.id),{connection:{host:'127.0.0.1',port:16379},concurrency:1});
 await expect(failed.waitUntilFinished(events,10000)).rejects.toThrow('SMTP authentication failed');
 expect(await db.emailMessage.findUnique({where:{id:message.id}})).toMatchObject({status:'PENDING',attempts:1,lastErrorCode:'EAUTH'});
 expect((await emailQueue.getJob(failed.id!))!.failedReason).not.toContain('credential-in-response');
 smtp.send.mockResolvedValue({accepted:['welcome-queue-fixture@test.invalid']});
 await db.emailMessage.update({where:{id:message.id},data:{nextAttemptAt:new Date(0)}});
 await recoverEmailMessages();
 await (await emailQueue.getJob(failed.id!))!.waitUntilFinished(events,10000);
 expect(await db.emailMessage.findUnique({where:{id:message.id}})).toMatchObject({status:'SENT',attempts:2});
});
