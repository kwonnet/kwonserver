import { GameDelivery, gameActionId } from './gameDelivery';
import { GameActionEnum } from '@/types';
import { TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum } from '@prisma/client';
import { randomUUID } from 'crypto';
import { cents, WalletError, walletOperation } from './index';

export async function chargeGameAction(params: { playerId: string; action: GameActionEnum; [key: string]: any }, high: number, fallback: number, delivery?: GameDelivery) {
  const key = params.operationId as string | undefined;
  if (delivery && !key) throw new WalletError('Game action identity is required');
  return walletOperation(`game:${params.playerId}`, key, params, [params.playerId], async tx => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.playerId } });
    if (wallet.isLocked) throw new WalletError('Wallet is locked');
    const bonus = cents(wallet.bonus, true), coins = cents(wallet.coins, true);
    const charge = bonus >= cents(high) ? cents(high) : cents(fallback);
    if (bonus + coins < charge) throw new WalletError('Insufficient balance');
    const bonusDebit = Math.min(bonus, charge), coinDebit = charge - bonusDebit;
    await tx.wallet.update({ where: { id: wallet.id }, data: { coins: (coins - coinDebit) / 100, bonus: (bonus - bonusDebit) / 100 } });
    const actionId = delivery ? gameActionId(params.playerId,key!) : undefined;
    if (delivery) await tx.gameWalletAction.create({data:{id:actionId!,userId:params.playerId,roomId:delivery.roomId,roundId:delivery.roundId,
      kind:delivery.kind,payload:delivery.payload,deductedCoins:coinDebit/100,deductedBonus:bonusDebit/100}});
    await tx.transaction.create({ data: {
      userId: params.playerId, senderId: params.playerId, walletId: wallet.id,
      txnRef: randomUUID(), amount: charge / 100, currency: TxnCurrencyEnum.COINS,
      source: bonusDebit === 0 ? TxnSourceEnum.COINS : coinDebit === 0 ? TxnSourceEnum.BONUS : TxnSourceEnum.COINS_BONUS,
      category: TxnCategoryEnum.GAME_DEDUCTION, gateway: TxnGatewayEnum.WALLET,
      type: TxnTypeEnum.DEBIT, status: TxnStatusEnum.COMPLETED,
      description: 'Game action charge', metadata: { ...params, gameActionId:actionId, deductedBonus: bonusDebit / 100, deductedCoins: coinDebit / 100 },
    } });
    return { ...(actionId ? {actionId} : {}), amount: (coins - coinDebit) / 100, bonus: (bonus - bonusDebit) / 100,
      deductedBonus: bonusDebit / 100, deductedCoins: coinDebit / 100 };
  });
}

// Aggregate committed charges only; Redis counters cannot authorize payouts.
export async function monthlyGameSpend(catId: string, mode: string, year: number, month: number) {
  const { default: db } = await import('@/db');
  const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 1));
  const [row] = await db.$queryRaw<{ coins: number; bonus: number; unknown: number }[]>`
    SELECT COALESCE(SUM(CASE WHEN metadata ? 'deductedCoins' THEN (metadata->>'deductedCoins')::numeric
        WHEN source = 'COINS' THEN amount ELSE 0 END), 0)::float8 AS coins,
      COUNT(*) FILTER (WHERE source = 'COINS_BONUS' AND NOT COALESCE((metadata ? 'deductedCoins' AND metadata ? 'deductedBonus'), false))::int AS unknown,
      COALESCE(SUM(CASE WHEN metadata ? 'deductedBonus' THEN (metadata->>'deductedBonus')::numeric
        WHEN source = 'BONUS' THEN amount ELSE 0 END), 0)::float8 AS bonus
    FROM "Transaction" WHERE category = 'GAME_DEDUCTION' AND status = 'COMPLETED'
      AND "createdAt" >= ${start} AND "createdAt" < ${end}
      AND (metadata->>'gameActionId' IS NULL OR EXISTS (SELECT 1 FROM "GameWalletAction" a WHERE a.id = metadata->>'gameActionId' AND a.status = 'DELIVERED'))
      AND type = 'DEBIT' AND metadata->>'catId' = ${catId} AND metadata->>'mode' = ${mode}`;
  if (row.unknown) throw new Error('Mixed legacy game spending requires reconciliation before rewards');
  return { coins: row.coins, bonus: row.bonus };
}
