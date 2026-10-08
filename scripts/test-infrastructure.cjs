const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@127.0.0.1:15432/kwonserver_test', REDIS_URL: 'redis://127.0.0.1:16379' };
// Never allow a developer's production release URL to escape the disposable DB.
env.DATABASE_MIGRATION_URL = env.DATABASE_URL;
env.TIMESCALEDB_MODE = 'auto';
const compose = ['compose', '-f', 'tests/docker-compose.yml'];
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
let started = false;
try {
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  started = true;
  run('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '120']);
  // Exercise the actual deployment migration history against a fresh database.
  run(process.execPath, ['scripts/database-analytics.cjs', 'extensions']);
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  run(process.execPath, ['scripts/database-analytics.cjs', 'setup']);
  const args=process.argv.slice(2);const load=args[0]==='--messaging-load';if(load)args.shift();
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', load?'vitest.messaging-load.config.mts':'vitest.integration.config.mts', ...args]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    const result = spawnSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { cwd: root, env, stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = 1;
  }
}
