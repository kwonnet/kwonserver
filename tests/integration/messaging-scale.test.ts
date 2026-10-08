import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {S3Client,CreateBucketCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {createHash,randomUUID} from 'node:crypto';
import db from '@/db';
import * as chat from '@/services/v1/conversations';
import {subscribeMessagingHints,closeMessagingPublisher} from '@/services/v1/conversations/live';
const users=['scale-owner','scale-peer'];let a:string,b:string,b2:string;
const bucket='kwonnet-private-test';
const s3=new S3Client({endpoint:'http://127.0.0.1:19000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'disposable-storage',secretAccessKey:'disposable-storage-password'},requestChecksumCalculation:'WHEN_REQUIRED'});
const enrollment=(id:string,n:number)=>({deviceId:id,signalDeviceId:n,registrationId:10,identityPublic:Buffer.alloc(33,n).toString('base64'),actionSigningPublic:Buffer.alloc(32,n).toString('base64'),signedPreKey:{keyId:1,publicKey:Buffer.alloc(33,n).toString('base64'),signature:Buffer.alloc(64,n).toString('base64')},preKeys:[]});
beforeAll(async()=>{await s3.send(new CreateBucketCommand({Bucket:bucket})).catch(error=>{if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name))throw error;});await db.user.createMany({data:users.map(id=>({id,name:id,username:id,email:`${id}@test.invalid`,emailVerifiedAt:new Date()})),skipDuplicates:true});});
beforeEach(async()=>{await db.e2Outbox.deleteMany({});await db.e2Conversation.deleteMany({});await db.e2PreKeyClaim.deleteMany({});await db.e2Device.deleteMany({});a=randomUUID();b=randomUUID();b2=randomUUID();await chat.enrollMessagingDevice(users[0],'s',enrollment(a,1));await chat.enrollMessagingDevice(users[1],'s',enrollment(b,2));await chat.enrollMessagingDevice(users[1],'s',enrollment(b2,3));});
afterAll(async()=>{await closeMessagingPublisher();s3.destroy();await db.e2Outbox.deleteMany({});await db.e2Conversation.deleteMany({});await db.e2Device.deleteMany({});await db.$disconnect();});
async function message(room:string){return chat.sendMessagingEvent(users[0],'s',a,{conversationId:room,clientId:randomUUID(),envelopes:[b,b2].map(recipientDeviceId=>({recipientDeviceId,wireType:3 as const,ciphertextB64:Buffer.alloc(64,7).toString('base64')}))});}
it('counts once per recipient account and batches receipts across multiple devices without double decrements',async()=>{
 const c=await chat.createMessagingConversation(users[0],users[1]);await chat.resolveMessagingRequest(users[1],'s',b,c.id,{action:'accept',deliveredIds:[],readIds:[]});const rows=await Promise.all(Array.from({length:20},()=>message(c.id)));
 const member=()=>db.e2Member.findUniqueOrThrow({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}});
 expect(await member()).toMatchObject({unreadCount:20,unseenCount:20});
 await chat.resolveMessagingRequest(users[1],'s',b,c.id,{action:'accept',deliveredIds:[],readIds:[]});
 const ids=rows.map(row=>row.messageId);
 await chat.messagingReceiptBatch(users[1],'s',b,{conversationId:c.id,deliveredIds:ids,readIds:[]});expect(await member()).toMatchObject({unreadCount:20,unseenCount:0});
 await Promise.all([b,b2].map(device=>chat.messagingReceiptBatch(users[1],'s',device,{conversationId:c.id,deliveredIds:[],readIds:ids})));
 expect(await member()).toMatchObject({unreadCount:0,unseenCount:0});
 await chat.messagingReceiptBatch(users[1],'s',b,{conversationId:c.id,deliveredIds:ids,readIds:[]});expect(await member()).toMatchObject({unreadCount:0,unseenCount:0});
});
it('delete-for-me, request rejection and expiry reconcile counters',async()=>{
 const c=await chat.createMessagingConversation(users[0],users[1]);const one=await message(c.id),two=await message(c.id);
 await chat.deleteMessagingForMe(users[1],'s',b,c.id,one.messageId);await chat.deleteMessagingForMe(users[1],'s',b2,c.id,one.messageId);
 expect(await db.e2Member.findUnique({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}})).toMatchObject({unreadCount:1,unseenCount:1});
 await db.e2Message.update({where:{id:two.messageId},data:{expiresAt:new Date(0)}});await chat.cleanMessagingRetention();
 expect(await db.e2Member.findUnique({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}})).toMatchObject({unreadCount:0,unseenCount:0});
 await message(c.id);await chat.resolveMessagingRequest(users[1],'s',b,c.id,{action:'reject',deliveredIds:[],readIds:[]});expect(await db.e2Member.findUnique({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}})).toMatchObject({unreadCount:0,unseenCount:0});
});
it('uploads ciphertext directly to private storage and keeps only metadata in PostgreSQL',async()=>{
 const c=await chat.createMessagingConversation(users[0],users[1]);const blobId=randomUUID(),bytes=Buffer.alloc(128,5);const input={blobId,ciphertextBytes:bytes.length,ciphertextSha256:createHash('sha256').update(bytes).digest('base64')};
 const grant=await chat.reserveMessagingBlob(users[0],'s',a,c.id,input);expect('url' in grant).toBe(true);
 const upload=await fetch((grant as any).url,{method:'PUT',headers:(grant as any).headers,body:bytes});expect(upload.status).toBe(200);
 expect((await fetch((grant as any).url,{method:'PUT',headers:(grant as any).headers,body:bytes})).status).toBe(412);
 await chat.finalizeMessagingBlob(users[0],'s',a,c.id,blobId);
 const row=await db.e2Blob.findUniqueOrThrow({where:{id:blobId}});expect(row.ciphertext).toBeNull();expect(row.finalizedAt).not.toBeNull();
 const download=await chat.getMessagingBlob(users[1],'s',b,c.id,blobId);const response=await fetch((download as any).url);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
 const anonymous=await fetch((download as any).url.split('?')[0]);expect(anonymous.status).toBe(403);
 await chat.resolveMessagingRequest(users[1],'s',b,c.id,{action:'reject',deliveredIds:[],readIds:[]});await expect(chat.getMessagingBlob(users[1],'s',b,c.id,blobId)).rejects.toThrow('unavailable');await db.e2Blob.update({where:{id:blobId},data:{uploadGrantExpiresAt:new Date(0)}});await chat.cleanMessagingRetention();await expect(s3.send(new GetObjectCommand({Bucket:bucket,Key:row.objectKey}))).rejects.toThrow();
});
it('migrates old encrypted blob bytes without changing their encrypted descriptor IDs',async()=>{
 const c=await chat.createMessagingConversation(users[0],users[1]),id=randomUUID(),bytes=Buffer.alloc(64,8),key=`e2ee/${randomUUID()}`;
 await db.e2Blob.create({data:{id,conversationId:c.id,ownerDeviceId:a,objectKey:key,ciphertext:bytes,ciphertextBytes:64,finalizedAt:new Date(),expiresAt:new Date(Date.now()+60000)}});
 expect(await chat.migrateLegacyMessagingBlobs()).toBe(1);expect((await db.e2Blob.findUniqueOrThrow({where:{id}})).ciphertext).toBeNull();expect(await (await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}))).Body?.transformToByteArray()).toEqual(new Uint8Array(bytes));
});
it('publishes durable hints to subscribers on multiple API instances',async()=>{
 const first:any[]=[],second:any[]=[];const closeA=await subscribeMessagingHints(h=>first.push(...h)),closeB=await subscribeMessagingHints(h=>second.push(...h));
 try{const c=await chat.createMessagingConversation(users[0],users[1]);await message(c.id);for(let i=0;i<100&&(!first.some(h=>h.conversationId===c.id&&h.deviceId===b)||!second.some(h=>h.conversationId===c.id&&h.deviceId===b));i++)await new Promise(r=>setTimeout(r,20));expect(first).toEqual(expect.arrayContaining([{conversationId:c.id,deviceId:b}]));expect(second).toEqual(expect.arrayContaining([{conversationId:c.id,deviceId:b}]));}finally{await closeA();await closeB();}
});
it('a later device acknowledges restored account history without getting historical ciphertext or acknowledging another account',async()=>{
 const c=await chat.createMessagingConversation(users[0],users[1]);
 const row=await message(c.id);
 const later=randomUUID();await chat.enrollMessagingDevice(users[1],'s',enrollment(later,4));
 expect((await chat.messagingSync(users[1],'s',later,c.id,'0')).messages).toEqual([]);
 expect(await chat.messagingReceiptBatch(users[1],'s',later,{conversationId:c.id,deliveredIds:[],readIds:[row.messageId]})).toEqual({suppressed:true});
 await chat.resolveMessagingRequest(users[1],'s',later,c.id,{action:'accept',deliveredIds:[row.messageId],readIds:[row.messageId]});
 expect(await db.e2Member.findUnique({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}})).toMatchObject({unreadCount:0,unseenCount:0});
 expect(await db.e2Receipt.findUnique({where:{messageId_recipientDeviceId:{messageId:row.messageId,recipientDeviceId:later}}})).toMatchObject({status:'READ'});
 await expect(chat.messagingReceiptBatch(users[0],'s',a,{conversationId:c.id,deliveredIds:[],readIds:[row.messageId]})).rejects.toThrow('Receipts');
 await chat.messagingReceiptBatch(users[1],'s',b,{conversationId:c.id,deliveredIds:[],readIds:[row.messageId]});
 expect(await db.e2Member.findUnique({where:{conversationId_userId:{conversationId:c.id,userId:users[1]}}})).toMatchObject({unreadCount:0,unseenCount:0});
});

