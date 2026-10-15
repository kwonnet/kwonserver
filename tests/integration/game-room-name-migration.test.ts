import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';

it('migrates stored room names and enforces generic names on SQL writes while preserving country rooms', async () => {
  const client = new Client({connectionString: process.env.DATABASE_URL});
  await client.connect();
  try {
    await client.query('CREATE SCHEMA game_room_name_migration_probe');
    await client.query('SET search_path TO game_room_name_migration_probe');
    await client.query(`
      CREATE TABLE "Game" (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE "GameCategory" (id text PRIMARY KEY, "gameId" text NOT NULL REFERENCES "Game"(id), name text NOT NULL);
      CREATE TABLE "GameRoom" (id text PRIMARY KEY, cat_id text NOT NULL REFERENCES "GameCategory"(id), name text NOT NULL,
        description text NOT NULL DEFAULT 'Old description', "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT '2020-01-01');
      INSERT INTO "Game" VALUES ('sports','Sports & Games'), ('trivia','Trivia & Quiz'), ('country','Country Mania');
      INSERT INTO "GameCategory" VALUES ('football','sports','Football'), ('quest','trivia','Themed Quest'), ('nigeria','country','Nigeria');
      INSERT INTO "GameRoom" (id,cat_id,name,"createdAt") VALUES
        ('a','football','Football Room 01','2020-01-01'), ('b','football','WorldCup','2020-01-01'),
        ('c','quest','Themed Quest Room 01','2020-01-01'), ('d','nigeria','Lagos Stars','2020-01-01');
    `);
    const countryBefore = (await client.query('SELECT * FROM "GameRoom" WHERE id=$1', ['d'])).rows[0];
    const sql = readFileSync('prisma/migrations/20261015190000_generic_game_room_names/migration.sql','utf8');
    await client.query(sql);
    expect((await client.query('SELECT id,name FROM "GameRoom" ORDER BY id')).rows).toEqual([
      {id:'a',name:'Room 1'}, {id:'b',name:'Room 2'}, {id:'c',name:'Room 1'}, {id:'d',name:'Lagos Stars'},
    ]);
    expect((await client.query('SELECT * FROM "GameRoom" WHERE id=$1', ['d'])).rows[0]).toEqual(countryBefore);
    expect((await client.query('SELECT description FROM "GameRoom" WHERE id=$1', ['a'])).rows[0].description).toBe('Play in this room using the full Football question pool. All rooms cover the same category topics.');
    expect((await client.query(`INSERT INTO "GameRoom" (id,cat_id,name) VALUES ('e','football','Football Room 03') RETURNING name`)).rows[0].name).toBe('Room 3');
    expect((await client.query(`UPDATE "GameRoom" SET name='Football Room 99' WHERE id='a' RETURNING name`)).rows[0].name).toBe('Room 1');
    expect((await client.query(`INSERT INTO "GameRoom" (id,cat_id,name) VALUES ('f','nigeria','Abuja Stars') RETURNING name`)).rows[0].name).toBe('Abuja Stars');
    await client.query(sql);
    expect((await client.query('SELECT id,name FROM "GameRoom" WHERE cat_id=$1 ORDER BY id', ['football'])).rows).toEqual([
      {id:'a',name:'Room 1'}, {id:'b',name:'Room 2'}, {id:'e',name:'Room 3'},
    ]);
    const writers = [new Client({connectionString: process.env.DATABASE_URL}), new Client({connectionString: process.env.DATABASE_URL})];
    await Promise.all(writers.map(writer => writer.connect()));
    try {
      await Promise.all(writers.map(writer => writer.query('SET search_path TO game_room_name_migration_probe')));
      const inserted = await Promise.all(writers.map((writer, index) => writer.query(
        'INSERT INTO "GameRoom" (id,cat_id,name) VALUES ($1,$2,$3) RETURNING name',
        [`concurrent-${index}`, 'football', 'Football Arena'],
      )));
      expect(inserted.map(result => result.rows[0].name).sort()).toEqual(['Room 4', 'Room 5']);
    } finally {
      await Promise.all(writers.map(writer => writer.end()));
    }
  } finally {
    await client.query('ROLLBACK');
    await client.query('DROP SCHEMA IF EXISTS game_room_name_migration_probe CASCADE');
    await client.end();
  }
});
