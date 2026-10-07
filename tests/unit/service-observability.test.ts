import {EventEmitter} from 'node:events';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {beforeEach,expect,it,vi} from 'vitest';
import logger from '@/logger';
import {safeError,safeLogRecord,safeLogText} from '@/logger/sanitize';
import {logWorkerLifecycle,logServiceError,requestLoggingMiddleware} from '@/logger/events';
import pino from 'pino';
beforeEach(()=>vi.clearAllMocks());
it('keeps safe identifiers while excluding nested credentials and provider payloads',()=>{
 const record=safeLogRecord({jobId:'job-1',userId:'user-1',nested:{password:'unsafe',apiKey:'unsafe',refreshToken:'unsafe',body:{email:'private@test.invalid'},err:Object.assign(new Error('server returned password=unsafe'),{code:'EAUTH',command:{args:['unsafe']}})}});
 expect(record.jobId).toBe('job-1');expect(record.userId).toBe('user-1');expect(JSON.stringify(record)).not.toContain('unsafe');expect(JSON.stringify(record)).not.toContain('private@test.invalid');
 expect(record.nested.err.message).toBe('SMTP authentication failed');
});
it('removes SQL argument dumps, URLs with credentials, bearer tokens, emails and user IPs',()=>{
 const err=Object.assign(new Error('Invalid Prisma invocation data: password: value, email: person@test.invalid'),{name:'PrismaClientKnownRequestError',code:'P2002'});
 expect(safeError(err).message).toBe('Unique constraint violation');
 expect(safeError(new SyntaxError('Unexpected token: private message content')).message).toBe('Input parsing failed');
 const text=safeLogText('https://user:password@service.test/path?token=secret Bearer private-token person@test.invalid 192.0.2.5 2001:db8::1');
 expect(text).not.toMatch(/password|private-token|person@test|192\.0\.2\.5|2001:db8|\?token/);
 expect(text).toContain('service.test');
 expect(safeLogText('2026-10-07T20:45:00.000Z')).toBe('2026-10-07T20:45:00.000Z');
});
it('applies redaction to actual Pino output, including interpolated error messages',()=>{
 const lines:string[]=[];const module={exports:{} as any};
 const source=ts.transpileModule(readFileSync('src/logger/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',source)((id:string)=>id==='pino'?(options:any)=>pino({...options,transport:undefined},{write:(line:string)=>{lines.push(line);}}):{safeError,safeLogRecord,safeLogText},module,module.exports);
 module.exports.default.error({event:'mail_failure',userId:'safe-user',password:'unsafe-value',nested:{apiKey:'unsafe-value'},err:Object.assign(new Error('unsafe-value'),{code:'EAUTH'})},'Error token=unsafe-value');
 const written=lines.join('');expect(written).not.toContain('unsafe-value');expect(written).toContain('safe-user');
 expect(JSON.parse(lines[0]).err.message).toBe('SMTP authentication failed');
});
it('records queue start, completion, failure, stall and shutdown without logging job payloads',()=>{
 const worker=Object.assign(new EventEmitter(),{name:'emailDeliveryQueue'});logWorkerLifecycle(worker);
 const job={id:'job-1',name:'welcome',attemptsMade:0,data:{id:'email-1',userId:'user-1',password:'unsafe',body:'private'}};
 worker.emit('active',job);worker.emit('completed',{...job,attemptsMade:1});
 worker.emit('failed',{...job,attemptsMade:1},Object.assign(new Error('password=unsafe'),{code:'EAUTH'}));
 worker.emit('stalled','job-1');worker.emit('closed');
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({event:'job_started',resourceId:'email-1',attempt:1}),expect.any(String));
 expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({event:'job_completed',jobId:'job-1'}),expect.any(String));
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({event:'job_failed',err:expect.objectContaining({message:'SMTP authentication failed'})}),expect.any(String));
 expect(JSON.stringify([vi.mocked(logger.info).mock.calls,vi.mocked(logger.error).mock.calls])).not.toMatch(/unsafe|private/);
});
it('distinguishes recovered cache/parser failures from failed business operations',()=>{
 logServiceError('posts','readCache',new Error('Cache unavailable'),true);
 expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({event:'service_fallback',operation:'readCache'}),expect.any(String));
 expect(logger.error).not.toHaveBeenCalled();
});
it('correlates service failures and HTTP outcomes without logging request bodies or headers',()=>{
 const res:any=Object.assign(new EventEmitter(),{statusCode:503,writableFinished:true,setHeader:vi.fn()});
 requestLoggingMiddleware({method:'POST',route:{path:'/auth/signup'},user:{id:'user-1'},body:{password:'unsafe'},headers:{authorization:'unsafe'}} as any,res,()=>logServiceError('auth','createUser',new Error('Database unavailable')));
 res.emit('finish');res.emit('close');
 const started=vi.mocked(logger.info).mock.calls.find(([entry]:any)=>entry.event==='request_started')![0] as any;
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({event:'service_failed',operation:'createUser',requestId:started.requestId}),expect.any(String));
 expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({event:'request_failed',requestId:started.requestId,statusCode:503,userId:'user-1'}),expect.any(String));
 expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('unsafe');
});
it('does not leave unobserved catch clauses in service modules',()=>{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):entry.name.endsWith('.ts')&&!entry.name.endsWith('.d.ts')?[path.join(dir,entry.name)]:[]);
 for(const file of files('src/services')){
  const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const walk=(node:ts.Node)=>{if(ts.isCatchClause(node)) expect(node.block.getText(tree),`${file}:${tree.getLineAndCharacterOfPosition(node.pos).line+1}`).toMatch(/logServiceError\(|logGameError\(|logger\.(error|warn)\(/);ts.forEachChild(node,walk);};walk(tree);
 }
});
