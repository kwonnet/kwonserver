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
const benefitExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../prisma/account-level-benefits.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:benefitExports});
function load({ demo = false, failure = false, topicsOnly = false, mediaBase } = {}) {
  let transactions = 0;
  const chargeRateWrites = [];
  const benefitWrites=[];
  const tx = { $executeRaw: async () => {} };
  tx.chargeRate = { upsert: async args => {
    if (failure) throw new Error('Database failure');
    chargeRateWrites.push(args);
    return { id: 'default' };
  } };
  for (const name of ['coinPackage', 'tipPackage', 'gameMilestone', 'game', 'subscriptionPlan', 'country', 'continent']) {
    tx[name] = { count: async () => { if (failure) throw new Error('Database failure'); return 1; } };
  }
  tx.accountLevelBenefit={upsert:async args=>{benefitWrites.push(args);return args.create;}};
  tx.game.findMany = async () => [];
  tx.gameCategory = { findMany: async () => [], update: async () => { throw new Error("Unexpected update"); } };
  tx.tipPackage.upsert=async()=>({});tx.tipPackage.deleteMany=async()=>({count:0});
  const prisma = { $transaction: async callback => { transactions++; return await callback(tx); } };
  const exports = {};
  const requireMock = name => {
    if (name === './account-level-benefits') return benefitExports;
    if (name === '@prisma/adapter-pg') return {PrismaPg: class {}};
    if (name === '@prisma/client') return { ...generated, PrismaClient: function () { return prisma; } };
    if (name === '@faker-js/faker') return { faker: {} };
    if (name === 'uuid') return require('uuid');
    throw new Error('Unexpected import: ' + name);
  };
  vm.runInNewContext(output, { exports, module: { exports }, require: requireMock,
    console: { log() {}, error() {} }, process: { argv: demo ? ['node', 'seed', '--demo'] : topicsOnly ? ['node', 'seed', '--game-topics'] : [], env: { NODE_ENV: 'production', CLOUDFLARE_PUBLIC_MEDIA_URL: mediaBase } },
  });
  return { genericRooms: exports.genericGameRooms, banners: exports.syncGameBannerThumbnails, bannerUrl: exports.gameBannerThumbnail, main: exports.main, flags: exports.syncCountryGameThumbnails, flagUrl: exports.countryGameThumbnail, sync: exports.syncGameCategoryTopics, tx, benefitWrites, chargeRateWrites, transactions: () => transactions };
}
test('production seed only accesses reference tables and runs transactionally', async () => {
  const seed = load(); await seed.main(); assert.equal(seed.transactions(), 1);
  assert.deepEqual(seed.benefitWrites.map(row=>row.where.level),[0,1,2,3]);
  assert.ok(seed.benefitWrites.every(row=>Object.keys(row.update).length===0));
  assert.deepEqual(JSON.parse(JSON.stringify(seed.chargeRateWrites)), [
    { where: { id: 'default' }, update: {}, create: { id: 'default' } },
  ]);
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
  assert.equal(seed.chargeRateWrites.length, 0);
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
test('generated gift catalog uses stable IDs, thumbnails and affordable coin prices',()=>{
 const exports={};const requireMock=name=>name==='./account-level-benefits'?benefitExports:name==='@prisma/adapter-pg'?{PrismaPg:class{}}:name==='@prisma/client'?{...generated,PrismaClient:class{}}:name==='@faker-js/faker'?{faker:{}}:require(name);
 vm.runInNewContext(output,{exports,module:{exports},require:requireMock,process:{env:{},argv:[]},console});
 const gifts=JSON.parse(JSON.stringify(exports.tipPackages));assert.equal(gifts.length,50);assert.equal(new Set(gifts.map(g=>g.id)).size,50);
 for(const gift of gifts){assert.equal(gift.thumbnail,`/static/tips/${gift.id}.webp`);assert.ok(Number.isInteger(gift.price)&&gift.price>=5&&gift.price<=12500);assert.ok(gift.name);}
});

test('country flag seed uses the configured media domain and updates category rooms idempotently',async()=>{
 const seed=load({mediaBase:'https://media.example.test/'});
 assert.equal(seed.flagUrl('United Kingdom'),'https://media.example.test/static/flags/united-kingdom.webp');
 const rows=[{id:'nigeria',name:'Nigeria',thumbnail:null},{id:'new-zealand',name:'New Zealand',thumbnail:'old.webp'}];
 const rooms=[{catId:'nigeria',thumbnail:null},{catId:'nigeria',thumbnail:'old.webp'},{catId:'new-zealand',thumbnail:null}];
 seed.tx.gameCategory.findMany=async args=>{assert.equal(args.where.game.name,'Country Mania');return rows;};
 seed.tx.gameCategory.update=async({where,data})=>Object.assign(rows.find(row=>row.id===where.id),data);
 seed.tx.gameRoom={updateMany:async({where,data})=>{
  const changed=rooms.filter(room=>room.catId===where.catId&&room.thumbnail!==data.thumbnail);
  changed.forEach(room=>Object.assign(room,data));return {count:changed.length};
 }};
 assert.deepEqual(JSON.parse(JSON.stringify(await seed.flags(seed.tx))),{categoriesUpdated:2,roomsUpdated:3});
 assert.equal(rows[0].thumbnail,'https://media.example.test/static/flags/nigeria.webp');
 assert.equal(rooms[2].thumbnail,'https://media.example.test/static/flags/new-zealand.webp');
 assert.deepEqual(JSON.parse(JSON.stringify(await seed.flags(seed.tx))),{categoriesUpdated:0,roomsUpdated:0});
 assert.equal(load().flagUrl('Nigeria'),'https://media.kwonnet.com/static/flags/nigeria.webp');
});

test('all six game banners use the configured Cloudflare media domain',()=>{
 const seed=load({mediaBase:'https://media.example.test/'});
 for(const [name,file] of Object.entries({'Trivia & Quiz':'trivia-and-quiz','Acronym Arcade':'acronym-arcade','Academia Adventure':'academia-adventure','Sports & Games':'sports-and-games','MindMash':'mindmash','Country Mania':'country-mania'})){
  assert.equal(seed.bannerUrl(name),`https://media.example.test/static/games/${file}.webp`);
 }
 assert.equal(seed.bannerUrl('Unknown game'),undefined);
 assert.equal(load().bannerUrl('Country Mania'),'https://media.kwonnet.com/static/games/country-mania.webp');
});

test('fresh seed gives every non-country room a generic label without changing its category topics or room counts',async()=>{
 const seed=load();const created=[];
 seed.tx.game.count=async()=>0;
 seed.tx.game.create=async({data})=>{created.push(data);return data;};
 await seed.main();
 let categories=0,rooms=0;
 for(const game of created){
  if(game.name==='Country Mania'){
   const nigeria=game.categories.create.find(category=>category.name==='Nigeria');
   assert.ok(nigeria);assert.ok(nigeria.rooms.create.some(room=>room.name==='Abia Braves'));
   continue;
  }
  for(const category of game.categories.create){
   categories++;rooms+=category.rooms.create.length;
   if(game.name==='MindMash')assert.doesNotMatch(category.description,/Every room uses the same category content and rules/);
   assert.doesNotMatch(category.description,/Every room draws questions from the full category pool/);
   assert.ok(Array.isArray(category.topics));
   category.rooms.create.forEach((room,index)=>{
    assert.equal(room.name,`Room ${index+1}`);
    assert.match(room.description,/^Play in this room/);
    assert.doesNotMatch(room.description,/with others/i);
    assert.match(room.description,game.name==='MindMash'?/same category content and rules/:/full .* question pool/);
   });
  }
 }
 assert.equal(categories,90);assert.equal(rooms,2690);
 const football=created.find(game=>game.name==='Sports & Games').categories.create.find(category=>category.name==='Football');
 assert.ok(football.topics.includes('National Teams'));
});

test('coin package bonuses are equal across currencies and increase to 150 without repricing', async () => {
 const seed=load();let packages;
 seed.tx.coinPackage.count=async()=>0;
 seed.tx.coinPackage.createMany=async({data})=>{packages=data;return {count:data.length};};
 await seed.main();
 assert.equal(packages.length,15);
 assert.equal(packages[0].name,'Starter Pack');
 assert.equal(packages.at(-1).name,'Infinity Pack');
 packages.forEach((pack,index)=>{
  assert.equal(pack.bonus,(index+1)*10);
  assert.equal(pack.ngnBonus,pack.bonus);
 });
 assert.deepEqual([packages[0].amount,packages[0].price,packages[0].ngnPrice],[30,0.42,560]);
 assert.deepEqual([packages.at(-1).amount,packages.at(-1).price,packages.at(-1).ngnPrice],[205000,2605.3,3780000]);
});
