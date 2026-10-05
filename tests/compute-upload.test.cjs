const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-compute.yml'), 'utf8');
function step(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  assert.ok(section, name);
  return section.split('        run: |\n')[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwon-upload-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'bin')); fs.mkdirSync(path.join(root, 'deploy/compute'), { recursive: true });
  for (const name of ['deploy.sh', 'app.env', 'registry-token', 'diagnostics.py']) fs.writeFileSync(path.join(root, 'deploy/compute', name), 'test fixture');
  const remote = path.join(root, 'staging');
  fs.writeFileSync(path.join(root, 'bin/sudo'), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin/docker'), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$PRUNE_LOG\"\nexit \"${FAIL_PRUNE:-0}\"\n", { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin/gcloud'), `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\n');
if (args[1] === 'ssh') {
  if (process.env.FAIL_SSH) process.exit(12);
  const command = args.find(arg => arg.startsWith('--command=')).slice(10);
  if (command.includes('mkdir')) process.exit(spawnSync('bash', ['-ec', command]).status);
} else if (args[1] === 'scp') {
  const target = args.find(arg => arg.startsWith('test-vm:')).slice('test-vm:'.length);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) process.exit(1);
  for (const source of args.filter(arg => arg.startsWith('deploy/compute/'))) fs.cpSync(source, path.join(target, path.basename(source)), { recursive: true });
}
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, GCP_COMPUTE_ENGINE_NAME: 'test-vm', GCP_COMPUTE_ENGINE_PROJECT: 'test-project', GCP_COMPUTE_ENGINE_ZONE: 'test-zone', REMOTE_DEPLOY_DIR: remote, PRUNE_LOG: path.join(root, 'prune-calls'), CALL_LOG: path.join(root, 'calls') };
  return { root, remote, env, calls: () => fs.readFileSync(env.CALL_LOG, 'utf8').trim().split('\n').map(JSON.parse), run: extra => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step('Upload deployment over IAP')], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' }) };
}
test('workflow creates private staging first and uploads files directly into the deployment directory', t => {
  const f = fixture(t), result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(f.remote).mode & 0o777, 0o700);
  const calls = f.calls(); assert.equal(calls[0][1], 'ssh'); assert.equal(calls[1][1], 'scp');
  assert.ok(calls.every(args => args.includes('--tunnel-through-iap')));
  for (const name of ['deploy.sh', 'app.env', 'registry-token', 'diagnostics.py']) assert.ok(fs.existsSync(path.join(f.remote, name)));
  assert.equal(fs.existsSync(path.join(f.remote, 'compute')), false);
  assert.match(step('Install and deploy API and worker'), /\$REMOTE_DEPLOY_DIR\/deploy\.sh/);
  assert.match(step('Remove remote staging files'), /rm -rf '\$REMOTE_DEPLOY_DIR'/);
  assert.match(workflow, /REMOTE_DEPLOY_DIR: \/tmp\/kwonserver-deploy-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
});
test('failed SSH setup stops before file upload', t => {
  const f = fixture(t), result = f.run({ FAIL_SSH: '1' }); assert.equal(result.status, 12);
  assert.equal(f.calls().length, 1); assert.equal(fs.existsSync(f.remote), false);
});
test('existing staging directories are never reused for a new upload', t => {
  const f = fixture(t); fs.mkdirSync(f.remote);
  const result = f.run(); assert.notEqual(result.status, 0); assert.equal(f.calls().length, 1);
  assert.equal(fs.existsSync(path.join(f.remote, 'app.env')), false);
});

test('unused images are pruned before staging, without removing containers or volumes', t => {
  const f = fixture(t), result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.env.PRUNE_LOG, 'utf8').trim(), 'image prune --all --force');
});
test('cleanup failure prevents upload to a potentially full disk', t => {
  const f = fixture(t), result = f.run({ FAIL_PRUNE: '23' });
  assert.equal(result.status, 23); assert.equal(f.calls().length, 1);
  assert.equal(fs.existsSync(f.remote), false);
});
