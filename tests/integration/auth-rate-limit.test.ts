import {afterAll,beforeAll,expect,it} from 'vitest';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import redis from '@/redis';
import {consumeAuthRateLimit} from '@/utils/auth-security';
const scopes:string[]=[];
function scope(){const value=`integration-auth:${randomUUID()}`;scopes.push(value);return value;}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const key=(scope:string,identity:string)=>`auth:rate:v2:${hash(scope)}:${hash(identity)}`;
beforeAll(async()=>{if(!redis.isReady)await once(redis,'ready');});
afterAll(async()=>{for(const scope of scopes){const keys=await redis.keys(`auth:rate:v2:${hash(scope)}:*`);if(keys.length)await redis.del(keys);}await redis.quit();});
it('admits only five simultaneous requests across shared clients with an atomic 15-minute expiry',async()=>{
 const bucket=scope(),peer=redis.duplicate();await peer.connect();
 try{
  // Independent API replicas share the same Redis keys and atomic script.
  const {AUTH_RATE_LIMIT_SCRIPT}=await import('@/utils/auth-security');
  const results=await Promise.all(Array.from({length:40},async(_,index)=>{
    if(index%2)return await consumeAuthRateLimit(bucket,'ip');
    const result=await peer.eval(AUTH_RATE_LIMIT_SCRIPT,{keys:[key(bucket,'ip')],arguments:['5','900']}) as number[];
    return {allowed:Number(result[0])===1,retryAfter:Number(result[1])};
  }));
  expect(results.filter(row=>row.allowed)).toHaveLength(5);expect(await redis.get(key(bucket,'ip'))).toBe('5');
  expect(await redis.ttl(key(bucket,'ip'))).toBeGreaterThan(890);expect(results.every(row=>row.retryAfter>0&&row.retryAfter<=900)).toBe(true);
 }finally{await peer.quit();}
});
it('isolates endpoints and IPs, expires windows and does not extend blocked windows',async()=>{
 const bucket=scope();for(let i=0;i<5;i++)expect((await consumeAuthRateLimit(bucket,'first')).allowed).toBe(true);
 await redis.expire(key(bucket,'first'),100);const denied=await consumeAuthRateLimit(bucket,'first');expect(denied).toEqual({allowed:false,retryAfter:100});
 expect((await consumeAuthRateLimit(bucket,'second')).allowed).toBe(true);expect((await consumeAuthRateLimit(scope(),'first')).allowed).toBe(true);
 await redis.pExpire(key(bucket,'first'),1);await new Promise(resolve=>setTimeout(resolve,10));expect((await consumeAuthRateLimit(bucket,'first')).allowed).toBe(true);expect(await redis.ttl(key(bucket,'first'))).toBeGreaterThan(890);
});
it('repairs legacy or damaged counters without expiry and limits a verified Google subject independently',async()=>{
 const bucket=scope();await redis.set(key(bucket,'ip'),'5');expect((await consumeAuthRateLimit(bucket,'ip')).allowed).toBe(false);expect(await redis.ttl(key(bucket,'ip'))).toBeGreaterThan(890);
 const subject=scope();for(let i=0;i<5;i++)await consumeAuthRateLimit(subject,'verified-google-subject');expect((await consumeAuthRateLimit(subject,'verified-google-subject')).allowed).toBe(false);
});
