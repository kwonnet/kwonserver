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
function load({ demo = false, failure = false, topicsOnly = false } = {}) {
  let transactions = 0;
  const tx = { $executeRaw: async () => {} };
  for (const name of ['coinPackage', 'tipPackage', 'gameMilestone', 'game', 'subscriptionPlan', 'country', 'continent']) {
    tx[name] = { count: async () => { if (failure) throw new Error('Database failure'); return 1; } };
  }
  tx.gameCategory = { findMany: async () => [], update: async () => { throw new Error("Unexpected update"); } };
  const prisma = { $transaction: async callback => { transactions++; return callback(tx); } };
  const exports = {};
  const requireMock = name => {
    if (name === '@prisma/client') return { ...generated, PrismaClient: function () { return prisma; } };
    if (name === '@faker-js/faker') return { faker: {} };
    if (name === 'uuid') return require('uuid');
    throw new Error('Unexpected import: ' + name);
  };
  vm.runInNewContext(output, { exports, module: { exports }, require: requireMock,
    console: { log() {}, error() {} }, process: { argv: demo ? ['node', 'seed', '--demo'] : topicsOnly ? ['node', 'seed', '--game-topics'] : [], env: { NODE_ENV: 'production' } },
  });
  return { main: exports.main, sync: exports.syncGameCategoryTopics, tx, transactions: () => transactions };
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

test('topic-only mode never initializes unrelated reference tables', async () => {
  const seed = load({ topicsOnly: true, failure: true });
  await seed.main(); assert.equal(seed.transactions(), 1);
});
test('topic sync backfills by game/category, preserves existing values and is repeatable', async () => {
  const seed = load();
  const rows = [
    { id: 'a', name: 'Science', game: { name: 'Trivia' }, topics: [] },
    { id: 'b', name: 'Science', game: { name: 'Words' }, topics: ['Existing'] },
    { id: 'c', name: 'Empty', game: { name: 'Trivia' }, topics: ['Keep me'] },
  ];
  const definitions = [
    { name: 'Trivia', categories: [{ name: 'Science', topics: [' Physics ', 'Physics', '', 'Biology'] }, { name: 'Empty', topics: [] }, { name: 'Missing', topics: ['Topic'] }] },
    { name: 'Words', categories: [{ name: 'Science', topics: ['Existing', 'Chemistry'] }] },
  ];
  const writes = [];
  const tx = { gameCategory: {
    findMany: async () => rows,
    update: async ({ where, data }) => { writes.push(where.id); rows.find(row => row.id === where.id).topics = [...data.topics]; },
  } };
  const first = await seed.sync(tx, definitions);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { updated: 2, added: 3, missingCategories: 1 });
  assert.deepEqual(rows.map(row => row.topics), [['Physics', 'Biology'], ['Existing', 'Chemistry'], ['Keep me']]);
  const second = await seed.sync(tx, definitions);
  assert.equal(second.updated, 0); assert.equal(second.added, 0); assert.deepEqual(writes, ['a', 'b']);
});
test('topic sync propagates write errors so the seed transaction rolls back', async () => {
  const seed = load();
  await assert.rejects(seed.sync({ gameCategory: {
    findMany: async () => [{ id: 'c', name: 'Category', game: { name: 'Game' }, topics: [] }],
    update: async () => { throw new Error('Write failed'); },
  } }, [{ name: 'Game', categories: [{ name: 'Category', topics: ['Topic'] }] }]), /Write failed/);
});
