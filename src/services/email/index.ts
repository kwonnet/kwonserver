import prisma from '@/db';
import nodemailer, {Transporter} from 'nodemailer';
import mjml2html from 'mjml';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import logger from '@/logger';
import {safeError} from '@/logger/sanitize';
import {logServiceError} from '@/logger/events';
import {decryptEmailToken} from '@/utils/auth-security';
let transport: Transporter | undefined;
let template: Promise<string> | undefined;
function appLogoUrl() {
 const value = process.env.APP_LOGO?.trim();
 try {
  const url = new URL(value || '');
  if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
 } catch {
  logger.error({event: 'email_configuration_invalid', settings: ['APP_LOGO']}, 'APP_LOGO must be a public HTTPS URL');
 }
 throw Object.assign(new Error('CONFIG'), {code: 'CONFIG', settings: ['APP_LOGO']});
}
function escapeHtml(value:string) {return value.replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));}
export async function renderWelcomeEmail(name:string, appUrl:string) {
 let origin: string; try {origin=new URL(appUrl).origin;} catch (serviceError) {
    logServiceError("email/index", "renderWelcomeEmail", serviceError);
throw new Error('CONFIG');}
 if (!origin.startsWith('https://')) throw new Error('CONFIG');
 template ??= readFile(path.resolve(__dirname,'../../../templates/email/welcome.mjml'),'utf8').catch(error=>{
    logServiceError("email/index", "renderWelcomeEmail", error);
template=undefined;throw error;});
 const markup=(await template).replace(/{{name}}/g,escapeHtml(name.trim().split(/\s+/)[0].slice(0,80)||'creator')).replace(/{{appUrl}}/g,escapeHtml(origin)).replace(/{{logoUrl}}/g,escapeHtml(appLogoUrl()));
 const rendered=await mjml2html(markup,{validationLevel:'strict'});
 return {html:rendered.html,text:`Hi ${name.trim().slice(0,80)},\n\nI’m Kelvin Torver Peter, Founder and CEO of Kwonnet. Thank you for joining me on this journey. Publish posts, share photos and videos, discover creators, join conversations, explore games, and earn bonus coins through engagement tasks. Keep creating content—your ideas belong here.\n\nCreate your first post: ${origin}\n\nWelcome aboard,\nKelvin Torver Peter\nFounder & CEO, Kwonnet\n\nKwonnet - Connecting the dots and nodes\n\nYou received this welcome because you created an account. ${origin}/privacy-policy`};
}
function mailTransport() {
 if (transport) return transport;
 const host=process.env.SMTP_HOST, user=process.env.SMTP_USER, pass=process.env.SMTP_PASSWORD;
 const port=Number(process.env.SMTP_PORT||587); const secure=process.env.SMTP_SECURE==='true';
 const invalid = [!host && 'SMTP_HOST',!user && 'SMTP_USER',!pass && 'SMTP_PASSWORD',!senderAddress() && 'SMTP_FROM',(!Number.isInteger(port)||port<1||port>65535) && 'SMTP_PORT'].filter(Boolean);
 if (invalid.length) throw Object.assign(new Error('Email configuration is invalid'),{code:'CONFIG',settings:invalid});
 transport=nodemailer.createTransport({host,port,secure,requireTLS:!secure,pool:true,maxConnections:2,maxMessages:100,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
 return transport;
}
function senderAddress() {
 const from=(process.env.SMTP_FROM||'').trim();
 const bare=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
 if(bare.test(from)) return from;
 const named=/^[^<>\r\n]+<([^<>\r\n]+)>$/.exec(from);
 return named && bare.test(named[1].trim()) ? named[1].trim() : null;
}
export async function closeEmailTransport() {transport?.close();transport=undefined;}
export async function enqueueEmailMessage(id:string) {
 const {emailQueue}=await import('@/cron/jobs/queue');
 const jobId=`email-${id}`, existing=await emailQueue.getJob(jobId);
 if(existing) {
  const state=await existing.getState();
  if(state==='failed') {await existing.retry();logger.info({event:'email_job_requeued',emailMessageId:id,jobId,queue:emailQueue.name},'Email job scheduled for recovery');return;}
  if(state==='completed') await existing.remove();
  else {logger.debug({event:'email_job_already_queued',emailMessageId:id,jobId,state},'Email job already queued');return;}
 }
 await emailQueue.add('email',{id},{jobId,attempts:3,backoff:{type:'exponential',delay:30000},
  removeOnComplete:{age:86400,count:1000},removeOnFail:{age:604800,count:1000}});
 logger.info({event:'email_job_queued',emailMessageId:id,jobId,queue:emailQueue.name},'Email queued');
}
export async function recoverEmailMessages() {
 logger.info({event:'email_recovery_started'},'Email outbox recovery started');
 const messages=await prisma.emailMessage.findMany({where:{status:{in:['PENDING','SENDING']},nextAttemptAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},select:{id:true},take:100,orderBy:{createdAt:'asc'}});
 let failures=0;
 for(const message of messages) {try {await enqueueEmailMessage(message.id);} catch(err) {failures++;logger.error({event:'email_enqueue_failed',emailMessageId:message.id,err:safeError(err)},'Email remains in outbox for the next recovery run');}}
 logger.info({event:'email_recovery_completed',pending:messages.length,failures},'Email outbox recovery completed');
 if(failures) throw new Error(`${failures} email outbox jobs could not be queued`);
}
export async function deliverEmailMessage(id:string) {
 const started=performance.now();
 logger.info({event:'email_delivery_started',emailMessageId:id},'Email delivery started');
 const now=new Date();
 const claim=await prisma.emailMessage.updateMany({where:{id,status:{in:['PENDING','SENDING']},nextAttemptAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{status:'SENDING',attempts:{increment:1},leaseUntil:new Date(now.getTime()+120000)}});
 if(!claim.count) {logger.info({event:'email_delivery_skipped',emailMessageId:id},'Email already settled, leased or not yet due');return;}
 const message=await prisma.emailMessage.findUniqueOrThrow({where:{id},include:{user:{select:{name:true,email:true,status:true,deletedAt:true,deactivatedAt:true}}}});
 if(message.user.deletedAt || message.user.deactivatedAt || !['ACTIVE','PRIVATE'].includes(message.user.status)) {await prisma.emailMessage.update({where:{id},data:{status:'CANCELLED',leaseUntil:null}});logger.info({event:'email_delivery_cancelled',emailMessageId:id,userId:message.userId},'Email cancelled for unavailable account');return;}
 try {
  const sender=mailTransport(); const appUrl=process.env.WEB_APP_URL||'https://kwonnet.com';
  let content, subject = 'Welcome to Kwonnet — your ideas belong here';
  if (!message.kind || message.kind === 'WELCOME') content = await renderWelcomeEmail(message.user.name,appUrl);
  else {
    let actionUrl = new URL('/auth/signin', appUrl).href;
    if (message.kind !== 'PASSWORD_CHANGED') {
      const action = message.actionTokenId && await prisma.authEmailToken.findUnique({where: {id: message.actionTokenId}});
      if (!action || action.usedAt || action.expiresAt <= new Date() || action.userId !== message.userId || action.purpose !== message.kind) {
        await prisma.emailMessage.update({where: {id}, data: {status: 'CANCELLED', leaseUntil: null}});
        logger.info({event: 'auth_email_cancelled', emailMessageId: id, userId: message.userId}, 'Superseded or expired auth email cancelled'); return;
      }
      const link = new URL(message.kind === 'VERIFY_EMAIL' ? '/auth/verify-email' : '/auth/reset-password', appUrl);
      link.hash = new URLSearchParams({token: decryptEmailToken(action.encryptedToken)}).toString();
      actionUrl = link.href;
    }
    content = await renderAuthEmail(message.user.name, appUrl, message.kind, actionUrl);
    subject = message.kind === 'VERIFY_EMAIL' ? 'Verify your Kwonnet email' : message.kind === 'PASSWORD_RESET' ? 'Reset your Kwonnet password' : 'Your Kwonnet password was changed';
  }
  const info=await sender.sendMail({from:{name: !message.kind || message.kind === 'WELCOME' ? 'Kelvin Torver Peter · Kwonnet' : 'Kwonnet',address:senderAddress()!},to:message.user.email,
    subject,messageId:`<${!message.kind || message.kind === 'WELCOME' ? 'welcome' : 'email'}.${id}@${new URL(appUrl).hostname}>`,...content});
  if (!info.accepted?.length) throw Object.assign(new Error('Rejected'),{code:'EENVELOPE'});
  await prisma.emailMessage.update({where:{id},data:{status:'SENT',sentAt:new Date(),leaseUntil:null,lastErrorCode:null}});
  logger.info({event:'email_delivery_sent',emailMessageId:id,userId:message.userId,attempt:message.attempts,durationMs:Math.round(performance.now()-started),acceptedCount:info.accepted.length},'Email accepted by SMTP server');
 } catch(error:any) {
  const missing=error.message==='CONFIG'||error.code==='CONFIG';
  const code=missing?'CONFIG':(['EAUTH','EENVELOPE','ECONNECTION','ESOCKET','ETIMEDOUT','ENOTFOUND'].includes(error.code)?error.code:'SEND_FAILED');
  const nextAttemptAt=new Date(Date.now()+(missing?300000:Math.min(3600000,30000*2**message.attempts)));
  await prisma.emailMessage.update({where:{id},data:{status:!missing&&message.attempts>=5?'FAILED':'PENDING',leaseUntil:null,lastErrorCode:code,
    ...(missing?{attempts:{decrement:1}}:{}),nextAttemptAt}});
  const terminal=!missing&&message.attempts>=5;
  logger.error({event:terminal?'email_delivery_failed':'email_delivery_retry_scheduled',emailMessageId:id,userId:message.userId,attempt:message.attempts,errorCode:code,nextAttemptAt:terminal?undefined:nextAttemptAt.toISOString(),
    ...(missing?{invalidSettings:error.settings??['WEB_APP_URL']}:{}),err:safeError(error)},terminal?'Email permanently failed':'Email failed; durable retry scheduled');
  // Never report a successful BullMQ completion when SMTP failed. Only a safe
  // summary reaches Redis failedReason; raw provider responses may contain secrets.
  throw Object.assign(new Error(String(safeError(Object.assign(new Error('Email delivery failed'),{code})).message)),{code});
 }
}

export async function renderAuthEmail(name: string, appUrl: string, kind: string, actionUrl: string) {
 const origin = new URL(appUrl).origin;
 const logoUrl = appLogoUrl();
 if (new URL(logoUrl).protocol !== 'https:' || new URL(actionUrl).protocol !== 'https:') throw new Error('CONFIG');
 const verify = kind === 'VERIFY_EMAIL', changed = kind === 'PASSWORD_CHANGED';
 const title = verify ? 'One click closer to your community.' : changed ? 'Your password has been changed.' : 'Let’s get you back to Kwonnet.';
 const description = verify ? 'Thanks for joining Kwonnet. Verify your email address to sign in, share your ideas and connect with your community.' : changed ? 'Your Kwonnet password was reset. Existing sessions have been signed out. If you did not request this change, reset your password immediately and contact support.' : 'We received a request to reset your password. Use the button below to choose a new password. If you did not request this, you can ignore this email; your password has not changed.';
 const button = verify ? 'Verify email address' : changed ? 'Sign in to Kwonnet' : 'Reset password';
 const ttl = Number(process.env[verify ? 'EMAIL_VERIFICATION_TTL_MINUTES' : 'PASSWORD_RESET_TTL_MINUTES'] || (verify ? 1440 : 30));
 const lifetimeLabel = ttl >= 60 && ttl % 60 === 0 ? `${ttl / 60} hours` : `${ttl} minutes`;
 const markup = (await readFile(path.resolve(__dirname, '../../../templates/email/auth-action.mjml'), 'utf8'))
  .replace(/{{(name|logoUrl|title|description|button|actionUrl|expiry|appUrl)}}/g, (_, key) => escapeHtml(({name: name.trim().split(/\s+/)[0] || 'there', logoUrl, title, description, button, actionUrl, expiry: changed ? 'This is a security notice for your account.' : `This single-use link expires in ${lifetimeLabel}. Request a new link if it expires.`, appUrl: origin} as Record<string,string>)[key]));
 return {html: (await mjml2html(markup, {validationLevel: 'strict'})).html, text: `Hi ${name.trim().slice(0,80)},\n\n${description}\n\n${button}: ${actionUrl}\n\n${changed ? '' : `Link expires in ${lifetimeLabel}.`}\n\nKwonnet - Connecting the dots and nodes\n${origin}`};
}
