import prisma from '@/db';
import nodemailer, {Transporter} from 'nodemailer';
import mjml2html from 'mjml';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
let transport: Transporter | undefined;
let template: Promise<string> | undefined;
function escapeHtml(value:string) {return value.replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));}
export async function renderWelcomeEmail(name:string, appUrl:string) {
 let origin: string; try {origin=new URL(appUrl).origin;} catch {throw new Error('CONFIG');}
 if (!origin.startsWith('https://')) throw new Error('CONFIG');
 template ??= readFile(path.resolve(__dirname,'../../../templates/email/welcome.mjml'),'utf8').catch(error=>{template=undefined;throw error;});
 const markup=(await template).replace(/{{name}}/g,escapeHtml(name.trim().split(/\s+/)[0].slice(0,80)||'creator')).replace(/{{appUrl}}/g,escapeHtml(origin));
 const rendered=await mjml2html(markup,{validationLevel:'strict'});
 return {html:rendered.html,text:`Hi ${name.trim().slice(0,80)},\n\nI’m Kelvin Torver Peter, Founder and CEO of Kwonnet. Thank you for joining me on this journey. Publish posts, share photos and videos, discover creators, join conversations, explore games, and earn bonus coins through engagement tasks. Keep creating content—your ideas belong here.\n\nCreate your first post: ${origin}\n\nWelcome aboard,\nKelvin Torver Peter\nFounder & CEO, Kwonnet\n\nYou received this welcome because you created an account. ${origin}/privacy-policy`};
}
function mailTransport() {
 if (transport) return transport;
 const host=process.env.SMTP_HOST, user=process.env.SMTP_USER, pass=process.env.SMTP_PASSWORD;
 const port=Number(process.env.SMTP_PORT||587); const secure=process.env.SMTP_SECURE==='true';
 if (!host || !user || !pass || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SMTP_FROM||'') || !Number.isInteger(port) || port<1 || port>65535) throw new Error('CONFIG');
 transport=nodemailer.createTransport({host,port,secure,requireTLS:!secure,pool:true,maxConnections:2,maxMessages:100,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
 return transport;
}
export async function closeEmailTransport() {transport?.close();transport=undefined;}
export async function recoverEmailMessages() {
 const {emailQueue}=await import('@/cron/jobs/queue');
 const messages=await prisma.emailMessage.findMany({where:{status:{in:['PENDING','SENDING']},nextAttemptAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},select:{id:true},take:100,orderBy:{createdAt:'asc'}});
 for(const message of messages) {
  const jobId=`email-${message.id}`; const existing=await emailQueue.getJob(jobId);
  if (!existing) await emailQueue.add('welcome',{id:message.id},{jobId,attempts:3,backoff:{type:'exponential',delay:30000},removeOnComplete:true,removeOnFail:{age:86400,count:500}});
  else if(await existing.getState()==='failed') await existing.retry();
 }
}
export async function deliverEmailMessage(id:string) {
 const now=new Date();
 const claim=await prisma.emailMessage.updateMany({where:{id,status:{in:['PENDING','SENDING']},nextAttemptAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{status:'SENDING',attempts:{increment:1},leaseUntil:new Date(now.getTime()+120000)}});
 if(!claim.count) return;
 const message=await prisma.emailMessage.findUniqueOrThrow({where:{id},include:{user:{select:{name:true,email:true,status:true,deletedAt:true,deactivatedAt:true}}}});
 if(message.user.deletedAt || message.user.deactivatedAt || !['ACTIVE','PRIVATE'].includes(message.user.status)) {await prisma.emailMessage.update({where:{id},data:{status:'CANCELLED',leaseUntil:null}});return;}
 try {
  const sender=mailTransport(); const appUrl=process.env.WEB_APP_URL||'https://kwonnet.com';
  const content=await renderWelcomeEmail(message.user.name,appUrl);
  const info=await sender.sendMail({from:{name:'Kelvin Torver Peter · Kwonnet',address:process.env.SMTP_FROM!},to:message.user.email,
    subject:'Welcome to Kwonnet — your ideas belong here',messageId:`<welcome.${id}@${new URL(appUrl).hostname}>`,...content});
  if (!info.accepted?.length) throw Object.assign(new Error('Rejected'),{code:'EENVELOPE'});
  await prisma.emailMessage.update({where:{id},data:{status:'SENT',sentAt:new Date(),leaseUntil:null,lastErrorCode:null}});
 } catch(error:any) {
  const missing=error.message==='CONFIG';
  const code=missing?'CONFIG':(['EAUTH','EENVELOPE','ECONNECTION','ESOCKET','ETIMEDOUT','ENOTFOUND'].includes(error.code)?error.code:'SEND_FAILED');
  await prisma.emailMessage.update({where:{id},data:{status:!missing&&message.attempts>=5?'FAILED':'PENDING',leaseUntil:null,lastErrorCode:code,
    ...(missing?{attempts:{decrement:1}}:{}),nextAttemptAt:new Date(Date.now()+(missing?300000:Math.min(3600000,30000*2**message.attempts)))}});
 }
}
