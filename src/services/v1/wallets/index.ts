import { RewardTypeEnum, TaskStatus, TxnCategoryEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, TxnStatusEnum, TxnTypeEnum } from '@prisma/client';
import { BonusTypeEnum, User } from '@/types';
import prisma from '@/db';
import { randomUUID } from 'crypto';
import { cents, requestKey, WalletError, walletFailure, walletOperation } from '@/services/walletLedger';
import {logServiceError} from '@/logger/events';

const creditRecord = (userId: string, amount: number, category: TxnCategoryEnum) => ({
  userId, recipientId: userId, amount, category, txnRef: randomUUID(), currency: TxnCurrencyEnum.COINS,
  gateway: TxnGatewayEnum.VIRTUAL, source: TxnSourceEnum.VIRTUAL, type: TxnTypeEnum.CREDIT,
  status: TxnStatusEnum.COMPLETED, description: 'Wallet reward',
});
export const getUserCoinsWallet = async (userId: string) => {
  try { const data = await prisma.wallet.findUnique({ where: { userId } });
    return { status: data ? 200 : 404, data: data ?? 'Wallet not found' };
  } catch (error) {
    logServiceError("v1/wallets/index", "getUserCoinsWallet", error);
 return walletFailure(error); }
};
export const transferCoins = async (arg: { senderId: string; recipientId: string; amount: number; idempotencyKey?: string }) => {
  try {
    const amount = cents(arg.amount);
    if (amount < 10000) throw new WalletError('Minimum transfer amount is 100 coins');
    if (arg.senderId === arg.recipientId) throw new WalletError('Cannot transfer to yourself');
    const fee = Math.round(amount * 0.5), debit = amount + fee; // Preserve existing 50% fee policy.
    return await walletOperation(`transfer:${arg.senderId}`, requestKey(arg.idempotencyKey),
      { recipientId: arg.recipientId, amount }, [arg.senderId, arg.recipientId], async tx => {
        const sender = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.senderId } });
        const recipient = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.recipientId } });
        if (sender.isLocked || recipient.isLocked) throw new WalletError('Wallet is locked');
        if (cents(sender.coins, true) < debit) throw new WalletError('Insufficient balance including transaction fee');
        await tx.wallet.update({ where: { id: sender.id }, data: { coins: (cents(sender.coins, true) - debit) / 100 } });
        await tx.wallet.update({ where: { id: recipient.id }, data: { coins: { increment: amount / 100 } } });
        const txnRef = randomUUID();
        const common = { txnRef, senderId: arg.senderId, recipientId: arg.recipientId, currency: TxnCurrencyEnum.COINS,
          gateway: TxnGatewayEnum.WALLET, source: TxnSourceEnum.COINS, status: TxnStatusEnum.COMPLETED,
          metadata: { amount: amount / 100, txnFee: fee / 100, txnAmount: debit / 100 } };
        await tx.transaction.create({ data: { ...common, userId: arg.senderId, walletId: sender.id,
          amount: debit / 100, category: TxnCategoryEnum.COIN_TRANSFER, type: TxnTypeEnum.DEBIT, description: 'Coin transfer including fee' } });
        await tx.transaction.create({ data: { ...common, userId: arg.recipientId, walletId: recipient.id,
          amount: amount / 100, category: TxnCategoryEnum.COIN_RECEIVED, type: TxnTypeEnum.CREDIT, description: 'Coins received' } });
        return { status: 200, data: 'Transfer successful' };
      });
  } catch (error) {
    logServiceError("v1/wallets/index", "transferCoins", error);
 return walletFailure(error); }
};
export const fundCoins = async (arg: { userId: string; amount: number; bonus: number; idempotencyKey?: string }, currUser: User & { role?: string }) => {
  if (!['ADMIN', 'SUPER'].includes(currUser.role ?? '')) return { status: 403, data: 'Only administrators can fund wallets' };
  try {
    const amount = cents(arg.amount, true), bonus = cents(arg.bonus, true);
    if (!amount && !bonus) throw new WalletError('Amount or bonus must be positive');
    return await walletOperation(`fund:${currUser.id}`, requestKey(arg.idempotencyKey),
      { userId: arg.userId, amount, bonus }, [arg.userId], async tx => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.userId } });
        if (wallet.isLocked) throw new WalletError('Wallet is locked');
        await tx.wallet.update({ where: { id: wallet.id }, data: { coins: { increment: amount / 100 }, bonus: { increment: bonus / 100 } } });
        await tx.transaction.create({ data: { ...creditRecord(arg.userId, (amount + bonus) / 100, TxnCategoryEnum.COIN_RECEIVED),
          walletId: wallet.id, senderId: currUser.id, source: amount && bonus ? TxnSourceEnum.COINS_BONUS : amount ? TxnSourceEnum.COINS : TxnSourceEnum.BONUS, metadata: { coins: amount / 100, bonus: bonus / 100 } } });
        return { status: 200, data: 'Funding successful' };
      });
  } catch (error) {
    logServiceError("v1/wallets/index", "fundCoins", error);
 return walletFailure(error); }
};
export const getTxnHistory = async ({ userId, page, limit }: { userId: string; page: number; limit: number }) => {
  try {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new WalletError('Invalid pagination');
    const data = await prisma.transaction.findMany({ where: { userId }, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return { status: data.length ? 200 : 404, data: data.length ? data : 'No transaction history' };
  } catch (error) {
    logServiceError("v1/wallets/index", "getTxnHistory", error);
 return walletFailure(error); }
};
export const updateWalletBonus = async (arg: { userId: string; amount: number; type: BonusTypeEnum; isTask: boolean; date: string; meta?: any }) => {
  try {
    if (arg.isTask || ![BonusTypeEnum.BONUS, BonusTypeEnum.ADS].includes(arg.type)) throw new WalletError('Invalid reward type');
    const amount = cents(arg.amount);
    if (amount > 1000) throw new WalletError('Bonus amount is illegal');
    // Client-provided dates must never control eligibility.
    return await walletOperation(`bonus:${arg.userId}`, undefined, {}, [arg.userId], async tx => {
      const field = arg.type === BonusTypeEnum.BONUS ? 'dailyBonusDate' : 'adsBonusDate';
      const settings = await tx.userTaskSettings.findUnique({ where: { userId: arg.userId } });
      const now = new Date();
      if (settings?.[field] && settings[field] > now) throw new WalletError('User already rewarded today');
      const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: arg.userId } });
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      await tx.wallet.update({ where: { id: wallet.id }, data: { bonus: { increment: amount / 100 } } });
      await tx.transaction.create({ data: { ...creditRecord(arg.userId, amount / 100, TxnCategoryEnum.DAILY_BONUS), walletId: wallet.id, source: TxnSourceEnum.BONUS, metadata: { bonus: amount / 100, type: arg.type } } });
      await tx.userTaskSettings.upsert({ where: { userId: arg.userId }, create: { userId: arg.userId, [field]: next }, update: { [field]: next } });
      return { status: 200, data: 'Success' };
    });
  } catch (error) {
    logServiceError("v1/wallets/index", "updateWalletBonus", error);
 return walletFailure(error); }
};
export const rewardDailyTask = async ({ id: taskId, code, userId }: { id: string; code?: string; userId: string }) => {
  try {
    return await walletOperation(`task:${userId}`, taskId, { taskId }, [userId], async tx => {
      const task = await tx.task.findUnique({ where: { id: taskId }, include: { performedBy: { where: { userId } } } });
      if (!task) throw new WalletError('Task not found', 404);
      if (task.performedBy.length) throw new WalletError('You have already performed this task', 422);
      if (task.code && task.code !== code) throw new WalletError('Invalid code provided', 422);
      const reward = cents(task.reward);
      const field = task.rewardType === RewardTypeEnum.CREDIT ? 'credit' : task.rewardType === RewardTypeEnum.COINS ? 'coins' : 'bonus';
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (wallet.isLocked) throw new WalletError('Wallet is locked');
      await tx.wallet.update({ where: { id: wallet.id }, data: { [field]: { increment: reward / 100 } } });
      await tx.transaction.create({ data: { ...creditRecord(userId, reward / 100, TxnCategoryEnum.APP_TASK), walletId: wallet.id,
        source: field === 'credit' ? TxnSourceEnum.CREDIT : field === 'coins' ? TxnSourceEnum.COINS : TxnSourceEnum.BONUS,
        currency: field === 'credit' ? TxnCurrencyEnum.TZX : TxnCurrencyEnum.COINS, taskId, metadata: { rewardType: task.rewardType } } });
      await tx.userTask.create({ data: { userId, taskId, status: TaskStatus.COMPLETED } });
      return { status: 200, data: 'Success' };
    });
  } catch (error) {
    logServiceError("v1/wallets/index", "rewardDailyTask", error);
 return walletFailure(error); }
};

