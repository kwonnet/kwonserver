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
export async function dispatchGameAction(id: string) {
  const action = await prisma.gameWalletAction.findUniqueOrThrow({where:{id}});
  if (action.status !== 'PENDING') return action;
  const room = `room:${action.roomId}`;
  // Network errors leave the durable action pending. NEVER infer rejection from a timeout.
  const raw = await redis.eval(gameDeliveryScript, {keys:[
    `wallet-action:${id}`, `${room}:question`, room, `${room}:answers`, `${room}:u-answers`,
    `${room}:votes`, `${room}:player:${action.userId}:guesses`, `${room}:paid-messages`,
  ], arguments:[JSON.stringify({...action, expiresAt:action.createdAt.getTime()+5*60*1000})]});
  const result = JSON.parse(String(raw)) as {state:'APPLIED'|'REJECTED';reason?:string};
  if (result.state === 'APPLIED') {
    await prisma.gameWalletAction.updateMany({where:{id,status:'PENDING'},data:{status:'DELIVERED',settledAt:new Date()}});
  } else if (result.state === 'REJECTED') {
    await walletOperation('game-refund',id,{},[action.userId],async tx=>{
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
  return prisma.gameWalletAction.findUniqueOrThrow({where:{id}});
}
export async function recoverGameActions() {
  // One bad record must not prevent independent users' recovery.
  const actions=await prisma.gameWalletAction.findMany({where:{status:'PENDING'},orderBy:{createdAt:'asc'},take:200});
  let failures=0;
  for(const action of actions){try{await dispatchGameAction(action.id);}catch (serviceError){
    logServiceError("walletLedger/gameDelivery", "recoverGameActions", serviceError);
failures++;}}
  if(failures) throw new Error(`${failures} game actions remain pending delivery`);
}
