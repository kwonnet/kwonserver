import {Prisma} from '@prisma/client';
import {PromisePool} from '@supercharge/promise-pool';
import { createHash, randomUUID } from 'crypto';
import prisma from '@/db';
import redis from '@/redis';
import { cents, walletOperation } from './index';
import { gameDeliveryScript } from './gameDeliveryScript';
import {logServiceError} from '@/logger/events';

export interface GameDelivery {
  kind: 'ANSWER' | 'ACRONYM' | 'WORDMAKER' | 'VOTE' | 'CHAT';
  roomId: string;
  roundId?: string;
  payload: Record<string, any>;
}
export function gameActionId(userId: string, operationId: string) {
  return createHash('sha256').update(JSON.stringify([userId,operationId])).digest('hex');
}
export async function dispatchGameAction(id: string, liveChatPayload?: Record<string, any>) {
  const action = await prisma.gameWalletAction.findUniqueOrThrow({where:{id}});
  if (action.status !== 'PENDING') return action;
  const room = `room:${action.roomId}`;
  // Network errors leave the durable action pending. NEVER infer rejection from a timeout.
  const raw = await redis.eval(gameDeliveryScript, {keys:[
    `wallet-action:${id}`, `${room}:question`, room, `${room}:answers`, `${room}:u-answers`,
    `${room}:votes`, `${room}:player:${action.userId}:guesses`, `${room}:paid-messages`, `${room}:round:${action.roundId}:actions`,
  ], arguments:[JSON.stringify({...action,sequence:action.sequence.toString(),payload:{...action.payload as any,actionId:action.id,sequence:action.sequence.toString().padStart(20,'0')},expiresAt:action.createdAt.getTime()+5*60*1000}), liveChatPayload ? JSON.stringify({...liveChatPayload, playerId:action.userId}) : '']});
  const result = JSON.parse(String(raw)) as {state:'APPLIED'|'REJECTED';reason?:string};
  if (result.state === 'APPLIED') {
    await prisma.gameWalletAction.updateMany({where:{id,status:'PENDING'},data:{status:'DELIVERED',settledAt:new Date()}});
  } else if (result.state === 'REJECTED') {
    await walletOperation('game-refund',id,{},[action.userId],async tx=>{
      await tx.$queryRaw`SELECT id FROM "GameWalletAction" WHERE id=${id} FOR UPDATE`;
      const current=await tx.gameWalletAction.findUniqueOrThrow({where:{id}});
      if(current.status !== 'PENDING') return;
      const wallet=await tx.wallet.update({where:{userId:action.userId},data:{coins:{increment:action.deductedCoins},bonus:{increment:action.deductedBonus}}});
      const coins=cents(action.deductedCoins,true),bonus=cents(action.deductedBonus,true);
      await tx.transaction.create({data:{userId:action.userId,walletId:wallet.id,txnRef:randomUUID(),amount:(coins+bonus)/100,
        type:'CREDIT',status:'COMPLETED',currency:'COINS',gateway:'WALLET',source:coins&&bonus?'COINS_BONUS':coins?'COINS':'BONUS',
        category:'GAME_DEDUCTION',description:'Refund: game action was not accepted',metadata:{gameActionId:id,reason:result.reason,refund:true,coins:coins/100,bonus:bonus/100}}});
      await tx.gameWalletAction.update({where:{id},data:{status:'REFUNDED',reason:result.reason,settledAt:new Date()}});
    });
  } else throw new Error('Unknown game delivery acknowledgement');
  const settled=await prisma.gameWalletAction.findUniqueOrThrow({where:{id}});
  if(settled.status!=='PENDING') await redis.expire(`wallet-action:${id}`,7*86400);
  return settled;
}
export async function recoverGameActions() {
  const actions=await prisma.$queryRaw<{id:string;failures:number}[]>`
    UPDATE "GameWalletAction" SET "nextAttemptAt"=NOW()+INTERVAL '30 seconds'
    WHERE id IN (SELECT id FROM "GameWalletAction" WHERE status='PENDING' AND "nextAttemptAt"<=NOW()
      ORDER BY "nextAttemptAt","createdAt" LIMIT 200 FOR UPDATE SKIP LOCKED) RETURNING id,failures`;
  const {errors}=await PromisePool.for(actions).withConcurrency(8).process(async action=>{
    try {await dispatchGameAction(action.id);}
    catch(error) {
      logServiceError('walletLedger/gameDelivery','recoverGameActions',error);
      await prisma.gameWalletAction.updateMany({where:{id:action.id,status:'PENDING'},data:{failures:{increment:1},
        nextAttemptAt:new Date(Date.now()+Math.min(300000,5000*2**Math.min(action.failures,6)))}});
      throw error;
    }
  });
  if(errors.length)throw new Error(`${errors.length} game actions remain pending delivery`);
}
