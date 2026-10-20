import {Client} from 'pg';
import logger from '@/logger';
export type RealtimeHint = {userId:string;kind:'notifications'|'wallet'|'messages'|'quiz'|'analytics'|'auth'|'feed';conversationId?:string|null;postId?:string|null;sessionId?:string|null};
type Listener = {userId:string;receive:(hint:RealtimeHint)=>void;disconnect:()=>void};
const listeners=new Set<Listener>();
let client:Client|undefined;
let connecting:Promise<void>|undefined;
const kinds=new Set(['notifications','wallet','messages','quiz','analytics','auth','feed']);
async function stop() {
 const previous=client;client=undefined;connecting=undefined;
 if(previous) {try {await previous.end();}catch(error){logger.warn({event:'realtime_listener_close_failed',error},'Unable to close realtime database listener');}}
}
async function connect() {
 if(connecting)return connecting;
 const connection=new Client({connectionString:process.env.DATABASE_REALTIME_URL||process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL,application_name:'kwonserver-realtime-listener',connectionTimeoutMillis:5000,keepAlive:true});
 client=connection;
 connection.on('notification',event=>{
  try {
   const hint=JSON.parse(event.payload??'') as RealtimeHint;
   if(typeof hint.userId!=='string'||!kinds.has(hint.kind)||(hint.userId==='*'&&hint.kind!=='feed'))return;
   for(const listener of listeners)if(hint.userId===listener.userId||hint.userId==='*')listener.receive(hint);
  }catch {logger.warn({event:'invalid_realtime_hint'},'Discarded invalid realtime hint');}
 });
 const disconnected=async()=>{
  if(client!==connection)return;
  for(const listener of [...listeners])listener.disconnect();
  listeners.clear();
  await stop();
 };
 connection.on('error',async error=>{logger.warn({event:'realtime_listener_disconnected',error},'Realtime clients will reconnect and catch up');await disconnected();});
 connection.on('end',disconnected);
 connecting=(async()=>{await connection.connect();await connection.query('LISTEN kwonnet_realtime_v1');})();
 try {await connecting;}catch(error){logger.warn({event:'realtime_listener_connect_failed',error},'Unable to establish realtime database listener');await stop();throw error;}
}
/** One LISTEN connection per API process, shared across authenticated streams. */
export async function subscribeUserRealtime(userId:string,receive:Listener['receive'],disconnect:Listener['disconnect']) {
 const listener={userId,receive,disconnect};listeners.add(listener);
 try {await connect();}catch(error){logger.warn({event:'realtime_subscription_failed',error},'Unable to subscribe realtime stream');listeners.delete(listener);throw error;}
 return async()=>{listeners.delete(listener);if(!listeners.size)await stop();};
}
