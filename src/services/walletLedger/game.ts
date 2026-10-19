import { GameDelivery, gameActionId } from './gameDelivery';
import { GameActionEnum } from '@/types';
import { TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum } from '@prisma/client';
import { randomUUID, randomInt } from 'crypto';
import { cents, WalletError, walletOperation } from './index';

export async function chargeGameAction(params: { playerId: string; action: GameActionEnum; [key: string]: any }, high: number, fallback: number, delivery?: GameDelivery) {
  const key = params.operationId as string | undefined;
  if (delivery && !key) throw new WalletError('Game action identity is required');
  const storedParams = {...params};
  if (delivery?.kind === 'CHAT') delete storedParams.content;
  return walletOperation(`game:${params.playerId}`, key, storedParams, [params.playerId], async tx => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.playerId } });
    if (wallet.isLocked) throw new WalletError('Wallet is locked');
    const bonus = cents(wallet.bonus, true), coins = cents(wallet.coins, true);
    const charge = bonus >= cents(high) ? cents(high) : cents(fallback);
    if (bonus + coins < charge) throw new WalletError('Insufficient balance');
    const bonusDebit = Math.min(bonus, charge), coinDebit = charge - bonusDebit;
    await tx.wallet.update({ where: { id: wallet.id }, data: { coins: (coins - coinDebit) / 100, bonus: (bonus - bonusDebit) / 100 } });
    const actionId = delivery ? gameActionId(params.playerId,key!) : undefined;
    let outcome: string | undefined;
    let acceptedDelivery = delivery;
    if (delivery?.payload.serverLuck === true) {
      const options: unknown = delivery.payload.luckOptions;
      if (!Array.isArray(options) || !options.length || options.length > 30 || options.some(n => typeof n !== 'string' || !/^\d{1,3}$/.test(n))) throw new WalletError('Invalid luck game options');
      const latest = await tx.gameWalletAction.findFirst({where: {userId: params.playerId, roomId: delivery.roomId,
        roundId: delivery.roundId, kind: 'ANSWER', status: {not: 'REFUNDED'}}, orderBy: {createdAt: 'desc'}});
      if (latest && delivery.payload.luckKind === 'LUCKYSPIN' && Date.now()-latest.createdAt.getTime()<2500) throw new WalletError('Wait for the current spin to finish');
      const used = await tx.gameWalletAction.count({where: {userId: params.playerId, roomId: delivery.roomId,
        roundId: delivery.roundId, kind: 'ANSWER', status: {not: 'REFUNDED'}}});
      if (delivery.payload.luckKind === 'LUCKYFLIP' && used >= options.length) throw new WalletError('All cards have been flipped');
      outcome = options[randomInt(options.length)];
      const {luckOptions, ...payload} = delivery.payload;
      acceptedDelivery = {...delivery, payload: {...payload, answer: outcome, serverOutcome: true}};
    }
    if (acceptedDelivery) await tx.gameWalletAction.create({data:{id:actionId!,userId:params.playerId,roomId:acceptedDelivery.roomId,roundId:acceptedDelivery.roundId,
      kind:acceptedDelivery.kind,payload:acceptedDelivery.kind === 'CHAT' ? {id: acceptedDelivery.payload.id} : acceptedDelivery.payload,deductedCoins:coinDebit/100,deductedBonus:bonusDebit/100}});
    await tx.transaction.create({ data: {
      userId: params.playerId, senderId: params.playerId, walletId: wallet.id,
      txnRef: randomUUID(), amount: charge / 100, currency: TxnCurrencyEnum.COINS,
      source: bonusDebit === 0 ? TxnSourceEnum.COINS : coinDebit === 0 ? TxnSourceEnum.BONUS : TxnSourceEnum.COINS_BONUS,
      category: TxnCategoryEnum.GAME_DEDUCTION, gateway: TxnGatewayEnum.WALLET,
      type: TxnTypeEnum.DEBIT, status: TxnStatusEnum.COMPLETED,
      description: 'Game action charge', metadata: { ...storedParams, gameActionId:actionId, deductedBonus: bonusDebit / 100, deductedCoins: coinDebit / 100 },
    } });
    return { ...(outcome !== undefined ? {outcome} : {}), ...(actionId ? {actionId} : {}), amount: (coins - coinDebit) / 100, bonus: (bonus - bonusDebit) / 100,
      deductedBonus: bonusDebit / 100, deductedCoins: coinDebit / 100 };
  });
}

// Aggregate committed charges only; Redis counters cannot authorize payouts.
export async function monthlyGameSpendExact(catId: string, mode: string, year: number, month: number) {
  const { default: db } = await import('@/db');
  const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 1));
  const [row] = await db.$queryRaw<{ coins: string; bonus: string; unknown: number }[]>`
    SELECT COALESCE(SUM(CASE WHEN metadata ? 'deductedCoins' THEN (metadata->>'deductedCoins')::numeric
        WHEN source = 'COINS' THEN amount ELSE 0 END), 0)::text AS coins,
      COUNT(*) FILTER (WHERE source = 'COINS_BONUS' AND NOT COALESCE((metadata ? 'deductedCoins' AND metadata ? 'deductedBonus'), false))::int AS unknown,
      COALESCE(SUM(CASE WHEN metadata ? 'deductedBonus' THEN (metadata->>'deductedBonus')::numeric
        WHEN source = 'BONUS' THEN amount ELSE 0 END), 0)::text AS bonus
    FROM "Transaction" WHERE category = 'GAME_DEDUCTION' AND status = 'COMPLETED'
      AND "createdAt" >= ${start} AND "createdAt" < ${end}
      AND (metadata->>'gameActionId' IS NULL OR EXISTS (SELECT 1 FROM "GameWalletAction" a WHERE a.id = metadata->>'gameActionId' AND a.status = 'DELIVERED'))
      AND type = 'DEBIT' AND metadata->>'catId' = ${catId} AND metadata->>'mode' = ${mode}`;
  if (row.unknown) throw new Error('Mixed legacy game spending requires reconciliation before rewards');
  return { coins: row.coins, bonus: row.bonus };
}

// Numeric boundary retained for existing callers; settlement uses exact decimal strings.
export async function monthlyGameSpend(catId: string, mode: string, year: number, month: number) {
  const spend = await monthlyGameSpendExact(catId, mode, year, month);
  return {coins: Number(spend.coins), bonus: Number(spend.bonus)};
}
