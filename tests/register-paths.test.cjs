const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

test('compiled aliases do not shadow bare dependency imports', () => {
  const root = path.resolve(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kwonserver-alias-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts'));
    fs.mkdirSync(path.join(fixture, 'dist/redis'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'dist/redis/index.js'), 'module.exports = {};');
    fs.copyFileSync(path.join(root, 'scripts/register-paths.cjs'), path.join(fixture, 'scripts/register-paths.cjs'));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
    const result = JSON.parse(execFileSync(process.execPath, [
      '-r', './scripts/register-paths.cjs', '-e',
      `console.log(JSON.stringify({ local: require.resolve('@/redis'), dependency: require.resolve('redis'), createClient: typeof require('redis').createClient }))`,
    ], { cwd: fixture, encoding: 'utf8' }));
    assert.equal(result.local, path.join(fs.realpathSync(fixture), 'dist/redis/index.js'));
    assert.match(result.dependency, /node_modules[/\\]redis[/\\]/);
    assert.equal(result.createClient, 'function');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
