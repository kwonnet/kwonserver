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
