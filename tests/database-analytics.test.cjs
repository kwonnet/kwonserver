const test = require('node:test');
const assert = require('node:assert/strict');
const { mode, enableExtensions, prepareAnalytics, backfill, releaseUrl } = require('../scripts/database-analytics.cjs');
const log = { info() {}, warn() {} };
test('Apache-only TimescaleDB uses hypertables and live views without licensed aggregate calls', async () => {
  const calls = [];
  await prepareAnalytics({ query: async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT extname')) return { rows: [{ extname: 'timescaledb' }] };
    if (sql.includes("current_setting('timescaledb.license'")) return { rows: [{ license: 'apache' }] };
    if (sql.startsWith('SELECT cursor')) return { rows: [{ completedAt: new Date() }] };
    return { rows: [] };
  } }, log, {});
  assert.ok(calls.some(sql => sql.includes('create_hypertable')));
  assert.equal(calls.filter(sql => sql.startsWith('CREATE VIEW')).length, 2);
  assert.ok(!calls.some(sql => /timescaledb.continuous|add_continuous_aggregate_policy|refresh_continuous_aggregate/.test(sql)));
});
test('repeat setup recognizes the continuous aggregate view facade and preserves its refresh policy', async () => {
  const calls = [];
  await prepareAnalytics({ query: async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT extname')) return { rows: [{ extname: 'timescaledb' }] };
    if (sql.includes("current_setting('timescaledb.license'")) return { rows: [{ license: 'timescale' }] };
    if (sql.startsWith('SELECT relkind')) return { rows: [{ relkind: 'v' }] };
    if (sql.includes('timescaledb_information.continuous_aggregates')) return { rows: [{}] };
    if (sql.startsWith('SELECT cursor')) return { rows: [{ completedAt: new Date() }] };
    if (sql.startsWith('SELECT 1 FROM "KwonnetAnalyticsSetup"')) return { rows: [{}] };
    return { rows: [] };
  } }, log, {});
  assert.equal(calls.filter(sql => sql.includes('add_continuous_aggregate_policy')).length, 2);
  assert.ok(!calls.some(sql => sql.startsWith('CREATE') || sql.startsWith('CALL refresh')));
});
test('extension setup enables both when supported and refuses an unsupported required TimescaleDB', async () => {
  const calls = [];
  const db = { query: async sql => { calls.push(sql); return { rows: [{ name: 'vector' }, { name: 'timescaledb' }] }; } };
  assert.equal(await enableExtensions(db, log, {}), true);
  assert.deepEqual(calls.slice(1), ['CREATE EXTENSION IF NOT EXISTS vector', 'CREATE EXTENSION IF NOT EXISTS timescaledb']);
  const postgres = { query: async () => ({ rows: [{ name: 'vector' }] }) };
  assert.equal(await enableExtensions(postgres, log, {}), false);
  await assert.rejects(enableExtensions(postgres, log, { TIMESCALEDB_MODE: 'required' }), /does not provide TimescaleDB/);
  await assert.rejects(enableExtensions({ query: async () => ({ rows: [] }) }, log, {}), /pgvector/);
  assert.throws(() => mode({ TIMESCALEDB_MODE: 'anything' }), /must be/);
});
test('an installed extension permission failure stops deployment rather than silently degrading', async () => {
  let queries = 0;
  await assert.rejects(enableExtensions({ query: async () => {
    if (queries++ === 0) return { rows: [{ name: 'vector' }, { name: 'timescaledb' }] };
    throw new Error('permission denied');
  } }, log, {}), /permission denied/);
});
test('completed backfill is not replayed on every release', async () => {
  const calls = [];
  await backfill({ query: async (sql, params) => { calls.push([sql, params]); return { rows: [{ completedAt: new Date() }] }; } }, log);
  assert.equal(calls.length, 2);
});
test('backfill resumes at the committed cursor and commits each batch with its checkpoint', async () => {
  const calls = []; let batches = 0;
  await backfill({ query: async (sql, params) => {
    calls.push([sql, params]);
    if (sql.startsWith('SELECT cursor')) return { rows: [{ cursor: 'previous', completedAt: null }] };
    if (sql.startsWith('SELECT id')) return { rows: batches++ === 0 ? [{ id: 'next' }] : [] };
    return { rows: [] };
  } }, log);
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('SELECT id'))[1], ['previous']);
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('SELECT kwonnet_sync'))[1], [['next']]);
  assert.equal(calls.filter(([sql]) => sql === 'COMMIT').length, 2);
  assert.deepEqual(calls.filter(([sql]) => sql.startsWith('UPDATE')).map(([, params]) => params.slice(1)), [['next', false], ['next', true]]);
});
test('a failed indexing batch rolls back without advancing its cursor', async () => {
  const calls = [];
  await assert.rejects(backfill({ query: async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT cursor')) return { rows: [{ cursor: null, completedAt: null }] };
    if (sql.startsWith('SELECT id')) return { rows: [{ id: 'bad' }] };
    if (sql.startsWith('SELECT kwonnet_sync')) throw new Error('index failed');
    return { rows: [] };
  } }, log), /index failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});

test('release uses the same Neon database directly while preserving application pooling and explicit configuration', () => {
  const source = 'postgresql://test:password@ep-example-pooler.eu.aws.neon.tech/kwonnet?sslmode=require&pgbouncer=true';
  const env = { DATABASE_URL: source };
  const result = new URL(releaseUrl(env));
  assert.equal(result.hostname, 'ep-example.eu.aws.neon.tech');
  assert.equal(result.pathname, '/kwonnet');
  assert.equal(result.searchParams.get('sslmode'), 'require');
  assert.equal(result.searchParams.has('pgbouncer'), false);
  assert.equal(env.DATABASE_URL, source);
  assert.equal(releaseUrl({ DATABASE_URL: source, DATABASE_MIGRATION_URL: 'postgresql://test:password@localhost/other' }), 'postgresql://test:password@localhost/other');
  assert.equal(releaseUrl({ DATABASE_URL: 'postgresql://test:password@custom-pooler.example/db' }), 'postgresql://test:password@custom-pooler.example/db');
});

