import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/db';
import {logServiceError} from '@/logger/events';

export class WalletError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function cents(value: number | Prisma.Decimal, allowZero = false): number {
  if (typeof value !== 'number' && !Prisma.Decimal.isDecimal(value)) throw new WalletError('Invalid amount');
  const minor = new Prisma.Decimal(value).mul(100);
  if (!minor.isFinite() || !minor.isInteger() || minor.gt(1000000000000) || minor.lt(allowZero ? 0 : 1)) {
    throw new WalletError('Amount must be finite, non-negative and have at most two decimal places');
  }
  return minor.toNumber();
}
// Bounded cents are safe integers; conversion is only for API/UI boundaries.
export function moneyNumber(value: number | Prisma.Decimal): number { return cents(value, true) / 100; }
export function moneyJson(value: any): any {
  if (Prisma.Decimal.isDecimal(value)) return moneyNumber(value);
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(moneyJson);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,moneyJson(item)]));
}
export function requestKey(value: unknown): string {
  if (value === undefined) throw new WalletError('Idempotency-Key is required', 400);
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) throw new WalletError('Invalid Idempotency-Key');
  return value;
}
export async function lockWallets(tx: Prisma.TransactionClient, ids: string[]) {
  for (const userId of [...new Set(ids)].sort()) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Wallet" WHERE user_id = ${userId} FOR UPDATE`;
    if (!rows.length) throw new WalletError('Wallet not found', 404);
  }
}
// Only database work belongs in callbacks: conflicts retry, external side effects must not.
export async function walletOperation<T>(scope: string, key: string | undefined, payload: unknown,
  userIds: string[], work: (tx: Prisma.TransactionClient) => Promise<T>, db: PrismaClient = prisma): Promise<T> {
  const id = createHash('sha256').update(`${scope}:${key ?? randomUUID()}`).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
        const previous = await tx.walletOperation.findUnique({ where: { id } });
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new WalletError('Idempotency key already used for a different request', 409);
          return previous.result as T;
        }
        await lockWallets(tx, userIds);
        const result = await work(tx);
        await tx.walletOperation.create({ data: { id, scope, fingerprint, result: result == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(moneyJson(result))) } });
        return moneyJson(result) as T;
      }, { maxWait: 10000, timeout: 15000 });
    } catch (error: any) {
    logServiceError("walletLedger/index", "walletOperation", error);

      if (error.code !== 'P2034' || attempt >= 2) throw error;
    }
  }
}
export function walletFailure(error: unknown) {
  const status = error instanceof WalletError ? error.status : 500;
  const message = error instanceof WalletError ? error.message : 'Wallet operation failed; retry with the same Idempotency-Key';
  return { status, data: message, message };
}
