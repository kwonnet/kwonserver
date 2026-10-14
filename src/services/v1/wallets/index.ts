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

const pendingWithdrawals=['RESERVED','PROCESSING','REVIEW','BLOCKED'];
const unsettledWithdrawals=[...pendingWithdrawals,'AWAITING_APPROVAL'];
export function withdrawalConversion(coins:number|Prisma.Decimal,rates:Pick<ChargeRate,'price'|'ngnPrice'|'fee'|'ngnFee'|'minWithdrawal'|'minNgnWithdrawal'> & Partial<Pick<ChargeRate,'maxWithdrawal'|'maxNgnWithdrawal'>>,nigerian:boolean) {
  const value=new Prisma.Decimal(cents(coins)).div(100);
  const rate=nigerian?rates.ngnPrice:rates.price,fee=nigerian?rates.ngnFee:rates.fee,minimum=nigerian?rates.minNgnWithdrawal:rates.minWithdrawal;
  if(!rate.isFinite() || !rate.gt(0) || !fee.isFinite() || fee.lt(0) || fee.gte(1) || !minimum.isFinite() || minimum.lt(0)) throw new WalletError('Withdrawal exchange rates are unavailable',503);
  const gross=value.mul(rate).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN);
  const amount=value.mul(rate).mul(new Prisma.Decimal(1).sub(fee)).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN);
  if(!amount.gt(0) || amount.lt(minimum)) throw new WalletError(`Minimum withdrawal after exchange fee is ${nigerian?'NGN':'USD'} ${minimum.toFixed(2)}`);
  const maximum=nigerian?(rates.maxNgnWithdrawal??new Prisma.Decimal(5000000)):(rates.maxWithdrawal??new Prisma.Decimal(5000));
  if(!maximum.isFinite() || maximum.lt(minimum)) throw new WalletError('Withdrawal limits are unavailable',503);
  if(amount.gt(maximum)) throw new WalletError(`Maximum withdrawal per transaction is ${nigerian?'NGN':'USD'} ${maximum.toFixed(2)}`);
  return {coins:value,rate,fee,minimum,maximum,gross,amount,currency:nigerian?'NGN':'USD'};
}
function withdrawalView(row:CoinWithdrawal) {
  const destination=row.destination as any;
  return {id:row.id,gateway:row.gateway,coins:row.coins.toNumber(),rate:row.rate.toString(),exchangeFeePercent:row.fee.mul(100).toNumber(),minimum:row.minimum.toNumber(),amount:row.amount.toNumber(),currency:row.currency,
    receiveAmount:row.receiveAmount,receiveCurrency:row.receiveCurrency,expiresAt:row.expiresAt,status:row.status,createdAt:row.createdAt,completedAt:row.completedAt,
    approvalRequired:row.approvalRequired,approvedAt:row.approvedAt,reviewNote:row.reviewNote,
    destination:destination.type==='bank'?{type:'bank',accountName:destination.accountName,accountEnding:destination.accountNumber.slice(-4)}:{type:'crypto',asset:destination.asset,address:destination.address}};
}
export async function withdrawalSettings(userId:string) {
  const user=await prisma.user.findUnique({where:{id:userId},include:{country:true}});
  if(!user?.country) throw new WalletError('Set your country in your profile before withdrawing',409);
  const rate=await prisma.chargeRate.findUnique({where:{id:'default'}});
  if(!rate) throw new WalletError('Withdrawal exchange rates are unavailable',503);
  const nigerian=user.country.iso3==='NGA';
  return {canWithdraw:!withdrawalBlockReason(user,rate),blockedReason:withdrawalBlockReason(user,rate),maximum:(nigerian?rate.maxNgnWithdrawal:rate.maxWithdrawal)?.toNumber()??(nigerian?5000000:5000),reviewThreshold:(nigerian?rate.reviewNgnWithdrawal:rate.reviewWithdrawal)?.toNumber()??(nigerian?2500000:2500),nigerian,currency:nigerian?'NGN':'USD',rate:(nigerian?rate.ngnPrice:rate.price).toString(),exchangeFeePercent:(nigerian?rate.ngnFee:rate.fee).mul(100).toNumber(),minimum:(nigerian?rate.minNgnWithdrawal:rate.minWithdrawal).toNumber(),
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
  assertWithdrawalEligibility(user,rates);
  const converted=withdrawalConversion(input.coins,rates,user.country.iso3==='NGA');
  if(cents(user.wallet.coins,true)<cents(converted.coins)) throw new WalletError('Insufficient coin balance');
  if(await prisma.coinWithdrawal.findFirst({where:{userId,status:{in:unsettledWithdrawals}}})) throw new WalletError('You already have a withdrawal in progress. Check its status before requesting another.',409);
  const environment=withdrawalEnvironment(input.gateway),id=randomUUID();
  const plan=input.gateway==='FLUTTERWAVE'?await prepareFlutterwaveWithdrawal(converted.amount,destination):await prepareBachsWithdrawal(userId,converted.amount,converted.gross,destination,id);
  if(destination.type==='bank') destination.accountName=plan.data.accountName??plan.data.request.beneficiary_name;
  const row=await prisma.coinWithdrawal.create({data:{id,userId,gateway:input.gateway,environment,country:user.country.iso3,coins:converted.coins,rate:converted.rate,fee:converted.fee,minimum:converted.minimum,amount:converted.amount,currency:converted.currency,
    destination:destination as unknown as Prisma.InputJsonValue,providerData:{...plan.data,quoteExpiresAt:plan.expiresAt.toISOString()},receiveAmount:plan.receiveAmount,receiveCurrency:plan.receiveCurrency,expiresAt:new Date(Date.now()+15*60000),approvalRequired:converted.amount.gte(reviewLimit(rates,user.country.iso3==='NGA'))}});
  return withdrawalView(row);
}
export async function confirmCoinWithdrawal(userId:string,id:string,key:string,otp?:{challengeId:string;code:string}) {
  requestKey(key);
  await verifyWithdrawalOtp(userId,id,otp);
  const result=await walletOperation(`withdrawal:${userId}`,requestKey(key),{id},[userId],async tx=>{
    const row=await tx.coinWithdrawal.findFirst({where:{id,userId}});
    if(!row) throw new WalletError('Withdrawal quote not found',404);
    if(row.status!=='QUOTED') {
      if(unsettledWithdrawals.includes(row.status) || ['SUCCEEDED','FAILED','REJECTED'].includes(row.status)) return {id:row.id};
      throw new WalletError('Withdrawal cannot be confirmed',409);
    }
    if(row.environment!==withdrawalEnvironment(row.gateway as WithdrawalGateway)) throw new WalletError('Withdrawal belongs to another provider environment',409);
    if(row.expiresAt.getTime()<Date.now()+10000) throw new WalletError('The withdrawal quote expired. Review a fresh quote before confirming.',409);
    const user=await tx.user.findUniqueOrThrow({where:{id:userId},include:{country:true}});
    const rates=await tx.chargeRate.findUnique({where:{id:'default'}});
    if(!rates || user.country?.iso3!==row.country) throw new WalletError('Withdrawal settings changed. Request a fresh quote.',409);
    assertWithdrawalEligibility(user,rates);
    await assertWithdrawalOtpProof(row,user,tx);
    const current=withdrawalConversion(row.coins,rates,row.country==='NGA');
    if(!current.rate.eq(row.rate) || !current.fee.eq(row.fee) || !current.minimum.eq(row.minimum) || !current.amount.eq(row.amount)) throw new WalletError('Withdrawal exchange rates changed. Review a fresh quote.',409);
    const wallet=await tx.wallet.findUniqueOrThrow({where:{userId}});
    if(wallet.isLocked) throw new WalletError('Wallet is locked',409);
    if(cents(wallet.coins,true)<cents(row.coins)) throw new WalletError('Insufficient coin balance');
    if(await tx.coinWithdrawal.findFirst({where:{userId,id:{not:id},status:{in:unsettledWithdrawals}}})) throw new WalletError('Another withdrawal is already in progress',409);
    await tx.wallet.update({where:{id:wallet.id},data:{coins:{decrement:row.coins}}});
    await tx.transaction.create({data:{txnRef:row.id,userId,senderId:userId,walletId:wallet.id,type:'DEBIT',amount:row.coins,source:'COINS',category:'COIN_WITHDRAWAL',gateway:row.gateway,currency:'COINS',status:'PROCESSING',description:'Coins reserved for withdrawal',metadata:{withdrawalId:row.id,amount:row.amount.toString(),currency:row.currency,rate:row.rate.toString(),fee:row.fee.toString()}}});
    const approvalRequired=current.amount.gte(reviewLimit(rates,row.country==='NGA'));
    await tx.coinWithdrawal.update({where:{id},data:{status:approvalRequired?'AWAITING_APPROVAL':'RESERVED',approvalRequired,reviewRequiredAt:approvalRequired?new Date():null}});
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
  const save=async(data:{stage?:string;providerId?:string;providerData?:Prisma.InputJsonValue;receiveAmount?:string;receiveCurrency?:string})=>{
    const changed=await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt,processingUntil:{gt:new Date()}},data});
    if(!changed.count) throw new WalletError('Withdrawal processing lease expired',409);
    row=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});return row;
  };
  try {
    const guard=async()=>await authorizeWithdrawalDispatch(row!);
    if(row.stage==='PREPARED') {
      await guard();
      // OTP delivery and admin review can outlive provider quotes. Refresh only the provider quote,
      // preserving the authorized destination, coin debit and fiat payout value.
      const old=row.providerData as any;
      if(old.quoteExpiresAt && new Date(old.quoteExpiresAt).getTime()<=Date.now()+10000) {
        const destination=row.destination as unknown as WithdrawalDestination;
        const gross=row.coins.mul(row.rate).toDecimalPlaces(2,Prisma.Decimal.ROUND_DOWN);
        const plan=row.gateway==='FLUTTERWAVE'?await prepareFlutterwaveWithdrawal(row.amount,destination):await prepareBachsWithdrawal(row.userId,row.amount,gross,destination,`${row.id}-preflight-${attempt}`);
        const accountName=plan.data.accountName??plan.data.request.beneficiary_name;
        if(destination.type==='bank' && destination.accountName && destination.accountName!==accountName) throw new WalletError('Bank account holder changed; request a new withdrawal',409);
        await save({providerData:{...plan.data,quoteExpiresAt:plan.expiresAt.toISOString(),request:{...plan.data.request,reference:row.id}},receiveAmount:plan.receiveAmount,receiveCurrency:plan.receiveCurrency});
        row=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});
      }
    }
    // Adapters receive the provider quote expiry, not the longer OTP intent lifetime.
    const providerRow={...row,expiresAt:new Date((row.providerData as any).quoteExpiresAt??row.expiresAt)};
    const providerSave=async(data:Parameters<typeof save>[0])=>({...await save(data),expiresAt:providerRow.expiresAt});
    const result=row.gateway==='FLUTTERWAVE'?await runFlutterwaveWithdrawal(providerRow,providerSave,guard):await runBachsWithdrawal(providerRow,providerSave,guard);
    if(result.status==='PROCESSING') {
      const overdue=Date.now()-row.createdAt.getTime()>24*3600000;
      const review=row.status==='REVIEW'||overdue;
      await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt,processingUntil:{gt:new Date()},status:{in:pendingWithdrawals}},data:{status:review?'REVIEW':'PROCESSING',...(review?{reviewRequiredAt:row.reviewRequiredAt??new Date()}: {})}});
      if(overdue&&!row.reviewRequiredAt) logServiceTrace('v1/wallets/index','withdrawal.review.required','Overdue withdrawal requires review; coins remain reserved',{withdrawalId:id,gateway:row.gateway});
    }
    else await settleCoinWithdrawal(row,result.status,attempt);
  } catch(error) {
    logServiceError('v1/wallets/index','withdrawal.process',error,false,{withdrawalId:id,gateway:row.gateway,stage:row.stage});
    const owned=await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}});
    if(owned.processingAttempts!==attempt || !owned.processingUntil || owned.processingUntil.getTime()<=Date.now()) return withdrawalView(owned);
    if(error instanceof WithdrawalBlockedError) {
      await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt,processingUntil:{gt:new Date()},status:{in:pendingWithdrawals}},data:{status:'BLOCKED',reviewNote:error.message}});return withdrawalView(await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}}));
    }
    // A preflight failure or an explicit rejection before any funds moved is safe to release.
    const noFundsMoved=row.stage==='PREPARED' || (error instanceof WithdrawalProviderError && error.definitive &&
      initialStage==='PREPARED' && ((row.gateway==='FLUTTERWAVE' && row.stage==='PAYOUT_SUBMITTING') || (row.gateway==='BACHS' && row.stage==='FUNDING')));
    if(noFundsMoved) await settleCoinWithdrawal(row,'FAILED',attempt);
    else if(Date.now()-row.createdAt.getTime()>24*3600000 || error instanceof WalletError && error.status===409) {
      await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt,processingUntil:{gt:new Date()},status:{in:pendingWithdrawals}},data:{status:'REVIEW',reviewRequiredAt:row.reviewRequiredAt??new Date()}});
      logServiceTrace('v1/wallets/index','withdrawal.review.required','Withdrawal requires review; coins remain reserved',{withdrawalId:id,gateway:row.gateway});
    }
  } finally {
    await prisma.coinWithdrawal.updateMany({where:{id,processingAttempts:attempt},data:{processingUntil:null}});
  }
  return withdrawalView(await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}}));
}
export async function listCoinWithdrawals(userId:string,page?:number) {
  if(page!=null&&(!Number.isInteger(page)||page<1)) throw new WalletError('Invalid page');
  const rows=await prisma.coinWithdrawal.findMany({where:{userId,status:{not:'QUOTED'}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:page?21:50,...(page?{skip:(page-1)*20}:{})});
  return page?{items:rows.slice(0,20).map(withdrawalView),nextPage:rows.length>20?page+1:null}:rows.map(withdrawalView);
}
export async function reconcileCoinWithdrawals() {
  const rows=await prisma.coinWithdrawal.findMany({where:{status:{in:pendingWithdrawals}},orderBy:{updatedAt:'asc'},take:50});
  for(const row of rows) {
    try {await processCoinWithdrawal(row.id);} catch(error) {logServiceError('v1/wallets/index','withdrawal.reconcile',error,false,{withdrawalId:row.id});await prisma.coinWithdrawal.update({where:{id:row.id},data:{updatedAt:new Date()}});}
  }
}

import {createHmac,randomInt,timingSafeEqual} from 'node:crypto';
import {encryptEmailToken,hashEmailToken} from '@/utils/auth-security';
import {enqueueEmailMessage} from '@/services/email';
class WithdrawalBlockedError extends WalletError {}
function withdrawalBlockReason(user:{emailVerifiedAt?:Date|null;withdrawalRestricted?:boolean;status?:string;deletedAt?:Date|null;deactivatedAt?:Date|null},rates:{withdrawalsEnabled?:boolean}) {
  return user.deletedAt||user.deactivatedAt||(user.status&&!['ACTIVE','PRIVATE'].includes(user.status))?'This account cannot withdraw':!user.emailVerifiedAt?'Verify your registered email before withdrawing':rates.withdrawalsEnabled===false?'Withdrawals are temporarily paused across Kwonnet':user.withdrawalRestricted?'Your account is restricted from withdrawing. Contact support.':null;
}
function assertWithdrawalEligibility(user:{emailVerifiedAt?:Date|null;withdrawalRestricted?:boolean;status?:string;deletedAt?:Date|null;deactivatedAt?:Date|null},rates:{withdrawalsEnabled?:boolean}) {
  const reason=withdrawalBlockReason(user,rates);if(reason) throw new WithdrawalBlockedError(reason,403);
}
function reviewLimit(rates:Partial<ChargeRate>,nigerian:boolean) {return nigerian?(rates.reviewNgnWithdrawal??new Prisma.Decimal(2500000)):(rates.reviewWithdrawal??new Prisma.Decimal(2500));}
export function withdrawalOtpHash(id:string,challengeId:string,email:string,code:string) {
  const secret=process.env.AUTH_EMAIL_TOKEN_SECRET;
  if(!secret||secret.length<32) throw new WalletError('Withdrawal email authorization is not configured',503);
  return createHmac('sha256',secret).update(JSON.stringify([id,challengeId,email,code])).digest('hex');
}
export async function requestWithdrawalOtp(userId:string,id:string) {
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const row=await tx.coinWithdrawal.findFirst({where:{id,userId}});
    if(!row||row.status!=='QUOTED'||row.otpVerifiedAt) throw new WalletError('An unconfirmed withdrawal quote is required',409);
    if(row.expiresAt<=new Date()) throw new WalletError('Withdrawal quote expired. Review a new quote.',409);
    const user=await tx.user.findUniqueOrThrow({where:{id:userId}}),rates=await tx.chargeRate.findUnique({where:{id:'default'}});
    if(!rates)throw new WalletError('Withdrawal settings changed',409);
    assertWithdrawalEligibility(user,rates);
    const recent=await tx.authEmailToken.findFirst({where:{userId,purpose:'WITHDRAWAL_OTP',createdAt:{gt:new Date(Date.now()-60000)}}});
    if(recent) throw new WalletError('Wait 60 seconds before requesting another withdrawal code',429);
    if(await tx.authEmailToken.count({where:{userId,purpose:'WITHDRAWAL_OTP',createdAt:{gt:new Date(Date.now()-3600000)}}})>=5) throw new WalletError('Too many withdrawal codes requested. Try again later.',429);
    const code=randomInt(1000000).toString().padStart(6,'0'),challengeId=randomUUID(),expiresAt=new Date(Date.now()+10*60000);
    await tx.authEmailToken.updateMany({where:{userId,purpose:'WITHDRAWAL_OTP',usedAt:null},data:{usedAt:new Date()}});
    await tx.authEmailToken.create({data:{id:challengeId,userId,purpose:'WITHDRAWAL_OTP',subjectId:id,recipientHash:hashEmailToken(user.email),tokenHash:withdrawalOtpHash(id,challengeId,user.email,code),encryptedToken:encryptEmailToken(code),expiresAt}});
    await tx.coinWithdrawal.update({where:{id},data:{otpChallengeId:challengeId,otpVerifiedAt:null}});
    const message=await tx.emailMessage.create({data:{eventKey:`withdrawal-otp:${challengeId}`,userId,kind:'WITHDRAWAL_OTP',actionTokenId:challengeId,withdrawalId:id}});
    return {challengeId,expiresAt,messageId:message.id};
  });
  try {await enqueueEmailMessage(result.messageId);} catch(error) {logServiceError('v1/wallets/index','withdrawal.otp.queue',error,true,{withdrawalId:id});}
  return {challengeId:result.challengeId,expiresAt:result.expiresAt,message:'A withdrawal code is queued for your registered email.'};
}
async function verifyWithdrawalOtp(userId:string,id:string,otp?:{challengeId:string;code:string}) {
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const row=await tx.coinWithdrawal.findFirst({where:{id,userId}});
    if(!row) throw new WalletError('Withdrawal quote not found',404);
    if(!otp||!/^\d{6}$/.test(otp.code)||row.otpChallengeId!==otp.challengeId) return false;
    const user=await tx.user.findUniqueOrThrow({where:{id:userId}}),rates=await tx.chargeRate.findUnique({where:{id:'default'}});
    if(!rates)throw new WalletError('Withdrawal settings changed',409);
    assertWithdrawalEligibility(user,rates);
    const action=await tx.authEmailToken.findUnique({where:{id:otp.challengeId}});
    if(!action||action.userId!==userId||action.purpose!=='WITHDRAWAL_OTP'||action.subjectId!==id||action.recipientHash!==hashEmailToken(user.email)||action.attempts>=5||
      (user.passwordChangedAt&&action.createdAt<=user.passwordChangedAt)) return false;
    const expected=Buffer.from(withdrawalOtpHash(id,action.id,user.email,otp.code),'hex'),saved=Buffer.from(action.tokenHash,'hex');
    const matches=saved.length===expected.length&&timingSafeEqual(saved,expected);
    if(action.usedAt) return !!row.otpVerifiedAt&&matches;
    if(action.expiresAt<=new Date()) return false;
    if(!matches) {await tx.authEmailToken.update({where:{id:action.id},data:{attempts:{increment:1}}});return false;}
    await tx.authEmailToken.update({where:{id:action.id},data:{usedAt:new Date()}});
    await tx.coinWithdrawal.update({where:{id},data:{otpVerifiedAt:new Date()}});
    return true;
  });
  if(!result) throw new WalletError('Invalid, expired or locked withdrawal code. Request another code.',400);
}
async function authorizeWithdrawalDispatch(row:CoinWithdrawal) {
  const user=await prisma.user.findUniqueOrThrow({where:{id:row.userId},include:{country:true,wallet:true}}),rates=await prisma.chargeRate.findUniqueOrThrow({where:{id:'default'}});
  assertWithdrawalEligibility(user,rates);
  if(!user.wallet||user.wallet.isLocked) throw new WithdrawalBlockedError('Wallet is unavailable or locked',403);
  await assertWithdrawalOtpProof(row,user,prisma);
  if(user.country?.iso3!==row.country) throw new WithdrawalBlockedError('Country changed after withdrawal authorization; review is required',409);
  const maximum=row.country==='NGA'?rates.maxNgnWithdrawal:rates.maxWithdrawal;
  if(maximum&&row.amount.gt(maximum)) throw new WithdrawalBlockedError('This withdrawal exceeds the current per-transaction maximum',403);
  if((row.approvalRequired||row.amount.gte(reviewLimit(rates,row.country==='NGA')))&&!row.approvedAt) throw new WithdrawalBlockedError('Admin approval is required before payout',403);
}
async function requireWithdrawalAdmin(actorId:string,db:Prisma.TransactionClient|typeof prisma=prisma) {
  if(db!==prisma)await db.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`;
  const actor=await db.user.findUnique({where:{id:actorId},select:{id:true,role:true,status:true,deletedAt:true,deactivatedAt:true}});
  if(!actor||!['ADMIN','SUPER'].includes(actor.role)||actor.deletedAt||actor.deactivatedAt||!['ACTIVE','PRIVATE'].includes(actor.status)) throw new WalletError('Administrator access required',403);
}
function adminPolicyView(row:ChargeRate) {return {withdrawalsEnabled:row.withdrawalsEnabled,maxWithdrawal:row.maxWithdrawal.toNumber(),maxNgnWithdrawal:row.maxNgnWithdrawal.toNumber(),reviewWithdrawal:row.reviewWithdrawal.toNumber(),reviewNgnWithdrawal:row.reviewNgnWithdrawal.toNumber()};}
export async function getWithdrawalAdminPolicy(actorId:string) {await requireWithdrawalAdmin(actorId);return adminPolicyView(await prisma.chargeRate.findUniqueOrThrow({where:{id:'default'}}));}
export async function updateWithdrawalAdminPolicy(actorId:string,input:{withdrawalsEnabled:boolean;maxWithdrawal:number;maxNgnWithdrawal:number;reviewWithdrawal:number;reviewNgnWithdrawal:number}) {
  return await prisma.$transaction(async tx=>{
    await requireWithdrawalAdmin(actorId,tx);
    const current=await tx.chargeRate.findUniqueOrThrow({where:{id:'default'}});
    for(const [maximum,threshold,minimum]of [[input.maxWithdrawal,input.reviewWithdrawal,current.minWithdrawal],[input.maxNgnWithdrawal,input.reviewNgnWithdrawal,current.minNgnWithdrawal]] as const) {
      cents(maximum);cents(threshold);
      if(new Prisma.Decimal(maximum).lt(minimum)||threshold>maximum||new Prisma.Decimal(threshold).lt(minimum)) throw new WalletError('Review thresholds must fall between the minimum and maximum withdrawal amounts');
    }
    const updated=await tx.chargeRate.update({where:{id:'default'},data:input});
    await tx.withdrawalAdminEvent.create({data:{actorId,action:'POLICY_UPDATED',details:{before:adminPolicyView(current),after:adminPolicyView(updated)}}});
    return adminPolicyView(updated);
  });
}
export async function restrictUserWithdrawal(actorId:string,userId:string,restricted:boolean,reason:string) {
  return await prisma.$transaction(async tx=>{
    await requireWithdrawalAdmin(actorId,tx);
    if(reason.trim().length<3||reason.length>500) throw new WalletError('A restriction reason is required');
    const user=await tx.user.findUnique({where:{id:userId}});if(!user) throw new WalletError('User not found',404);
    await tx.user.update({where:{id:userId},data:{withdrawalRestricted:restricted,withdrawalRestrictionReason:restricted?reason.trim():null}});
    await tx.withdrawalAdminEvent.create({data:{actorId,userId,action:restricted?'USER_RESTRICTED':'USER_UNRESTRICTED',details:{reason:reason.trim(),before:user.withdrawalRestricted,after:restricted}}});
    return {userId,restricted};
  });
}
export async function listWithdrawalAdminQueue(actorId:string,page=1,status='AWAITING_APPROVAL') {
  await requireWithdrawalAdmin(actorId);
  if(!Number.isInteger(page)||page<1||!['AWAITING_APPROVAL','BLOCKED','REVIEW','PROCESSING','SUCCEEDED','FAILED','REJECTED'].includes(status)) throw new WalletError('Invalid withdrawal queue filter');
  const rows=await prisma.coinWithdrawal.findMany({where:{status},include:{user:{select:{id:true,name:true,username:true,emailVerifiedAt:true,withdrawalRestricted:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],skip:(page-1)*20,take:21});
  return {items:rows.slice(0,20).map(row=>({...withdrawalView(row),user:row.user})),nextPage:rows.length>20?page+1:null};
}
export async function getWithdrawalAdminDetails(actorId:string,id:string,page=1) {
  await requireWithdrawalAdmin(actorId);if(!Number.isInteger(page)||page<1) throw new WalletError('Invalid history page');
  const row=await prisma.coinWithdrawal.findUnique({where:{id},include:{user:{select:{id:true,name:true,username:true,email:true,emailVerifiedAt:true,createdAt:true,country:true,withdrawalRestricted:true,withdrawalRestrictionReason:true,wallet:true}}}});
  if(!row) throw new WalletError('Withdrawal not found',404);
  const [history,earnings,audit]=await Promise.all([
    prisma.transaction.findMany({where:{userId:row.userId},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*50,take:51,select:{id:true,txnRef:true,exTxnRef:true,category:true,type:true,amount:true,currency:true,source:true,gateway:true,status:true,description:true,createdAt:true,senderId:true,recipientId:true}}),
    prisma.transaction.groupBy({by:['category','type','source'],where:{userId:row.userId,currency:'COINS',status:'COMPLETED'},_sum:{amount:true}}),
    prisma.withdrawalAdminEvent.findMany({where:{OR:[{withdrawalId:id},{userId:row.userId}]},orderBy:{createdAt:'desc'},take:50}),
  ]);
  return {...withdrawalView(row),destination:row.destination,providerId:row.providerId,stage:row.stage,user:{...row.user,wallet:row.user.wallet?{coins:row.user.wallet.coins.toNumber(),bonus:row.user.wallet.bonus.toNumber(),credit:row.user.wallet.credit.toNumber(),isLocked:row.user.wallet.isLocked}:null},canDecide:row.stage==='PREPARED'&&!row.providerId&&(!row.processingUntil||row.processingUntil<=new Date())&&['AWAITING_APPROVAL','BLOCKED'].includes(row.status),history:history.slice(0,50).map(txn=>({...txn,amount:txn.amount.toNumber()})),nextHistoryPage:history.length>50?page+1:null,earnings:earnings.map(group=>({...group,_sum:{amount:group._sum.amount?.toNumber()??0}})),audit};
}
export async function decideWithdrawal(actorId:string,id:string,decision:'APPROVE'|'REJECT',note:string,key:string) {
  await requireWithdrawalAdmin(actorId);if(note.trim().length<3||note.length>500) throw new WalletError('Record a reason for the withdrawal decision');
  const owner=await prisma.coinWithdrawal.findUnique({where:{id}});if(!owner) throw new WalletError('Withdrawal not found',404);
  if(owner.userId===actorId) throw new WalletError('You cannot approve or reject your own withdrawal',403);
  await walletOperation(`withdrawal-decision:${id}:${actorId}`,requestKey(key),{decision,note:note.trim()},[owner.userId],async tx=>{
    await requireWithdrawalAdmin(actorId,tx);
    await tx.$queryRaw`SELECT id FROM "CoinWithdrawal" WHERE id = ${id} FOR UPDATE`;
    const row=await tx.coinWithdrawal.findUniqueOrThrow({where:{id}});
    if(!['AWAITING_APPROVAL','BLOCKED'].includes(row.status)||row.stage!=='PREPARED'||row.providerId||(row.processingUntil&&row.processingUntil>new Date())) throw new WalletError('This request cannot be authorized or rejected; provider payouts must be reconciled',409);
    if(decision==='APPROVE') {
      const user=await tx.user.findUniqueOrThrow({where:{id:row.userId},include:{country:true,wallet:true}}),rates=await tx.chargeRate.findUniqueOrThrow({where:{id:'default'}});
      assertWithdrawalEligibility(user,rates);
      await assertWithdrawalOtpProof(row,user,tx);
      if(!row.otpVerifiedAt||user.country?.iso3!==row.country||row.amount.gt(row.country==='NGA'?rates.maxNgnWithdrawal:rates.maxWithdrawal)) throw new WalletError('Withdrawal authorization is no longer eligible',409);
      await tx.coinWithdrawal.update({where:{id},data:{processingUntil:null,processingAttempts:{increment:1},status:'RESERVED',approvedAt:new Date(),reviewedBy:actorId,reviewNote:note.trim()}});
    } else {
      const wallet=await tx.wallet.update({where:{userId:row.userId},data:{coins:{increment:row.coins}}});
      await tx.transaction.create({data:{txnRef:id,userId:row.userId,recipientId:row.userId,walletId:wallet.id,type:'CREDIT',amount:row.coins,source:'COINS',category:'COIN_WITHDRAWAL',gateway:row.gateway,currency:'COINS',status:'COMPLETED',description:'Withdrawal rejected — coins restored',metadata:{withdrawalId:id}}});
      await tx.transaction.updateMany({where:{txnRef:id,category:'COIN_WITHDRAWAL',type:'DEBIT'},data:{status:'FAILED',description:'Withdrawal rejected by administrator'}});
      await tx.coinWithdrawal.update({where:{id},data:{processingUntil:null,processingAttempts:{increment:1},status:'REJECTED',reviewedBy:actorId,reviewNote:note.trim(),completedAt:new Date()}});
    }
    await tx.withdrawalAdminEvent.create({data:{actorId,withdrawalId:id,userId:row.userId,action:decision,details:{note:note.trim(),coins:row.coins.toString(),amount:row.amount.toString(),currency:row.currency}}});
    return {id};
  });
  return withdrawalView(await prisma.coinWithdrawal.findUniqueOrThrow({where:{id}}));
}

async function assertWithdrawalOtpProof(row:CoinWithdrawal,user:{email:string;passwordChangedAt?:Date|null},db:Prisma.TransactionClient|typeof prisma) {
  if(!row.otpVerifiedAt||!row.otpChallengeId) throw new WithdrawalBlockedError('Email authorization is required before payout',403);
  const action=await db.authEmailToken.findUnique({where:{id:row.otpChallengeId}});
  if(!action||!action.usedAt||action.subjectId!==row.id||action.userId!==row.userId||action.purpose!=='WITHDRAWAL_OTP'||action.recipientHash!==hashEmailToken(user.email)||
    (user.passwordChangedAt&&action.createdAt<=user.passwordChangedAt)) throw new WithdrawalBlockedError('Email or credentials changed after withdrawal authorization; request a fresh withdrawal',403);
}
