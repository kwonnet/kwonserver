import {beforeEach,expect,it,vi} from 'vitest';
import {createHash,createHmac} from 'node:crypto';
import {response} from './fixtures';
const deps=vi.hoisted(()=>({redis:{isReady:true,eval:vi.fn()}}));
vi.mock('@/redis',()=>({default:deps.redis}));
vi.mock('@/middleware',()=>({authMiddleware:()=>()=>{}}));
vi.mock('@/controllers/v1/auth',()=>Object.fromEntries(['authEmailActionController','accountSettingsController','passwordUpdateController','authSessionsController','loginEventsController','revokeAuthSessionController','googleSignInController','getMeController','logoutController','refreshTokenController','signInController','signUpController'].map(name=>[name,()=>{}])));
vi.mock('@/utils/ipLocation',()=>({lookup:vi.fn()}));
import router from '@/routes/v1/auth';
import {AUTH_RATE_LIMIT_SCRIPT} from '@/utils/auth-security';
const routes=(router as any).stack.filter((layer:any)=>layer.route).map((layer:any)=>layer.route);
const endpoints=[['post','/signup'],['post','/forgot-password'],['post','/reset-password'],['post','/resend-verification'],['post','/verify-email'],['post','/signin'],['post','/google'],['post','/logout'],['post','/refresh-token'],['get','/me'],['get','/session-status'],['get','/settings'],['patch','/password'],['get','/sessions'],['get','/login-events'],['delete','/sessions/:id']];
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function request(path='/signin',ip='198.51.100.1',headers:Record<string,string>={}){return {method:'POST',route:{path},ip,socket:{remoteAddress:ip},get:(name:string)=>headers[name]} as any;}
beforeEach(()=>{
 deps.redis.isReady=true;let count=0;
 deps.redis.eval.mockImplementation(async()=>[++count<=5?1:0,700]);
 vi.stubEnv('AUTH_TELEMETRY_SHARED_SECRET','s'.repeat(32));
});
it.each(endpoints)('limits %s %s before reaching its handler',async(method,path)=>{
 const route=routes.find((route:any)=>route.path===path&&route.methods[method]);expect(route).toBeDefined();
 const guard=route.stack[0].handle,next=vi.fn(),req={...request(path),method:method.toUpperCase()};
 for(let attempt=0;attempt<5;attempt++)await guard(req,response(),next);
 expect(next).toHaveBeenCalledTimes(5);
 const res=response();await guard(req,res,next);
 expect(res.statusCode).toBe(429);expect(next).toHaveBeenCalledTimes(5);expect(res.setHeader).toHaveBeenCalledWith('Retry-After','700');
 expect(deps.redis.eval).toHaveBeenCalledWith(AUTH_RATE_LIMIT_SCRIPT,{keys:[`auth:rate:v2:${hash(`${method.toUpperCase()}:${path}`)}:${hash(req.ip)}`],arguments:['5','900']});
});
it('uses only verified visitor IPs and normalizes mapped IPv4 addresses',async()=>{
 const guard=routes.find((route:any)=>route.path==='/signin').stack[0].handle;
 const encoded=Buffer.from(JSON.stringify({at:Date.now(),ip:'203.0.113.3',agent:'Browser'})).toString('base64url');
 const headers={'x-kwonnet-auth-context':encoded,'x-kwonnet-auth-signature':createHmac('sha256','s'.repeat(32)).update(encoded).digest('hex')};
 await guard(request('/signin','::ffff:198.51.100.2',headers),response(),vi.fn());
 expect(deps.redis.eval.mock.calls.at(-1)?.[1].keys[0]).toContain(hash('203.0.113.3'));
 await guard(request('/signin','::ffff:198.51.100.2',{...headers,'x-kwonnet-auth-signature':'0'.repeat(64),'x-forwarded-for':'203.0.113.99'}),response(),vi.fn());
 expect(deps.redis.eval.mock.calls.at(-1)?.[1].keys[0]).toContain(hash('198.51.100.2'));
});
it.each(['offline','error'])('fails closed when Redis is %s',async state=>{
 deps.redis.isReady=state!=='offline';deps.redis.eval.mockRejectedValue(new Error('offline'));
 const guard=routes.find((route:any)=>route.path==='/signin').stack[0].handle,next=vi.fn(),res=response();
 await guard(request(),res,next);expect(res.statusCode).toBe(503);expect(next).not.toHaveBeenCalled();
});
