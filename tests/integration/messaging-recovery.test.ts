import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {S3Client,CreateBucketCommand} from '@aws-sdk/client-s3';
import db from '@/db';
import * as chat from '@/services/v1/conversations';
import {closeMessagingPublisher} from '@/services/v1/conversations/live';
const a='recovery-owner',b='recovery-peer',outsider='recovery-outsider';
const source=randomUUID(),replacement=randomUUID();
const s3=new S3Client({endpoint:'http://127.0.0.1:19000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'disposable-storage',secretAccessKey:'disposable-storage-password'}});
function bundle(deviceId:string,id:number){return {deviceId,signalDeviceId:id,registrationId:id,identityPublic:Buffer.alloc(33,1).toString('base64'),actionSigningPublic:Buffer.alloc(32,2).toString('base64'),signedPreKey:{keyId:1,publicKey:Buffer.alloc(33,3).toString('base64'),signature:Buffer.alloc(64,4).toString('base64')},preKeys:[]};}
beforeAll(async()=>{
 try{await s3.send(new CreateBucketCommand({Bucket:'kwonnet-private-test'}));}catch(error:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name))throw error;}
 await db.user.createMany({data:[a,b,outsider].map(id=>({id,name:id,username:id,email:`${id}@test.invalid`,emailVerifiedAt:new Date()})),skipDuplicates:true});
 await chat.enrollMessagingDevice(a,'old-session',bundle(source,301));
});
afterAll(async()=>{await closeMessagingPublisher();s3.destroy();await db.e2Outbox.deleteMany({});await db.e2Conversation.deleteMany({where:{initiatorId:a}});await db.user.deleteMany({where:{id:{in:[a,b,outsider]}}});await db.$disconnect();});
it('delivers one standard text introduction with no recipient device and enables E2EE only after acceptance',async()=>{
 const c=await chat.createMessagingConversation(a,b),id=randomUUID();
 await chat.sendMessagingIntroduction(a,c.id,id,'Hello before device setup');
 await chat.sendMessagingIntroduction(a,c.id,id,'Hello before device setup');
 const peer=await chat.messagingPeer(b,a);expect(peer.convo?.requestPreview?.text).toBe('Hello before device setup');
 const saved=await db.e2Conversation.findUniqueOrThrow({where:{id:c.id}});expect(saved.introCiphertext).not.toContain('Hello');
 await expect(chat.sendMessagingIntroduction(a,c.id,randomUUID(),'Second introduction')).rejects.toMatchObject({status:403});
 await expect(chat.sendMessagingIntroduction(outsider,c.id,randomUUID(),'Intrusion')).rejects.toMatchObject({status:404});
 const recipientDevice=randomUUID();await chat.enrollMessagingDevice(b,'recipient-session',bundle(recipientDevice,303));
 await chat.resolveMessagingRequest(b,'recipient-session',recipientDevice,c.id,{action:'accept',deliveredIds:[],readIds:[]});
 expect((await chat.messagingPeer(b,a)).convo?.state).toBe('ACCEPTED');
 await expect(chat.sendMessagingIntroduction(a,c.id,randomUUID(),'Downgrade')).rejects.toMatchObject({status:403});
});
it('recovers the same random history secret with a leading-zero passcode and restores private object bytes to a new device',async()=>{
 expect(await chat.messagingRecoveryStatus(a)).toEqual({configured:false});
 const setup=await chat.unlockMessagingRecovery(a,'012345',true);
 expect(setup.secret).toHaveLength(64);
 await expect(chat.unlockMessagingRecovery(a,'123456')).rejects.toMatchObject({status:403});
 const bytes=Buffer.from('opaque client-encrypted history bytes');
 const grant=await chat.reserveMessagingHistory(a,'old-session',source,bytes.length);
 const response=await fetch(grant.url,{method:'PUT',headers:grant.headers,body:bytes});expect(response.ok).toBe(true);
 await chat.finalizeMessagingHistory(a,'old-session',source,grant.id);
 await chat.enrollMessagingDevice(a,'new-session',bundle(replacement,302));
 const unlocked=await chat.unlockMessagingRecovery(a,'012345');expect(unlocked.secret).toBe(setup.secret);expect(unlocked.backups).toEqual([{id:grant.id,bytes:bytes.length}]);
 const download=await chat.downloadMessagingHistory(a,'new-session',replacement,grant.id);
 expect(Buffer.from(await (await fetch(download.url)).arrayBuffer())).toEqual(bytes);
 const foreignDevice=randomUUID();await chat.enrollMessagingDevice(outsider,'foreign-session',bundle(foreignDevice,304));
 await expect(chat.downloadMessagingHistory(outsider,'foreign-session',foreignDevice,grant.id)).rejects.toMatchObject({status:404});
 await expect(chat.unlockMessagingRecovery(a,'012345',true)).rejects.toMatchObject({status:409});
});
