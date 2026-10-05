const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const python = execFileSync('which', ['python3'], { encoding: 'utf8' }).trim();
const source = fs.readFileSync(path.join(__dirname, '../deploy/compute/deploy.sh'), 'utf8');
const image = 'region-docker.pkg.dev/test-project/kwonnet/kwonserver@sha256:'+'a'.repeat(64);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwon-deploy-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(path.join(root, 'check-cloud-logging.py'), 'import os, sys\nsys.exit(1 if os.environ.get("FAIL_LOGGING") else 0)\n');
  fs.copyFileSync(path.join(__dirname, '../deploy/compute/diagnostics.py'), path.join(root, 'diagnostics.py'));
  fs.writeFileSync(path.join(root, 'registry-token'), 'test-token');
  fs.writeFileSync(path.join(root, 'app.env'), 'DATABASE_URL=test\nREDIS_URL=test\nJWT_SECRET=test\nMONGO_URL=test\nAPI_DOMAIN=api.example.com\nACME_EMAIL=admin@example.com\n');
  fs.writeFileSync(path.join(root, 'deploy.sh'), source.replace('[[ $EUID -eq 0 ]]', 'true').replace('ROOT=/opt/kwonnet', `ROOT='${root}/runtime'`));
  for (const name of ['flock','systemctl','sleep']) fs.writeFileSync(path.join(root,'bin',name), '#!/bin/sh\nexit 0\n',{mode:0o755});
  fs.writeFileSync(path.join(root, 'bin/docker'), `#!${python}\n`+String.raw`
import json,os,sys
args=sys.argv[1:]
with open(os.environ['CALL_LOG'],'a') as log: log.write(json.dumps(args)+'\n')
if args[:2]==['image','prune'] and os.environ.get('FAIL_PRUNE'): sys.exit(23)
if args[0]=='login': sys.stdin.read()
if args[:2]==['container','inspect']: sys.exit(1)
if args[0]=='logs': print('Startup error: missing configuration; '+os.environ.get('LOG_SECRET',''))
if args[0]=='inspect' and os.environ.get('FAIL_HEALTH'):
    print('unhealthy'); sys.exit(0)
if args[0]=='inspect':
    print('healthy' if 'Health.Status' in args[2] else ('true' if 'Running' in args[2] else '0'))
if args[0]=='run' and args[-1].endswith('exec npm run db:deploy') and os.environ.get('FAIL_MIGRATION'): sys.exit(42)
if args[0]=='exec' and os.environ.get('FAIL_HANDSHAKE'): sys.exit(43)
`,{mode:0o755});
  const run=(extra={},ref=image)=>spawnSync('bash',[path.join(root,'deploy.sh'),ref],{encoding:'utf8',env:{...process.env,PATH:`${root}/bin:${process.env.PATH}`,CALL_LOG:path.join(root,'calls'),...extra}});
  const calls=()=>fs.existsSync(path.join(root,'calls'))?fs.readFileSync(path.join(root,'calls'),'utf8').trim().split('\n').map(JSON.parse):[];
  return {root,run,calls};
}
test('automatic deployment migrates before starting API and worker, and records image',t=>{
  const f=fixture(t),r=f.run();assert.equal(r.status,0,r.stderr);
  const c=f.calls();assert.ok(c.findIndex(a=>a.some(v=>v.includes('exec npm run db:deploy')))<c.findIndex(a=>a.includes('--name')));
  assert.ok(c.some(a=>a.includes('kwonserver-worker')&&a.includes('start:worker')));
  assert.equal(fs.readFileSync(path.join(f.root,'runtime/image'),'utf8'),image+'\n');
  assert.equal(fs.existsSync(path.join(f.root,'registry-token')),false);
  assert.equal(fs.existsSync(path.join(f.root,'app.env')),false);
});
test('migration failure prevents replacement',t=>{
  const f=fixture(t);assert.equal(f.run({FAIL_MIGRATION:'1'}).status,42);
  assert.ok(!f.calls().some(a=>a.includes('--name')||a[0]==='stop'));
  assert.equal(fs.existsSync(path.join(f.root,'runtime/image')),false);
});
test('handshake failure is not recorded as a successful release',t=>{
  const f=fixture(t);assert.equal(f.run({FAIL_HANDSHAKE:'1'}).status,43);
  assert.equal(fs.existsSync(path.join(f.root,'runtime/image')),false);
});
test('requires app settings when no existing VM environment is available',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'app.env'),'');
  const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/KWONSERVER_ENV/);
  assert.equal(f.calls().length,0);
});
test('rejects mutable image tags before Docker operations',t=>{
  const f=fixture(t);assert.equal(f.run({},'example.com/server:main').status,2);assert.equal(f.calls().length,0);
});
test('reuses an existing VM environment when no new secret is supplied',t=>{
  const f=fixture(t);
  fs.mkdirSync(path.join(f.root,'runtime/env'),{recursive:true});
  fs.renameSync(path.join(f.root,'app.env'),path.join(f.root,'runtime/env/kwonserver.env'));
  const r=f.run();assert.equal(r.status,0,r.stderr);
  assert.match(fs.readFileSync(path.join(f.root,'runtime/env/kwonserver.env'),'utf8'),/JWT_SECRET=test/);
});
test('rejects quoted Docker environment values before migrations',t=>{
  const f=fixture(t);fs.appendFileSync(path.join(f.root,'app.env'),'OTHER="quoted"\n');
  const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/surrounding quotes/);
  assert.equal(f.calls().length,0);
});

