const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const generated = require('@prisma/client');
const source = fs.readFileSync(path.join(__dirname, '../prisma/seed.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
function load({ demo = false, failure = false } = {}) {
  let transactions = 0;
  const tx = { $executeRaw: async () => {} };
  for (const name of ['coinPackage', 'tipPackage', 'gameMilestone', 'game', 'subscriptionPlan', 'country', 'continent']) {
    tx[name] = { count: async () => { if (failure) throw new Error('Database failure'); return 1; } };
  }
  const prisma = { $transaction: async callback => { transactions++; return callback(tx); } };
  const exports = {};
  const requireMock = name => {
    if (name === '@prisma/client') return { ...generated, PrismaClient: function () { return prisma; } };
    if (name === '@faker-js/faker') return { faker: {} };
    if (name === 'uuid') return require('uuid');
    throw new Error('Unexpected import: ' + name);
  };
  vm.runInNewContext(output, { exports, module: { exports }, require: requireMock,
    console: { log() {}, error() {} }, process: { argv: demo ? ['node', 'seed', '--demo'] : [], env: { NODE_ENV: 'production' } },
  });
  return { main: exports.main, transactions: () => transactions };
}
test('production seed only accesses reference tables and runs transactionally', async () => {
  const seed = load(); await seed.main(); assert.equal(seed.transactions(), 1);
});
test('seed failures propagate to the release command', async () => {
  await assert.rejects(load({ failure: true }).main(), /Database failure/);
});
test('production rejects demo seeding before any database work', async () => {
  const seed = load({ demo: true });
  await assert.rejects(seed.main(), /Demo seeding is disabled/);
  assert.equal(seed.transactions(), 0);
});