// Withdrawal orchestration stays in the wallet domain; adapters own provider contracts.
import {Prisma,ChargeRate,CoinWithdrawal} from '@prisma/client';
import {WithdrawalGateway,WithdrawalDestination,WithdrawalProviderError,withdrawalEnvironment,validateWithdrawalDestination,cryptoRoutes,decimal} from './withdrawal-provider';
import {prepareFlutterwaveWithdrawal,runFlutterwaveWithdrawal} from './withdrawal-flutterwave';
import {prepareBachsWithdrawal,runBachsWithdrawal} from './withdrawal-bachs';
import {logServiceTrace} from '@/logger/events';

const pendingWithdrawals=['RESERVED','PROCESSING','REVIEW'];
export function withdrawalConversion(coins:number|Prisma.Decimal,rates:Pick<ChargeRate,'price'|'ngnPrice'|'fee'|'ngnFee'|'minWithdrawal'|'minNgnWithdrawal'>,nigerian:boolean) {
  const value=new Prisma.Decimal(cents(coins)).div(100);
  const rate=nigerian?rates.ngnPrice:rates.price,fee=nigerian?rates.ngnFee:rates.fee,minimum=nigerian?rates.minNgnWithdrawal:rates.minWithdrawal;
  if(!rate.isFinite() || !rate.gt(0) || !fee.isFinite() || fee.lt(0) || fee.gte(1) || !minimum.isFinite() || minimum.lt(0)) throw new WalletError('Withdrawal exchange rates are unavailable',503);
  const gross=value.mul(rate).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN);
  const amount=value.mul(rate).mul(new Prisma.Decimal(1).sub(fee)).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN);
  if(!amount.gt(0) || amount.lt(minimum)) throw new WalletError(`Minimum withdrawal after exchange fee is ${nigerian?'NGN':'USD'} ${minimum.toFixed(2)}`);
  return {coins:value,rate,fee,minimum,gross,amount,currency:nigerian?'NGN':'USD'};
}
function withdrawalView(row:CoinWithdrawal) {
  const destination=row.destination as any;
  return {id:row.id,gateway:row.gateway,coins:row.coins.toNumber(),rate:row.rate.toString(),exchangeFeePercent:row.fee.mul(100).toNumber(),minimum:row.minimum.toNumber(),amount:row.amount.toNumber(),currency:row.currency,
    receiveAmount:row.receiveAmount,receiveCurrency:row.receiveCurrency,expiresAt:row.expiresAt,status:row.status,createdAt:row.createdAt,completedAt:row.completedAt,
    destination:destination.type==='bank'?{type:'bank',accountName:destination.accountName,accountEnding:destination.accountNumber.slice(-4)}:{type:'crypto',asset:destination.asset,address:destination.address}};
}
export async function withdrawalSettings(userId:string) {
  const user=await prisma.user.findUnique({where:{id:userId},include:{country:true}});
  if(!user?.country) throw new WalletError('Set your country in your profile before withdrawing',409);
  const rate=await prisma.chargeRate.findUnique({where:{id:'default'}});
  if(!rate) throw new WalletError('Withdrawal exchange rates are unavailable',503);
  const nigerian=user.country.iso3==='NGA';
  return {nigerian,currency:nigerian?'NGN':'USD',rate:(nigerian?rate.ngnPrice:rate.price).toString(),exchangeFeePercent:(nigerian?rate.ngnFee:rate.fee).mul(100).toNumber(),minimum:(nigerian?rate.minNgnWithdrawal:rate.minWithdrawal).toNumber(),
    providers: (['FLUTTERWAVE','BACHS'] as const).map(gateway=>{let enabled=true;try{withdrawalEnvironment(gateway);}catch(error){enabled=false;logServiceError('v1/wallets/index','withdrawal.provider.unavailable',error,true,{gateway});}return {gateway,enabled,routes:nigerian?[]:cryptoRoutes[gateway]};})};
}
export async function quoteCoinWithdrawal(userId:string,input:{coins:number;gateway:WithdrawalGateway;destination:WithdrawalDestination}) {
  const user=await prisma.user.findUnique({where:{id:userId},include:{country:true,wallet:true}});
  if(!user?.country || !user.wallet) throw new WalletError('Set your country and create a wallet before withdrawing',409);
  if(user.wallet.isLocked) throw new WalletError('Wallet is locked',409);
  if(!['FLUTTERWAVE','BACHS'].includes(input.gateway)) throw new WalletError('Unsupported payout provider');
  const destination=validateWithdrawalDestination(input.destination,input.gateway,user.country.iso3==='NGA');
  const rates=await prisma.chargeRate.findUnique({where:{id:'default'}});
  if(!rates) throw new WalletError('Withdrawal exchange rates are unavailable',503);
  const converted=withdrawalConversion(input.coins,rates,user.country.iso3==='NGA');
  if(cents(user.wallet.coins,true)<cents(converted.coins)) throw new WalletError('Insufficient coin balance');
  if(await prisma.coinWithdrawal.findFirst({where:{userId,status:{in:pendingWithdrawals}}})) throw new WalletError('You already have a withdrawal in progress. Check its status before requesting another.',409);
  const environment=withdrawalEnvironment(input.gateway),id=randomUUID();
  const plan=input.gateway==='FLUTTERWAVE'?await prepareFlutterwaveWithdrawal(converted.amount,destination):await prepareBachsWithdrawal(userId,converted.amount,converted.gross,destination,id);
  if(destination.type==='bank') destination.accountName=plan.data.accountName??plan.data.request.beneficiary_name;
  const row=await prisma.coinWithdrawal.create({data:{id,userId,gateway:input.gateway,environment,country:user.country.iso3,coins:converted.coins,rate:converted.rate,fee:converted.fee,minimum:converted.minimum,amount:converted.amount,currency:converted.currency,
    destination:destination as unknown as Prisma.InputJsonValue,providerData:plan.data,receiveAmount:plan.receiveAmount,receiveCurrency:plan.receiveCurrency,expiresAt:plan.expiresAt}});
  return withdrawalView(row);
}
export async function confirmCoinWithdrawal(userId:string,id:string,key:string) {
  const result=await walletOperation(`withdrawal:${userId}`,requestKey(key),{id},[userId],async tx=>{
    const row=await tx.coinWithdrawal.findFirst({where:{id,userId}});
    if(!row) throw new WalletError('Withdrawal quote not found',404);
    if(row.status!=='QUOTED') {
      if(pendingWithdrawals.includes(row.status) || ['SUCCEEDED','FAILED'].includes(row.status)) return {id:row.id};
      throw new WalletError('Withdrawal cannot be confirmed',409);
    }
    if(row.environment!==withdrawalEnvironment(row.gateway as WithdrawalGateway)) throw new WalletError('Withdrawal belongs to another provider environment',409);
    if(row.expiresAt.getTime()<Date.now()+10000) throw new WalletError('The withdrawal quote expired. Review a fresh quote before confirming.',409);
    const user=await tx.user.findUniqueOrThrow({where:{id:userId},include:{country:true}});
    const rates=await tx.chargeRate.findUnique({where:{id:'default'}});
    if(!rates || user.country?.iso3!==row.country) throw new WalletError('Withdrawal settings changed. Request a fresh quote.',409);
    const current=withdrawalConversion(row.coins,rates,row.country==='NGA');
    if(!current.rate.eq(row.rate) || !current.fee.eq(row.fee) || !current.minimum.eq(row.minimum) || !current.amount.eq(row.amount)) throw new WalletError('Withdrawal exchange rates changed. Review a fresh quote.',409);
    const wallet=await tx.wallet.findUniqueOrThrow({where:{userId}});
    if(wallet.isLocked) throw new WalletError('Wallet is locked',409);
    if(cents(wallet.coins,true)<cents(row.coins)) throw new WalletError('Insufficient coin balance');
    if(await tx.coinWithdrawal.findFirst({where:{userId,id:{not:id},status:{in:pendingWithdrawals}}})) throw new WalletError('Another withdrawal is already in progress',409);
    await tx.wallet.update({where:{id:wallet.id},data:{coins:{decrement:row.coins}}});
    await tx.transaction.create({data:{txnRef:row.id,userId,senderId:userId,walletId:wallet.id,type:'DEBIT',amount:row.coins,source:'COINS',category:'COIN_WITHDRAWAL',gateway:row.gateway,currency:'COINS',status:'PROCESSING',description:'Coins reserved for withdrawal',metadata:{withdrawalId:row.id,amount:row.amount.toString(),currency:row.currency,rate:row.rate.toString(),fee:row.fee.toString()}}});
    await tx.coinWithdrawal.update({where:{id},data:{status:'RESERVED'}});
    return {id};
  });
  return await processCoinWithdrawal(result.id,userId);
}
async function settleCoinWithdrawal(row:CoinWithdrawal,status:'SUCCEEDED'|'FAILED',attempt:number) {
  await walletOperation('withdrawal-settlement',row.id,{status},[row.userId],async tx=>{
    const saved=await tx.coinWithdrawal.findUniqueOrThrow({where:{id:row.id}});
    if(['SUCCEEDED','FAILED'].includes(saved.status)) return;
    if(saved.processingAttempts!==attempt || !saved.processingUntil || saved.processingUntil.getTime()<=Date.now()) throw new WalletError('Withdrawal processing lease expired',409);
    if(status==='FAILED') {
      await tx.wallet.update({where:{userId:row.userId},data:{coins:{increment:saved.coins}}});
      const wallet=await tx.wallet.findUniqueOrThrow({where:{userId:row.userId}});
      await tx.transaction.create({data:{txnRef:row.id,exTxnRef:row.providerId,userId:row.userId,recipientId:row.userId,walletId:wallet.id,type:'CREDIT',amount:saved.coins,source:'COINS',category:'COIN_WITHDRAWAL',gateway:row.gateway,currency:'COINS',status:'COMPLETED',description:'Withdrawal failed — coins restored',metadata:{withdrawalId:row.id}}});
    }
    await tx.transaction.updateMany({where:{txnRef:row.id,category:'COIN_WITHDRAWAL',type:'DEBIT'},data:{status:status==='SUCCEEDED'?'COMPLETED':'FAILED',exTxnRef:saved.providerId,description:status==='SUCCEEDED'?'Coins withdrawn':'Withdrawal failed'}});
    await tx.coinWithdrawal.update({where:{id:row.id},data:{status,completedAt:new Date()}});
  });
}
export async function processCoinWithdrawal(id:string,userId?:string) {
  let row=await prisma.coinWithdrawal.findFirst({where:{id,...(userId?{userId}:{})}});
  if(!row) throw new WalletError('Withdrawal not found',404);
  if(!pendingWithdrawals.includes(row.status)) return withdrawalView(row);
  if(row.environment!==withdrawalEnvironment(row.gateway as WithdrawalGateway)) throw new WalletError('Withdrawal belongs to another provider environment',409);
  const claim=await prisma.coinWithdrawal.updateMany({where:{id,status:{in:pendingWithdrawals},OR:[{processingUntil:null},{processingUntil:{lt:new Date()}}]},data:{processingUntil:new Date(Date.now()+600000),processingAttempts:{increment:1}}});
  if(!claim.count) return withdrawalView(row);
  row=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});
  const attempt=row.processingAttempts,initialStage=row.stage;
  const save=async(data:{stage?:string;providerId?:string;providerData?:Prisma.InputJsonValue})=>{
    const changed=await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt,processingUntil:{gt:new Date()}},data});
    if(!changed.count) throw new WalletError('Withdrawal processing lease expired',409);
    row=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});return row;
  };
  try {
    const result=row.gateway==='FLUTTERWAVE'?await runFlutterwaveWithdrawal(row,save):await runBachsWithdrawal(row,save);
    if(result.status==='PROCESSING') {
      const overdue=Date.now()-row.createdAt.getTime()>24*3600000;
      const review=row.status==='REVIEW'||overdue;
      await prisma.coinWithdrawal.update({where:{id},data:{status:review?'REVIEW':'PROCESSING',...(review?{reviewRequiredAt:row.reviewRequiredAt??new Date()}: {})}});
      if(overdue&&!row.reviewRequiredAt) logServiceTrace('v1/wallets/index','withdrawal.review.required','Overdue withdrawal requires review; coins remain reserved',{withdrawalId:id,gateway:row.gateway});
    }
    else await settleCoinWithdrawal(row,result.status,attempt);
  } catch(error) {
    logServiceError('v1/wallets/index','withdrawal.process',error,false,{withdrawalId:id,gateway:row.gateway,stage:row.stage});
    const owned=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});
    if(owned.processingAttempts!==attempt || !owned.processingUntil || owned.processingUntil.getTime()<=Date.now()) return withdrawalView(owned);
    // A preflight failure or an explicit rejection before any funds moved is safe to release.
    const noFundsMoved=row.stage==='PREPARED' || (error instanceof WithdrawalProviderError && error.definitive &&
      initialStage==='PREPARED' && ((row.gateway==='FLUTTERWAVE' && row.stage==='PAYOUT_SUBMITTING') || (row.gateway==='BACHS' && row.stage==='FUNDING')));
    if(noFundsMoved) await settleCoinWithdrawal(row,'FAILED',attempt);
    else if(Date.now()-row.createdAt.getTime()>24*3600000 || error instanceof WalletError && error.status===409) {
      await prisma.coinWithdrawal.update({where:{id},data:{status:'REVIEW',reviewRequiredAt:row.reviewRequiredAt??new Date()}});
      logServiceTrace('v1/wallets/index','withdrawal.review.required','Withdrawal requires review; coins remain reserved',{withdrawalId:id,gateway:row.gateway});
    }
  } finally {
    await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt},data:{processingUntil:null}});
  }
  return withdrawalView(await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}}));
}
export async function listCoinWithdrawals(userId:string) {
  return (await prisma.coinWithdrawal.findMany({where:{userId,status:{not:'QUOTED'}},orderBy:{createdAt:'desc'},take:50})).map(withdrawalView);
}
export async function reconcileCoinWithdrawals() {
  const rows=await prisma.coinWithdrawal.findMany({where:{status:{in:pendingWithdrawals}},orderBy:{updatedAt:'asc'},take:50});
  for(const row of rows) {
    try {await processCoinWithdrawal(row.id);} catch(error) {logServiceError('v1/wallets/index','withdrawal.reconcile',error,false,{withdrawalId:row.id});await prisma.coinWithdrawal.update({where:{id:row.id},data:{updatedAt:new Date()}});}
  }
}
