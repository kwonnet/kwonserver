#!/usr/bin/env node
// Read-only export. Run while ALL wallet writers are paused for a consistent cutover report.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('redis');
const { open } = require('node:fs/promises');

async function main() {
  const output = process.argv[2];
  if (!output || !process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error('Usage: npm run wallet:audit -- /secure/path/report.ndjson (DATABASE_URL and REDIS_URL required)');
  const file = await open(output, 'wx', 0o600); // Never overwrite an earlier reconciliation report.
  const db = new PrismaClient({adapter: new (require('@prisma/adapter-pg').PrismaPg)({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000})});
  const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false } });
  redis.on('error', () => {});
  const totals = { wallets: 0, differences: 0, invalid: 0, legacyTransactions: 0, pendingTips: 0 };
  const emit = data => file.write(JSON.stringify(data) + '\n');
  try {
    await redis.connect();
    await emit({ type: 'header', createdAt: new Date().toISOString(), warning: 'Contains private balances. Differences are not authorization to overwrite either store.' });
    let cursor;
    for (;;) {
      const rows = await db.wallet.findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) break;
      for (const wallet of rows) {
        const cached = await redis.hGetAll(`user:${wallet.userId}:wallet`);
        const hasCache = Object.keys(cached).length > 0;
        const current = { coins: Number(wallet.coins), bonus: Number(wallet.bonus), credit: Number(wallet.credit) };
        const old = { coins: Number(cached.amount ?? cached.coins), bonus: Number(cached.bonus), credit: Number(cached.credit) };
        const invalid = Object.values(current).some(value => !Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001);
        const differs = hasCache && Object.keys(current).some(key => !Number.isFinite(old[key]) || Math.abs(current[key] - old[key]) > 0.000001);
        const pending = await redis.zCard(`user:${wallet.userId}:transactions`);
        totals.wallets++; totals.differences += Number(differs); totals.invalid += Number(invalid); totals.legacyTransactions += pending;
        await emit({ type: 'wallet', walletId: wallet.id, userId: wallet.userId, postgres: current, redis: hasCache ? cached : null, invalid, differs, legacyTransactionCount: pending });
      }
      cursor = rows[rows.length - 1].id;
    }
    // Export exact legacy members including orphaned users, without deleting anything.
    for await (const key of redis.scanIterator({ MATCH: 'user:*:transactions', COUNT: 100 })) {
      for (let offset = 0;; offset += 200) {
        const records = await redis.zRangeWithScores(key, offset, offset + 199);
        if (!records.length) break;
        for (const record of records) await emit({ type: 'legacy-transaction', key, score: record.score, value: record.value });
      }
    }
    let tipCursor;
    for (;;) {
      const tips = await db.rewardTip.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: 100, ...(tipCursor ? { cursor: { id: tipCursor }, skip: 1 } : {}) });
      if (!tips.length) break;
      for (const tip of tips) { totals.pendingTips++; await emit({ type: 'pending-tip', ...tip }); }
      tipCursor = tips[tips.length - 1].id;
    }
    await emit({ type: 'summary', ...totals });
    console.log(JSON.stringify({ output, ...totals }));
  } finally {
    if (redis.isOpen) await redis.quit();
    await db.$disconnect(); await file.close();
  }
}
main().catch(() => { console.error('Wallet audit failed; report may be incomplete. Check connectivity and output permissions. No balances were modified.'); process.exitCode = 1; });