test('automatic database release migrates then seeds with the direct runtime connection and fails closed on seed errors',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  for(const failSeed of [false,true]) {
    const commands=[],queries=[];let ended=false;
    const url='postgresql://test:password@direct.example/db';
    class Client {
      async connect(){} async end(){ended=true;}
      async query(sql){queries.push(sql);return {rows:sql.includes('pg_available_extensions')?[{name:'vector'}]:sql.includes('SELECT relkind')?[{relkind:'v'}]:sql.includes('SELECT cursor')?[{completedAt:new Date()}]:[]};}
    }
    const module={exports:{}},nativeRequire=require;
    const fakeRequire=name=>name==='pg'?{Client}:name==='dotenv'?{config(){}}:name==='node:child_process'?{spawnSync:(binary,args,options)=>{commands.push({args,options});return {status:failSeed&&args.includes('seed')?1:0};}}:nativeRequire(name);
    fakeRequire.resolve=()=>'/prisma-cli';
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/database-analytics.cjs'),'utf8'),{require:fakeRequire,module,exports:module.exports,__dirname:path.join(__dirname,'../scripts'),process:{execPath:process.execPath,argv:[],env:{DATABASE_URL:'postgresql://test:password@pool.example/db',DATABASE_MIGRATION_URL:url}},URL,console:{info(){},warn(){}}});
    if(failSeed)await assert.rejects(module.exports.main('deploy'),/migration\/seed failed/);else await module.exports.main('deploy');
    assert.deepEqual(commands.map(command=>Array.from(command.args).slice(1)),[['migrate','deploy'],['db','seed']]);
    assert.ok(commands.every(command=>command.options.env.DATABASE_URL===url&&command.options.env.DATABASE_MIGRATION_URL===url));
    assert.equal(ended,true);
    assert.equal(queries.some(sql=>sql.includes('SELECT extname')),!failSeed,'analytics and new services must wait for successful seeding');
  }
});

test('first setup warms aggregates before scheduling background policies and checkpoints only completed refreshes',async()=>{
 const calls=[];
 await prepareAnalytics({query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT extname'))return {rows:[{extname:'timescaledb'}]};
  if(sql.includes("current_setting('timescaledb.license'"))return {rows:[{license:'timescale'}]};
  if(sql.includes('timescaledb_information.continuous_aggregates'))return {rows:[{}]};
  if(sql.startsWith('SELECT cursor'))return {rows:[{completedAt:new Date()}]};
  return {rows:[]};
 }},log,{});
 const refreshes=calls.map((call,index)=>call.sql.startsWith('CALL refresh')?index:-1).filter(index=>index>=0);
 const policies=calls.map((call,index)=>call.sql.includes('add_continuous_aggregate_policy')?index:-1).filter(index=>index>=0);
 const checkpoint=calls.findIndex(call=>call.params?.[0]==='post-trends-v1:aggregate-warm'&&call.sql.startsWith('INSERT'));
 assert.equal(refreshes.length,2);assert.equal(policies.length,2);
 assert.ok(Math.max(...refreshes)<checkpoint&&checkpoint<Math.min(...policies));
 assert.ok(policies.every(index=>calls[index].sql.includes('initial_start => now() + INTERVAL')));
});
test('aggregate refresh retries transient lock contention but propagates persistent locks and other errors',async()=>{
 const {refreshAggregate}=require('../scripts/database-analytics.cjs');
 const lock=Object.assign(new Error('lock unavailable'),{code:'55P03'});
 const permission=Object.assign(new Error('permission denied'),{code:'42501'});
 for(const failures of [[lock], [lock,lock], [lock,lock,lock], [permission]]){
  let attempts=0;const waits=[];const warnings=[];
  const db={query:async sql=>{assert.ok(sql.startsWith('CALL refresh_continuous_aggregate'));const error=failures[attempts++];if(error)throw error;return {rows:[]};}};
  const run=()=>refreshAggregate(db,'kwonnet_trending_hourly_v1','1 hour',{warn:message=>warnings.push(message)},async ms=>{waits.push(ms);});
  if(failures.length===3||failures[0]===permission)await assert.rejects(run(),error=>error===failures[0]);else await run();
  const retries=failures[0]===permission?0:Math.min(failures.length,2);
  assert.equal(attempts,Math.min(failures.length+1,failures[0]===permission?1:3));
  assert.deepEqual(waits,[1000,2000].slice(0,retries));assert.equal(warnings.length,retries);
 }
});
test('failed initial aggregate refresh never marks initialization complete or schedules new policies',async()=>{
 const calls=[];
 await assert.rejects(prepareAnalytics({query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT extname'))return {rows:[{extname:'timescaledb'}]};
  if(sql.includes("current_setting('timescaledb.license'"))return {rows:[{license:'timescale'}]};
  if(sql.includes('timescaledb_information.continuous_aggregates'))return {rows:[{}]};
  if(sql.startsWith('SELECT cursor'))return {rows:[{completedAt:new Date()}]};
  if(sql.startsWith('CALL refresh'))throw Object.assign(new Error('refresh failed'),{code:'42501'});
  return {rows:[]};
 }},log,{}),/refresh failed/);
 assert.ok(!calls.some(call=>call.sql.includes('add_continuous_aggregate_policy')));
 assert.ok(!calls.some(call=>call.sql.startsWith('INSERT')&&call.params?.[0]==='post-trends-v1:aggregate-warm'));
});