test('health failure reports startup logs, redacts runtime secrets and does not record success',t=>{
  const f=fixture(t);
  const secret='private-token-123456';
  fs.appendFileSync(path.join(f.root,'app.env'),'OPENAI_API_KEY='+secret+'\n');
  const r=f.run({FAIL_HEALTH:'1',LOG_SECRET:secret});
  assert.equal(r.status,1);
  assert.match(r.stderr,/API health check failed/);
  assert.match(r.stderr,/Startup error: missing configuration/);
  assert.match(r.stderr,/\[REDACTED\]/);
  assert.ok(!r.stderr.includes(secret));
  assert.equal(fs.existsSync(path.join(f.root,'runtime/image')),false);
  assert.equal(fs.existsSync(path.join(f.root,'app.env')),false);
});

test('all persistent containers forward logs with bounded nonblocking local caching',t=>{
  const f=fixture(t);const r=f.run();assert.equal(r.status,0,r.stderr);
  const containers=f.calls().filter(a=>a[0]==='run'&&a.includes('--name'));
  assert.equal(containers.length,3);
  for(const args of containers){
    assert.equal(args[args.indexOf('--log-driver')+1],'gcplogs');
    for(const option of ['mode=non-blocking','max-buffer-size=4m','cache-disabled=false','cache-max-size=10m','cache-max-file=3']) assert.ok(args.includes(option));
    assert.ok(!args.some(a=>a.startsWith('env=')||a==='gcp-log-cmd=true'));
  }
});
test('logging permission failure leaves existing containers untouched',t=>{
  const f=fixture(t);assert.equal(f.run({FAIL_LOGGING:'1'}).status,1);
  assert.ok(!f.calls().some(a=>['stop','rm','run'].includes(a[0])));
});

test('image cleanup runs after release validation and never prunes volumes or containers', t => {
  const f=fixture(t), r=f.run(); assert.equal(r.status,0,r.stderr);
  const c=f.calls(); assert.deepEqual(c.at(-1),['image','prune','--all','--force']);
  assert.ok(c.findIndex(a=>a[0]==='exec'&&a.includes('kwonserver-proxy')) < c.length-1);
});
test('failed migration does not run post-release cleanup', t => {
  const f=fixture(t); assert.equal(f.run({FAIL_MIGRATION:'1'}).status,42);
  assert.ok(!f.calls().some(a=>a[0]==='image'));
});
test('post-release cleanup failure warns without failing a healthy deployment', t => {
  const f=fixture(t), r=f.run({FAIL_PRUNE:'1'}); assert.equal(r.status,0,r.stderr);
  assert.match(r.stderr,/release succeeded, but unused image cleanup failed/);
  assert.equal(fs.readFileSync(path.join(f.root,'runtime/image'),'utf8'),image+'\n');
});