it('orders the inbox by latest committed activity and includes a ciphertext catch-up watermark',async()=>{
 const third='scale-third',thirdDevice=randomUUID();
 await db.user.upsert({where:{id:third},create:{id:third,name:third,username:third,email:`${third}@test.invalid`,emailVerifiedAt:new Date()},update:{}});
 await chat.enrollMessagingDevice(third,'s',enrollment(thirdDevice,4));
 const older=await chat.createMessagingConversation(users[0],users[1]);
 const newer=await chat.createMessagingConversation(users[0],third);
 await chat.sendMessagingEvent(users[0],'s',a,{conversationId:newer.id,clientId:randomUUID(),envelopes:[{recipientDeviceId:thirdDevice,wireType:3,ciphertextB64:Buffer.alloc(64,7).toString('base64')}]});
 const latest=await message(older.id);
 const rows=await chat.listMessagingConversations(users[0],'chat',1,21);
 expect(rows[0].id).toBe(older.id);
 expect(rows[0].lastSequence).toBe(latest.serverSequence);
 expect(new Date(rows[0].updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[0].createdAt).getTime());
 expect(JSON.stringify(rows)).not.toContain('ciphertextB64');
 expect((await chat.messagingSync(users[1],'s',b,older.id,'0')).messages[0].id).toBe(latest.messageId);
});
