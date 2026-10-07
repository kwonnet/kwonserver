const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const http=require('node:http');
function app(){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/app/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(require,m,m.exports);return m.exports.default;}
test('API responses deny indexing while allowing crawlers to see the directive',async()=>{
 const api=app();api.use(require('cors')());api.get('/',(_req,res)=>res.send('Healthy'));api.get('/api/v1/public',(_req,res)=>res.json({public:true}));api.get('/failed',()=>{throw Error('test');});api.use((_error,_req,res,_next)=>res.status(500).json({error:'Unavailable'}));
 const server=http.createServer(api);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const method of ['HEAD','OPTIONS']) {const response=await fetch(base+'/api/v1/public',{method,headers:{Origin:'https://kwonnet.test','Access-Control-Request-Method':'GET'}});assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, nosnippet',method);}
  for(const path of ['/','/api/v1/public','/robots.txt','/missing','/failed']){
   const response=await fetch(base+path);assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, nosnippet',path);
   if(path==='/robots.txt'){assert.equal(response.status,200);assert.match(await response.text(),/Allow: \//);}
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
