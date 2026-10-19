import { Prisma } from "@prisma/client";
import prisma from "@/db";
import redis from "@/redis";
import { walletOperation, WalletError } from "@/services/walletLedger";

export async function getGameEnergy(playerId: string, catId: string) {
  return await prisma.gameEnergy.upsert({
    where: { playerId_catId: { playerId, catId } },
    create: { playerId, catId, amount: 2500, gauge: 50, turbo: 50 },
    update: {},
  });
}
/** Refill is an idempotent server action, never a replacement client balance. */
export async function refillGameEnergy(
  playerId: string,
  catId: string,
  field: "gauge" | "turbo",
  operationId: string,
) {
  if (
    !["gauge", "turbo"].includes(field) ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)
  )
    throw new WalletError("Invalid energy refill");
  await getGameEnergy(playerId, catId);
  await walletOperation(
    "game-energy-refill",
    `${playerId}:${catId}:${operationId}`,
    { field },
    [],
    async (tx) => {
      const [row] = await tx.$queryRaw<
        { amount: number; gauge: number; turbo: number }[]
      >`SELECT amount,gauge,turbo FROM "GameEnergy" WHERE "playerId"=${playerId} AND "cat_id"=${catId} FOR UPDATE`;
      const delta = Math.max(
        0,
        Math.min(10, 100 - row[field], Math.floor(row.amount / 10)),
      );
      if (delta === 0)
        throw new WalletError("Energy balance cannot refill this meter");
      await tx.gameEnergy.update({
        where: { playerId_catId: { playerId, catId } },
        data: {
          amount: { decrement: delta * 10 },
          [field]: { increment: delta },
        },
      });
      return { refilled: delta };
    },
  );
  await redis.del(`player:${playerId}:cat:${catId}:energy`);
  return await getGameEnergy(playerId, catId);
}
