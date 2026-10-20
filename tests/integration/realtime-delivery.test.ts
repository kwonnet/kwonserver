import {Client} from 'pg';
import {expect,it} from 'vitest';
import {subscribeUserRealtime,type RealtimeHint} from '@/services/v1/notifications/live';
const pause=()=>new Promise(resolve=>setTimeout(resolve,50));
it('publishes only committed changes, isolates recipients and shares a single listener connection',async()=>{
 const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 const first:RealtimeHint[]=[],second:RealtimeHint[]=[];
 const off1=await subscribeUserRealtime('realtime-first',hint=>first.push(hint),()=>{});
 const off2=await subscribeUserRealtime('realtime-second',hint=>second.push(hint),()=>{});
 try {
  await db.query(`INSERT INTO "User" (id,name,username,email,"updatedAt") VALUES ('realtime-first','First','realtime-first','first@realtime.test',NOW()),('realtime-second','Second','realtime-second','second@realtime.test',NOW())`);
  const count=await db.query(`SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name='kwonserver-realtime-listener'`);expect(count.rows[0].total).toBe(1);
  await db.query('BEGIN');
  await db.query(`INSERT INTO "Notification" (id,title,message,"recipientId","updatedAt") VALUES ('realtime-notification','Private title','Private message','realtime-first',NOW())`);
  await pause();expect(first).toEqual([]);await db.query('COMMIT');
  await expect.poll(()=>first.length).toBe(1);expect(second).toEqual([]);expect(first[0]).toMatchObject({userId:'realtime-first',kind:'notifications'});expect(JSON.stringify(first)).not.toMatch(/Private/);
  await db.query('BEGIN');await db.query(`UPDATE "Notification" SET "isRead"=true WHERE id='realtime-notification'`);await db.query('ROLLBACK');await pause();expect(first).toHaveLength(1);
  await db.query(`UPDATE "Notification" SET "isSeen"=true WHERE id='realtime-notification'`);await expect.poll(()=>first.length).toBe(2);
  await db.query(`UPDATE "Notification" SET "pushAttempts"=1 WHERE id='realtime-notification'`);await pause();expect(first).toHaveLength(2);
  await db.query(`INSERT INTO "Wallet" (id,user_id,"updatedAt") VALUES ('realtime-wallet','realtime-first',NOW())`);
  await db.query(`UPDATE "Wallet" SET coins=100 WHERE id='realtime-wallet'`);await expect.poll(()=>first.length).toBe(3);expect(first[2]).toMatchObject({userId:'realtime-first',kind:'wallet'});
  await db.query(`INSERT INTO "UserSession" (id,"userId",provider,device,"metadataSource","expiresAt","retainUntil") VALUES ('realtime-session','realtime-first','PASSWORD','{}','test',NOW()+INTERVAL '1 day',NOW()+INTERVAL '2 days')`);
  await db.query(`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE id='realtime-session'`);await expect.poll(()=>first.length).toBe(4);expect(first[3]).toMatchObject({kind:'auth',sessionId:'realtime-session'});
  // A public feed hint contains no post contents; recipient hints never fan out.
  await db.query(`SELECT pg_notify('kwonnet_realtime_v1','{"userId":"*","kind":"feed"}')`);await expect.poll(()=>second.length).toBe(1);expect(second[0].kind).toBe('feed');
  await off1();await db.query(`SELECT pg_notify('kwonnet_realtime_v1','{"userId":"realtime-second","kind":"messages","conversationId":"chat"}')`);await expect.poll(()=>second.length).toBe(2);expect(second[1].conversationId).toBe('chat');
 }finally{
  await off1();await off2();await db.query(`DELETE FROM "Wallet" WHERE id='realtime-wallet'`);await db.query(`DELETE FROM "UserSession" WHERE id='realtime-session'`);await db.query(`DELETE FROM "Notification" WHERE id='realtime-notification'`);await db.query(`DELETE FROM "User" WHERE id IN ('realtime-first','realtime-second')`);await db.end();
 }
});
