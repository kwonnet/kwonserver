import {mkdirSync,writeFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import {Server} from 'socket.io';
import {io,type Socket} from 'socket.io-client';
import {randomUUID,generateKeyPairSync,sign,createHash} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {KeyHelper,SessionBuilder,SessionCipher,SignalProtocolAddress,type StorageType,type KeyPairType} from '@privacyresearch/libsignal-protocol-typescript';
import {S3Client,CreateBucketCommand} from '@aws-sdk/client-s3';
vi.mock('@/routes/v1',()=>({default:express.Router()}));
import db from '@/db';
import routes from '@/routes/v1/conversations';
import configureSockets from '@/socketIo/convoSocketIo';
import {startAuthSession} from '@/services/v1/auth';
import {jwtSign,encryptString} from '@/utils';
import {closeMessagingPublisher} from '@/services/v1/conversations/live';
const from64=(value:string)=>new Uint8Array(Buffer.from(value,'base64')).buffer;
const to64=(value:ArrayBuffer)=>Buffer.from(value).toString('base64');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
class Store implements StorageType {
 pairs=new Map<string,KeyPairType>();sessions=new Map<string,string>();pins=new Map<string,string>();registration=KeyHelper.generateRegistrationId();
 async getIdentityKeyPair(){return this.pairs.get('identity');}async getLocalRegistrationId(){return this.registration;}
 async isTrustedIdentity(id:string,key:ArrayBuffer){return !this.pins.has(id.replace(/\.\d+$/,''))||this.pins.get(id.replace(/\.\d+$/,''))===to64(key);}
 async saveIdentity(id:string,key:ArrayBuffer){id=id.replace(/\.\d+$/,'');if(this.pins.has(id)&&this.pins.get(id)!==to64(key))throw new Error('Peer identity changed');this.pins.set(id,to64(key));return false;}
 async loadPreKey(id:string|number){return this.pairs.get(`pre:${id}`);}async storePreKey(id:string|number,key:KeyPairType){this.pairs.set(`pre:${id}`,key);}async removePreKey(id:string|number){this.pairs.delete(`pre:${id}`);}
 async loadSignedPreKey(id:string|number){return this.pairs.get(`signed:${id}`);}async storeSignedPreKey(id:string|number,key:KeyPairType){this.pairs.set(`signed:${id}`,key);}async removeSignedPreKey(id:string|number){this.pairs.delete(`signed:${id}`);}
 async loadSession(id:string){return this.sessions.get(id);}async storeSession(id:string,value:string){this.sessions.set(id,value);}
}
type Actor={userId:string;deviceId:string;token:string;store:Store;socket:Socket;signing:ReturnType<typeof generateKeyPairSync>;server:number;cursors:Map<string,{after:string;receiptAfter:string}>;received:Map<string,string[]>;own:Map<string,any>;accepted:Set<string>;busy:boolean;dirty:boolean};
let servers:http.Server[]=[],namespaces:Server[]=[],bases:string[]=[],actors:Actor[]=[];const logicalStarts=new Map<string,number>(),deliveries:number[]=[],acks:number[]=[],failures:string[]=[];let httpRequests=0,socketRequests=0,duplicates=0,reconnectInterruptions=0;
async function api(actor:Actor,path:string,body?:unknown){httpRequests++;const response=await fetch(`${bases[actor.server]}/conversations${path}`,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${actor.token}`,'content-type':'application/json','x-messaging-device':actor.deviceId},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw new Error(`HTTP ${response.status} ${path}: ${await response.text()}`);return response.json();}
async function rpc(actor:Actor,event:string,body:any){socketRequests++;
 try{const result=await actor.socket.timeout(15000).emitWithAck(event,body);if(!result.ok)throw new Error(`${event}: ${result.error}`);return result;}
 catch(error){if(!actor.socket.connected||(error instanceof Error&&['socket has been disconnected','operation has timed out'].includes(error.message))){reconnectInterruptions++;if(event==='messages:sync')return api(actor,`/${body.conversationId}/messages?after=${body.after}&receiptAfter=${body.receiptAfter}`);if(event==='receipts:batch')return api(actor,'/receipts/batch',body);if(event==='message:send')return api(actor,'/messages',body);}throw error;}
}
async function connect(actor:Actor){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket binding timeout')),15000);actor.socket.once('device:challenge',async({challenge})=>{try{const signature=sign(null,Buffer.from(JSON.stringify(['kwonnet-device-bind',1,challenge,actor.userId,actor.deviceId])),actor.signing.privateKey).toString('base64');await rpc(actor,'device:bind',{deviceId:actor.deviceId,signature});clearTimeout(timer);resolve();}catch(error){clearTimeout(timer);reject(error);}});actor.socket.connect();});}
async function consume(actor:Actor,room:string){
 if(actor.busy){actor.dirty=true;return;}actor.busy=true;
 try{do{actor.dirty=false;const cursor=actor.cursors.get(room)??{after:'0',receiptAfter:'0'};const data=await rpc(actor,'messages:sync',{conversationId:room,...cursor});const incoming:string[]=[];
 for(const wire of data.messages){let clear:any;if(wire.ownDevice)clear=actor.own.get(wire.eventId);else{const address=new SignalProtocolAddress(`${wire.fromUserId}:${wire.fromDeviceId}:${room}`,wire.senderSignalDeviceId);await actor.store.saveIdentity(address.toString(),from64(wire.senderIdentityPublic));const cipher=new SessionCipher(actor.store,address);const bytes=from64(wire.ciphertextB64);clear=JSON.parse(new TextDecoder().decode(wire.wireType===3?await cipher.decryptPreKeyWhisperMessage(bytes):await cipher.decryptWhisperMessage(bytes)));}
 if(!clear||clear.eventId!==wire.eventId||clear.conversationId!==room)throw new Error('Encrypted context mismatch');
 if(wire.fromUserId!==actor.userId){incoming.push(wire.id);actor.received.set(room,[...(actor.received.get(room)??[]),wire.id]);deliveries.push(performance.now()-(logicalStarts.get(wire.eventId)??performance.now()));}
 }
 actor.cursors.set(room,{after:data.nextCursor,receiptAfter:data.nextReceiptCursor});
 if(actor.accepted.has(room)&&incoming.length)await rpc(actor,'receipts:batch',{conversationId:room,deliveredIds:[],readIds:incoming});
 if(data.messages.length===100||data.receipts.length===100)actor.dirty=true;
 }while(actor.dirty);}catch(error){failures.push(error instanceof Error?error.message:'receiver failed');}finally{actor.busy=false;}
}
async function actor(userId:string,server:number,deviceNumber:number,token:string){
 const store=new Store(),identity=await KeyHelper.generateIdentityKeyPair();store.pairs.set('identity',identity);const signed=await KeyHelper.generateSignedPreKey(identity,1);await store.storeSignedPreKey(1,signed.keyPair);const preKeys=[];for(let i=1;i<=20;i++){const pre=await KeyHelper.generatePreKey(i);await store.storePreKey(i,pre.keyPair);preKeys.push({keyId:i,publicKey:to64(pre.keyPair.pubKey)});}
 const signing=generateKeyPairSync('ed25519'),deviceId=randomUUID();const a:Actor={userId,deviceId,token,store,signing,server,socket:io(`${bases[server]}/conversations`,{autoConnect:false,transports:['websocket'],auth:{token}}),cursors:new Map(),received:new Map(),own:new Map(),accepted:new Set(),busy:false,dirty:false};
 await api(a,'/devices',{deviceId,signalDeviceId:deviceNumber,registrationId:store.registration,identityPublic:to64(identity.pubKey),actionSigningPublic:signing.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'),signedPreKey:{keyId:1,publicKey:to64(signed.keyPair.pubKey),signature:to64(signed.signature)},preKeys});
 a.socket.on('message:available',({conversationId})=>{void consume(a,conversationId);});await connect(a);actors.push(a);return a;
}
async function targets(a:Actor,peer:string,room:string){const roster=[...await api(a,`/users/${peer}/devices`),...await api(a,`/users/${a.userId}/devices`)];const list=[];for(const d of roster.filter((d:any)=>d.deviceId!==a.deviceId)){const address=new SignalProtocolAddress(`${d.userId}:${d.deviceId}:${room}`,d.signalDeviceId),cipher=new SessionCipher(a.store,address);if(!await cipher.hasOpenSession()){const bundle=await api(a,`/devices/${d.deviceId}/claim`,{claimId:randomUUID()});await new SessionBuilder(a.store,address).processPreKey({registrationId:bundle.registrationId,identityKey:from64(bundle.identityKey),signedPreKey:{keyId:bundle.signedPreKey.keyId,publicKey:from64(bundle.signedPreKey.publicKey),signature:from64(bundle.signedPreKey.signature)},...(bundle.preKey?{preKey:{keyId:bundle.preKey.keyId,publicKey:from64(bundle.preKey.publicKey)}}:{})});}list.push({deviceId:d.deviceId,cipher});}return list;}
beforeAll(async()=>{if(process.env.DATABASE_URL!=='postgresql://test:test@127.0.0.1:15432/kwonserver_test')throw new Error('Disposable database required');for(let i=0;i<2;i++){const app=express();app.use(express.json({limit:'2mb'}));app.use(cookieParser());app.use('/conversations',routes);const server=http.createServer(app),ws=new Server(server,{maxHttpBufferSize:2*1024*1024});configureSockets(ws);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));servers.push(server);namespaces.push(ws);bases.push(`http://127.0.0.1:${(server.address() as any).port}`);}});
afterAll(async()=>{actors.forEach(a=>a.socket.close());await Promise.all(namespaces.map(ws=>new Promise<void>(r=>ws.close(()=>r()))));await closeMessagingPublisher();await db.$disconnect();});
it('measures realistic encrypted messaging with concurrent users, multiple devices, requests, retries, files and reconnects',async()=>{
 const pairs=Math.max(1,Math.min(200,Number(process.env.MESSAGING_LOAD_PAIRS)||10)),perPair=Math.max(2,Math.min(50,Number(process.env.MESSAGING_LOAD_MESSAGES)||10));const prefix=`bench-${randomUUID().slice(0,8)}`;const contexts=[];
 const s3=new S3Client({endpoint:process.env.MESSAGING_STORAGE_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'disposable-storage',secretAccessKey:'disposable-storage-password'},requestChecksumCalculation:'WHEN_REQUIRED'});await s3.send(new CreateBucketCommand({Bucket:'kwonnet-private-test'})).catch(error=>{if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name))throw error;});
 for(let i=0;i<pairs;i++){const ids=[`${prefix}-${i}-a`,`${prefix}-${i}-b`];await db.user.createMany({data:ids.map(id=>({id,name:id,username:id,email:`${id}@test.invalid`,emailVerifiedAt:new Date()}))});const tokens=[];for(const id of ids){const sid=await startAuthSession(id,'PASSWORD',{device:{browser:null,browserVersion:null,os:null,osVersion:null,type:'unknown'},location:null,ipAddress:null,ipHash:null,metadataSource:'API_REQUEST'});tokens.push(jwtSign({data:encryptString(JSON.stringify({id,sessionId:sid,emailVerifiedAt:new Date(),name:id}),'integration-encryption')},{expiresIn:'15m'}));}
 const sender=await actor(ids[0],0,1,tokens[0]),receiver=await actor(ids[1],1,1,tokens[1]);const extra=i%3===0?await actor(ids[1],1,2,tokens[1]):undefined;const room=(await api(sender,'',{recipientId:ids[1]})).id;
 if(i%4!==0){await api(receiver,`/${room}/request`,{action:'accept'});receiver.accepted.add(room);extra?.accepted.add(room);}
 contexts.push({sender,receiver,extra,room,peer:ids[1],targets:await targets(sender,ids[1],room)});
 }
 const loop=monitorEventLoopDelay({resolution:20});loop.enable();const cpu=process.cpuUsage(),started=performance.now(),rss=process.memoryUsage().rss;const pendingChecks=[];
 await Promise.all(contexts.map(async(c,index)=>{for(let n=0;n<perPair;n++){
 const event={v:2,eventId:randomUUID(),conversationId:c.room,senderId:c.sender.userId,senderDeviceId:c.sender.deviceId,createdAt:new Date().toISOString(),content:{kind:'text',text:'x'.repeat(512)}};logicalStarts.set(event.eventId,performance.now());c.sender.own.set(event.eventId,event);const envelopes=[];for(const target of c.targets){const encrypted=await target.cipher.encrypt(new TextEncoder().encode(JSON.stringify(event)).buffer);envelopes.push({recipientDeviceId:target.deviceId,wireType:encrypted.type,ciphertextB64:Buffer.from(encrypted.body!,'binary').toString('base64')});}
 const payload={conversationId:c.room,clientId:event.eventId,envelopes};const first=await rpc(c.sender,'message:send',payload);acks.push(performance.now()-logicalStarts.get(event.eventId)!);if(n===1){expect((await rpc(c.sender,'message:send',payload)).messageId).toBe(first.messageId);duplicates++;}
 if(n===0&&!c.receiver.accepted.has(c.room)){for(let tries=0;tries<100&&!c.receiver.received.get(c.room)?.length;tries++)await pause(20);expect(await db.e2Receipt.count({where:{message:{conversationId:c.room}}})).toBe(0);pendingChecks.push(c.room);const ids=c.receiver.received.get(c.room)??[];await api(c.receiver,`/${c.room}/request`,{action:'accept',deliveredIds:ids,readIds:ids});c.receiver.accepted.add(c.room);c.extra?.accepted.add(c.room);}
 if(n===2&&index===0){c.receiver.socket.disconnect();await pause(30);await connect(c.receiver);await consume(c.receiver,c.room);}
 if(n===3&&index%3===0){const blobId=randomUUID(),plain=crypto.getRandomValues(new Uint8Array(65536)),key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(c.room)},key,plain));const grant=await api(c.sender,`/${c.room}/blobs`,{blobId,ciphertextBytes:bytes.length,ciphertextSha256:createHash('sha256').update(bytes).digest('base64')});expect((await fetch(grant.url,{method:'PUT',headers:grant.headers,body:bytes})).status).toBe(200);await api(c.sender,`/${c.room}/blobs/${blobId}/finalize`,{});const get=await api(c.receiver,`/${c.room}/blobs/${blobId}`);const downloaded=await fetch(get.url);expect(new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(c.room)},key,await downloaded.arrayBuffer()))).toEqual(plain);}
 await pause(20+Math.random()*80);
 }}));
 for(let wait=0;wait<200;wait++){const totals=await db.e2Member.aggregate({where:{userId:{startsWith:prefix}},_sum:{unreadCount:true}});if(totals._sum.unreadCount===0)break;for(const c of contexts)await consume(c.receiver,c.room);await pause(50);}
 const elapsed=(performance.now()-started)/1000,cpuUsed=process.cpuUsage(cpu);loop.disable();const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]??0;
 const report={pairs,devices:actors.length,logicalMessages:pairs*perPair,receivedEnvelopes:deliveries.length,deduplicatedRetries:duplicates,reconnectInterruptions,silentRequests:pendingChecks.length,httpRequests,socketRequests,elapsedSeconds:+elapsed.toFixed(3),messagesPerSecond:+(pairs*perPair/elapsed).toFixed(2),sendAckMs:{p50:+percentile(acks,.5).toFixed(2),p95:+percentile(acks,.95).toFixed(2)},deliveryMs:{p50:+percentile(deliveries,.5).toFixed(2),p95:+percentile(deliveries,.95).toFixed(2)},eventLoopP95Ms:+(loop.percentile(95)/1e6).toFixed(2),cpuMs:(cpuUsed.user+cpuUsed.system)/1000,rssGrowthMiB:+((process.memoryUsage().rss-rss)/1048576).toFixed(2),failures:failures.length};
 mkdirSync('reports',{recursive:true});writeFileSync('reports/messaging-load.json',JSON.stringify(report,null,2)+'\n');console.log('MESSAGING_LOAD_RESULT '+JSON.stringify(report));expect(failures).toEqual([]);expect(await db.e2Message.count({where:{senderDevice:{userId:{startsWith:prefix}}}})).toBe(pairs*perPair);expect((await db.e2Member.aggregate({where:{userId:{startsWith:prefix}},_sum:{unreadCount:true,unseenCount:true}}))._sum).toEqual({unreadCount:0,unseenCount:0});expect(deliveries.length).toBeGreaterThanOrEqual(pairs*perPair);s3.destroy();
});
