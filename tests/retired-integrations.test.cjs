const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const express = require('express');
const prisma = require('@prisma/client');
const root = path.resolve(__dirname, '..');

function load(relative, resolve) {
  const file = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: resolve, console }, { filename: file });
  return exports;
}
const types = load('src/types/index.ts', () => prisma);
const payment = load('src/schema/payment.ts', name => name === 'zod/v3' ? require('zod/v3') : prisma);
const schemas = load('src/schema/index.ts', name => {
  if (name === './payment') return payment;
  if (name === '@/types') return types;
  return name === 'zod/v3' ? require('zod/v3') : prisma;
});

const allowed = { currency: 'USD', gateway: 'FLUTTERWAVE', source: 'FIAT' };

test('new payments reject retired currencies, gateways and sources', () => {
  for (const currency of ['TON', 'XTR']) {
    assert.equal(payment.paymentMethodSchema.safeParse({ ...allowed, currency }).success, false);
  }
  for (const gateway of ['STARS', 'SMART_GLOCAL', 'UNLIMINT']) {
    assert.equal(payment.paymentMethodSchema.safeParse({ ...allowed, gateway }).success, false);
  }
  assert.equal(payment.paymentMethodSchema.safeParse({ ...allowed, source: 'STARS' }).success, false);
  assert.equal(payment.paymentMethodSchema.safeParse(allowed).success, true);
  assert.equal(payment.paymentMethodSchema.safeParse({ currency: 'TZX', gateway: 'WALLET', source: 'CREDIT' }).success, true);
});

test('coin and subscription request schemas enforce retirement', () => {
  assert.equal(schemas.purchaseCoinsZodSchema.safeParse({ packageId: 'p', currency: 'TON' }).success, false);
  assert.equal(schemas.purchaseCoinsZodSchema.safeParse({ packageId: 'p', currency: 'TZX' }).success, true);
  assert.equal(schemas.purchaseCoinsZodSchema.safeParse({ packageId: 'p', currency: 'USD',
    meta: { ...allowed, amount: 10, gateway: 'STARS' } }).success, false);
  const subscription = { planId: 'p', planName: 'Premium', planType: 'MONTHLY', amount: 10,
    isRecurring: false, ...allowed };
  assert.equal(schemas.purchasePremiumZodSchema.safeParse(subscription).success, true);
  assert.equal(schemas.purchasePremiumZodSchema.safeParse({ ...subscription, currency: 'XTR' }).success, false);
  assert.equal(schemas.purchasePremiumZodSchema.safeParse({ ...subscription, source: 'STARS' }).success, false);
});

function route(relative) {
  return load(relative, name => {
    if (name === 'express') return express;
    if (name === '@/middleware') return { authMiddleware: () => (_req, _res, next) => next() };
    if (name.startsWith('@/controllers/')) return new Proxy({}, { get: () => () => {} });
    if (name === '@/sseEmitter') return { init: () => {} };
    return express.Router();
  }).default;
}

test('removed integration endpoints are not registered; wallet and fiat routes remain', () => {
  const rootRoutes = route('src/routes/v1/index.ts');
  for (const url of ['/telegram/', '/crypto/']) {
    assert.equal(rootRoutes.stack.some(layer => layer.match(url)), false);
  }
  const wallets = route('src/routes/v1/wallets/index.ts').stack.map(layer => layer.route.path);
  assert.equal(wallets.includes('/withdraw'), false);
  assert.equal(wallets.includes('/proof'), false);
  assert.equal(wallets.includes('/addresses'), false);
  for (const url of ['/', '/transfer', '/fund', '/history']) assert.equal(wallets.includes(url), true);
  for (const file of ['coins', 'subscriptions']) {
    const paths = route(`src/routes/v1/${file}/index.ts`).stack.map(layer => layer.route.path);
    assert.equal(paths.includes('/invoices'), false);
    assert.equal(paths.includes(file === 'coins' ? '/purchase' : '/premium'), true);
  }
});

test('retired service calls fail before reading or mutating wallets', async () => {
  function dependencies(name) {
    if (name === '@/schema/payment') return payment;
    if (name === '@prisma/client') return prisma;
    if (name === '@/types') return types;
    return { __esModule: true, default: new Proxy({}, { get: () => { throw new Error('Unexpected dependency access: ' + name); } }) };
  }
  const coins = load('src/services/v1/coins/index.ts', dependencies);
  const subscriptions = load('src/services/v1/subscriptions/index.ts', dependencies);
  for (const currency of ['TON', 'XTR']) {
    const item = { ...allowed, currency };
    assert.equal((await coins.purchaseCoinsWithToken(item, { id: 'u' })).status, 400);
    assert.equal((await coins.purchaseCoinsWithFlutterwave(item)).status, 400);
    assert.equal((await subscriptions.purchaseAppSubscription(item, 'u')).status, 400);
  }
});

test('archived identity and address storage is not exposed through Prisma client', () => {
  const model = name => prisma.Prisma.dmmf.datamodel.models.find(model => model.name === name);
  assert.equal(model('User').fields.some(field => field.name === 'telId'), false);
  assert.equal(model('CryptoAddress'), undefined);
  assert.equal(model('WalletAddress'), undefined);
  // Old financial records can still be interpreted.
  assert.equal(prisma.TxnCurrencyEnum.TON, 'TON');
  assert.equal(prisma.TxnCurrencyEnum.XTR, 'XTR');
});

test('package and lockfile contain no removed provider dependencies', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies), ...Object.keys(lock.packages)];
  assert.equal(names.some(name => /telegram|@ton\/|@orbs-network\/ton-access/.test(name)), false);
});

test('external payment links reject retired currencies without removing other fiat currencies', () => {
  assert.equal(payment.externalPaymentCurrencySchema.safeParse('TON').success, false);
  assert.equal(payment.externalPaymentCurrencySchema.safeParse('xtr').success, false);
  assert.equal(payment.externalPaymentCurrencySchema.safeParse('USD').success, true);
  assert.equal(payment.externalPaymentCurrencySchema.safeParse('EUR').success, true);
});
