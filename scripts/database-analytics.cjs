const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');
require('dotenv').config({ quiet: true });
const LOCK = 'kwonserver:database-analytics';
const VERSION = 'post-trends-v1';
function mode(env = process.env) {
  const value = env.TIMESCALEDB_MODE || 'auto';
  if (!['auto', 'required', 'off'].includes(value)) throw new Error('TIMESCALEDB_MODE must be auto, required, or off');
  return value;
}
async function enableExtensions(db, log = console, env = process.env) {
  const selected = mode(env);
  const { rows } = await db.query("SELECT name, installed_version FROM pg_available_extensions WHERE name IN ('vector', 'timescaledb')");
  if (!rows.some(row => row.name === 'vector')) throw new Error('Database host does not provide pgvector. Install vector on PostgreSQL or use a provider that offers it.');
  await db.query('CREATE EXTENSION IF NOT EXISTS vector');
  const available = rows.some(row => row.name === 'timescaledb');
  if (selected === 'required' && !available) throw new Error('Database host does not provide TimescaleDB. Application deployment cannot install PostgreSQL server packages.');
  if (available && selected !== 'off') {
    await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    log.info('Database extensions: vector and timescaledb enabled');
    return true;
  }
  log.warn('Database extensions: vector enabled; TimescaleDB unavailable/disabled. Trending uses PostgreSQL live views.');
  return false;
}
async function prepareAnalytics(db, log = console, env = process.env) {
  const { rows } = await db.query("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'");
  const timescale = rows.length > 0 && mode(env) !== 'off';
  if (!timescale && mode(env) === 'required') throw new Error('Database host does not provide an enabled TimescaleDB extension. Run db:extensions first.');
  let continuous = false;
  const aggregateNames = [];
  if (timescale) {
    // All existing unique keys include createdAt, as Timescale requires.
    await db.query(`SELECT create_hypertable('"PostTrendingEvent"', 'createdAt', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE, migrate_data => TRUE)`);
    const license = await db.query("SELECT current_setting('timescaledb.license', true) AS license");
    continuous = license.rows[0]?.license === 'timescale';
  }
  for (const [period, offset, interval] of [['hour', '1 hour', '15 minutes'], ['day', '1 day', '1 hour']]) {
    const name = period === 'hour' ? 'kwonnet_trending_hourly_v1' : 'kwonnet_trending_daily_v1';
    const bucket = continuous ? `time_bucket('${period === 'hour' ? '1 hour' : '1 day'}', "createdAt")` : `date_trunc('${period}', "createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    const existing = await db.query('SELECT relkind FROM pg_class WHERE oid = to_regclass($1)', [name]);
    // Versioned names avoid destroying manually created analytics. No CASCADE.
    if (!existing.rows.length) await db.query(`CREATE ${continuous ? 'MATERIALIZED ' : ''}VIEW ${name}
      ${continuous ? 'WITH (timescaledb.continuous, timescaledb.materialized_only=false)' : ''} AS
      SELECT ${bucket} AS bucket, keyword, "countryId" AS country,
        count(*) AS mentions, count(DISTINCT "postId") AS unique_posts, count(DISTINCT "authorId") AS unique_users
      FROM "PostTrendingEvent" GROUP BY 1, 2, 3 ${continuous ? 'WITH NO DATA' : ''}`);
    // Timescale exposes continuous aggregates as ordinary views; relkind is not
    // enough to distinguish them from the Apache/PostgreSQL fallback views.
    const aggregate = continuous && (await db.query(
      'SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_schema = current_schema() AND view_name = $1', [name],
    )).rows.length > 0;
    if (aggregate) {
      aggregateNames.push([name, offset, interval]);
    }
  }
  log.info(`Trending analytics: ${timescale ? 'TimescaleDB hypertable' : 'PostgreSQL table'}; ${aggregateNames.length ? 'continuous aggregates' : 'live views'}`);
  await backfill(db, log);
  if (aggregateNames.length) {
    const warm = VERSION + ':aggregate-warm';
    const state = await db.query('SELECT 1 FROM "KwonnetAnalyticsSetup" WHERE name = $1 AND "completedAt" IS NOT NULL', [warm]);
    if (!state.rows.length) {
      for (const [name, offset] of aggregateNames) {
        await refreshAggregate(db, name, offset, log);
      }
      await db.query('INSERT INTO "KwonnetAnalyticsSetup" (name, "completedAt") VALUES ($1, now()) ON CONFLICT (name) DO UPDATE SET "completedAt" = now()', [warm]);
      log.info('Trending continuous aggregates: initial 30-day refresh complete');
    }
    // A new policy can run immediately. Do not let it compete with backfill or
    // initial refresh. Existing policies retain their original schedule.
    for (const [name, offset, interval] of aggregateNames) {
      await db.query(`SELECT add_continuous_aggregate_policy('${name}', start_offset => INTERVAL '3 months',
        end_offset => INTERVAL '${offset}', schedule_interval => INTERVAL '${interval}',
        initial_start => now() + INTERVAL '${interval}', if_not_exists => TRUE)`);
    }
  }
}
async function refreshAggregate(db, name, offset, log = console, wait = delay) {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.query(`CALL refresh_continuous_aggregate('${name}', now() - INTERVAL '30 days', now() - INTERVAL '${offset}')`);
      return;
    } catch (error) {
      // No explicit transaction surrounds the CALL; the connection stays usable
      // after a lock timeout, and refreshing the same window is safe to repeat.
      // A pre-existing background policy may still be finishing on a re-release.
      if (error.code !== '55P03' || attempt >= 3) throw error;
      log.warn(`Trending aggregate ${name}: lock contention; retry ${attempt}/2`);
      await wait(attempt * 1000);
    }
  }
}
async function backfill(db, log = console) {
  await db.query('INSERT INTO "KwonnetAnalyticsSetup" (name) VALUES ($1) ON CONFLICT DO NOTHING', [VERSION]);
  const state = (await db.query('SELECT cursor, "completedAt" FROM "KwonnetAnalyticsSetup" WHERE name = $1', [VERSION])).rows[0];
  if (state.completedAt) { log.info('Trending backfill: already complete; new posts and edits are maintained by database triggers'); return; }
  let cursor = state.cursor;
  for (;;) {
    await db.query('BEGIN');
    try {
      const { rows } = await db.query('SELECT id FROM "Post" WHERE ($1::text IS NULL OR id > $1) ORDER BY id LIMIT 100 FOR UPDATE', [cursor]);
      if (rows.length) await db.query('SELECT kwonnet_sync_post_trends(id) FROM unnest($1::text[]) AS posts(id)', [rows.map(row => row.id)]);
      if (rows.length) cursor = rows[rows.length - 1].id;
      await db.query('UPDATE "KwonnetAnalyticsSetup" SET cursor = $2, "completedAt" = CASE WHEN $3 THEN now() ELSE NULL END, "updatedAt" = now() WHERE name = $1', [VERSION, cursor, rows.length === 0]);
      await db.query('COMMIT');
      if (!rows.length) break;
      log.info(`Trending backfill: indexed batch of ${rows.length} posts`);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
  log.info('Trending backfill: complete');
}
function releaseUrl(env = process.env) {
  const value = env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL (or DATABASE_MIGRATION_URL) is required');
  const url = new URL(value);
  // Neon documents the pooler suffix as the direct endpoint for the same DB.
  // Keep application pooling unchanged; only the release uses this connection.
  if (url.hostname.endsWith('.neon.tech') && url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
    url.searchParams.delete('pgbouncer');
    return url.toString();
  }
  return value;
}
async function assertRollingMigrations(db, directory = path.resolve(__dirname, '../prisma/migrations')) {
  const exists = await db.query(`SELECT to_regclass('public._prisma_migrations') AS name`);
  if (!exists.rows[0]?.name) return; // First database installation has no old schema clients.
  const result = await db.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  const applied = new Set(result.rows.map(row => row.migration_name));
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name, 'migration.sql');
    if (applied.has(name) || !fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\bDROP\s+(?:TABLE|COLUMN|TYPE|SCHEMA|VIEW|MATERIALIZED)\b|\bTRUNCATE\b|\bRENAME\b|\bALTER\s+COLUMN\s+[^;]*?\b(?:TYPE|SET\s+NOT\s+NULL)\b|\bADD\s+(?:COLUMN\s+)?[^;,]*?\bNOT\s+NULL\b(?![^;,]*?\bDEFAULT\b)/i.test(sql))
      throw new Error('Rolling deployment blocked: migration '+name+' may break the running release. Use an expand/contract migration before deploying.');
  }
}
async function main(command = process.argv[2]) {
  mode();
  const url = releaseUrl();
  if (new URL(url).searchParams.get('schema') && new URL(url).searchParams.get('schema') !== 'public') throw new Error('Analytics setup currently requires the public database schema');
  const db = new Client({ connectionString: url, connectionTimeoutMillis: 10000, query_timeout: 120000, application_name: 'kwonserver-db-analytics' });
  await db.connect();
  try {
    // Direct/session connection required: pooler transaction mode cannot retain this lock.
    await db.query("SET statement_timeout = '120s'");
    await db.query("SET lock_timeout = '30s'");
    await db.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK]);
    if (command === 'deploy') {
      if (process.env.ROLLING_DEPLOYMENT === 'true') await assertRollingMigrations(db);
      await enableExtensions(db);
      const prismaCli = require.resolve('prisma/build/index.js');
      for (const args of [['migrate', 'deploy'], ['db', 'seed']]) {
        const result = spawnSync(process.execPath, [prismaCli, ...args], {
          cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url, DATABASE_MIGRATION_URL: url }, stdio: 'inherit',
        });
        if (result.error || result.status !== 0) throw new Error('Database release migration/seed failed');
      }
      await prepareAnalytics(db);
    }
    else if (command === 'extensions') await enableExtensions(db);
    else if (command === 'setup') await prepareAnalytics(db);
    else throw new Error('Use deploy, extensions or setup');
  } finally { await db.end(); }
}
module.exports = { mode, enableExtensions, prepareAnalytics, refreshAggregate, backfill, releaseUrl, assertRollingMigrations, main };
if (require.main === module) main().catch(error => {
  // PostgreSQL messages may contain URL/user data; expose only known safe setup errors.
  if (error.code === '55P03') {
    console.error('Database analytics setup failed (55P03): timed out waiting for a database lock. Check concurrent migrations, analytics refreshes and blocking transactions. The release has not completed.');
    process.exitCode = 1;
    return;
  }
  const safe = /^(TIMESCALEDB_MODE|Database host|DATABASE_URL|Analytics setup|Use extensions|Rolling deployment blocked)/.test(error.message);
  console.error(safe ? error.message : `Database analytics setup failed (${error.code || 'connection/query failure'}). Check extension privileges, shared_preload_libraries and a direct database connection. The release has not completed; the previous release remains serving during rolling deployment. Repair the database release before retrying.`);
  process.exitCode = 1;
});
