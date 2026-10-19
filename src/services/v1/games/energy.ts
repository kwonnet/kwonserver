import { GameEnergy, Prisma } from "@prisma/client";
import prisma from "@/db";
import redis from "@/redis";
import { randomInt, randomUUID } from "node:crypto";
import { WalletError } from "@/services/walletLedger";
const dirtyKey = 'game:energy:dirty';
const energyKey = (playerId: string, catId: string) => `player:${playerId}:cat:${catId}:energy`;
function decode(row: Record<string, string>): GameEnergy {
  return { ...row, amount: Number(row.amount), gauge: Number(row.gauge), turbo: Number(row.turbo), version: Number(row.version), createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) } as GameEnergy;
}
// Initialize once; a concurrent join must never replace a refill or round update.
export async function getGameEnergy(playerId: string, catId: string): Promise<GameEnergy> {
  const key = energyKey(playerId, catId);
  const cached = await redis.hGetAll(key);
  if (cached.version !== undefined)
    return decode(cached);
  await prisma.$executeRaw `INSERT INTO "GameEnergy" (id,"playerId",cat_id,amount,gauge,turbo,"updatedAt") VALUES (${randomUUID()},${playerId},${catId},2500,50,50,NOW()) ON CONFLICT ("playerId",cat_id) DO NOTHING`;
  const row = await prisma.gameEnergy.findUniqueOrThrow({ where: { playerId_catId: { playerId, catId } } });
  await redis.eval(`if not redis.call('HGET',KEYS[1],'version') then
    local row=cjson.decode(ARGV[1]);for k,v in pairs(row) do redis.call('HSET',KEYS[1],k,tostring(v)) end
    redis.call('PERSIST',KEYS[1]) end;return 1`, { keys: [key], arguments: [JSON.stringify(row)] });
  return decode(await redis.hGetAll(key));
}
const mutateScript = `
local previous=redis.call('GET',KEYS[3])
if previous then
 if previous~=ARGV[1] then return 'conflict' end
 return 'ok'
end
if not redis.call('HGET',KEYS[1],'version') then return 'missing' end
local amount=tonumber(redis.call('HGET',KEYS[1],'amount'))
local gauge=tonumber(redis.call('HGET',KEYS[1],'gauge'))
local turbo=tonumber(redis.call('HGET',KEYS[1],'turbo'))
local dirtyType=redis.call('TYPE',KEYS[2]).ok
if dirtyType~='none' and dirtyType~='zset' then return redis.error_reply('Invalid energy outbox') end
if ARGV[2]=='round' then
 amount=amount+tonumber(ARGV[3]);gauge=math.max(0,gauge-tonumber(ARGV[4]));turbo=math.max(0,turbo-tonumber(ARGV[5]))
else
 local value=gauge;if ARGV[2]=='turbo' then value=turbo end
 local delta=math.max(0,math.min(10,100-value,math.floor(amount/10)))
 if delta==0 then return 'empty' end
 amount=amount-delta*10
 if ARGV[2]=='turbo' then turbo=turbo+delta else gauge=gauge+delta end
end
redis.call('HSET',KEYS[1],'amount',amount,'gauge',gauge,'turbo',turbo,'updatedAt',ARGV[6])
redis.call('HINCRBY',KEYS[1],'version',1)
redis.call('ZADD',KEYS[2],'NX',ARGV[7],KEYS[1])
-- Receipts remain with live energy; retries cannot charge twice after persistence.
redis.call('SET',KEYS[3],ARGV[1]);return 'ok'`;
async function mutate(playerId: string, catId: string, receipt: string, fingerprint: string, field: string, changes: number[]) {
  await getGameEnergy(playerId, catId);
  const key = energyKey(playerId, catId);
  const result = await redis.eval(mutateScript, { keys: [key, dirtyKey, receipt], arguments: [fingerprint, field, ...changes.map(String), new Date().toISOString(), String(Date.now())] });
  if (result !== 'ok')
    throw new WalletError(result === 'conflict' ? 'Energy operation already used with different parameters' : result === 'empty' ? 'Energy balance cannot refill this meter' : 'Energy cache unavailable; rejoin the room');
  return decode(await redis.hGetAll(key));
}
/** Redis serialization gives concurrent refills one server-computed charge. */
export async function refillGameEnergy(playerId: string, catId: string, field: 'gauge' | 'turbo', operationId: string) {
  if (!['gauge', 'turbo'].includes(field) || !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId))
    throw new WalletError('Invalid energy refill');
  return mutate(playerId, catId, `game:energy:refill:${playerId}:${catId}:${operationId}`, field, field, [0, 0, 0]);
}
/** Same live authority for round consumption and refill, including across modes. */
export async function applyRoundGameEnergy(playerId: string, catId: string, roundId: string) {
  return mutate(playerId, catId, `game:energy:round:${roundId}:${playerId}`, roundId, 'round', [randomInt(150, 251), randomInt(2, 5), randomInt(2, 5)]);
}
/** Coalesced snapshots, conditional SQL versions and conditional acknowledgement. */
export async function syncGameEnergy(limit = 1000, players?: {
  playerId: string;
  catId: string;
}[]) {
  const keys = players ? players.map(p => energyKey(p.playerId, p.catId)) : await redis.zRange(dirtyKey, 0, limit - 1);
  for (let offset = 0; offset < keys.length; offset += 100) {
    const batch = keys.slice(offset, offset + 100);
    const snapshots = await Promise.all(batch.map(key => redis.hGetAll(key)));
    if (snapshots.some(row => row.version === undefined))
      throw new Error('Pending energy snapshot missing');
    await prisma.$executeRaw(Prisma.sql `UPDATE "GameEnergy" e SET amount=v.amount,gauge=v.gauge,turbo=v.turbo,version=v.version,"updatedAt"=v.updated
      FROM (VALUES ${Prisma.join(snapshots.map(row => Prisma.sql `(${row.playerId}::text,${row.catId}::text,${Number(row.amount)}::int,${Number(row.gauge)}::int,${Number(row.turbo)}::int,${Number(row.version)}::int,${new Date(row.updatedAt)}::timestamp)`))}) v(player,cat,amount,gauge,turbo,version,updated)
      WHERE e."playerId"=v.player AND e.cat_id=v.cat AND e.version<v.version`);
    await redis.eval(`for i=1,#ARGV do if redis.call('HGET',KEYS[i],'version')==ARGV[i] then redis.call('ZREM',KEYS[#KEYS],KEYS[i]) end end;return 1`, { keys: [...batch, dirtyKey], arguments: snapshots.map(row => row.version) });
  }
  return keys.length;
}
