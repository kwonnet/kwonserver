import {createHash} from 'node:crypto';
import {Prisma,CoinWithdrawal} from '@prisma/client';
import prisma from '@/db';
import {logServiceError} from '@/logger/events';
import {WalletError} from '@/services/walletLedger';
import {WithdrawalDestination,WithdrawalPlan,WithdrawalOutcome,SaveWithdrawal,payoutRequest,decimal,providerId,requireProviderBalance,availableBalance,withdrawalEnvironment,resolveWithdrawalBank} from './withdrawal-provider';

async function recipient(userId:string,destination:WithdrawalDestination,key:string) {
  const user=await prisma.user.findUniqueOrThrow({where:{id:userId},include:{country:true}});
  const environment=withdrawalEnvironment('BACHS');
  const id=createHash('sha256').update(`withdrawal-recipient:${userId}:${environment}`).digest('hex');
  const record=await prisma.withdrawalRecipient.upsert({where:{id},create:{id,userId,environment,profile:{contact_email:user.email,display_name:user.name,country:user.country!.iso2,entity_type:'individual',
    configuration:{recipient:{capabilities:{transfers:{requested:true},payouts:{requested:true}}}}}},update:{}});
  let accountId=record.providerId;
  if(!accountId) {
    if(Date.now()-record.createdAt.getTime()>23*3600000) throw new WalletError('Bachs recipient setup needs review. Please contact support.',409);
    const created=await payoutRequest('BACHS','/accounts',record.profile as object,`recipient-${id}`);
    accountId=providerId(created.id);
    await prisma.withdrawalRecipient.update({where:{id},data:{providerId:accountId}});
  }
  const name=user.name.trim().split(/\s+/);
  if(name.length<2) throw new WalletError('Add your full legal name to your profile before withdrawing');
  let details:Record<string,unknown>;
  if(destination.type==='bank') {
    const {accountName}=await resolveWithdrawalBank('BACHS',destination.bankCode,destination.accountNumber);
    details={type:'bank_account',currency:'NGN',bank_code:destination.bankCode,account_number:destination.accountNumber,account_name:accountName};
  } else details={type:'crypto_wallet',currency:destination.asset,asset:destination.asset,wallet_address:destination.address};
  await payoutRequest('BACHS',`/accounts/${encodeURIComponent(accountId)}`,{...(destination.type==='bank'?{balance_currencies:{NGN:true}}:{}),fields:{persons:[{first_name:name[0],last_name:name.slice(1).join(' '),relationship:{representative:true}}],payout_destination:details}},`${key}-onboard`);
  const account=await payoutRequest('BACHS',`/accounts/${encodeURIComponent(accountId)}`);
  if(account.id!==accountId || account.capabilities?.transfers?.status!=='active' || account.capabilities?.payouts?.status!=='active') throw new WalletError('Bachs needs to approve your recipient account before withdrawal. Your coins have not been deducted.',409);
  const destinations=await payoutRequest('BACHS','/payouts/destinations',undefined,undefined,accountId);
  if(!Array.isArray(destinations.items)) throw new WalletError('Could not verify Bachs payout destinations',503);
  let saved=destinations.items.find((d:any)=>d.currency===details.currency && (destination.type==='bank'?
    d.account_number===destination.accountNumber && d.bank_code===destination.bankCode:d.wallet_address===destination.address));
  if(!saved) {
    const {asset,...payload}=details;
    saved=await payoutRequest('BACHS','/payouts/destinations',payload,`${key}-destination`,accountId);
  }
  if(saved.is_usable!==true) throw new WalletError('Bachs has not approved this destination yet. Your coins have not been deducted.',409);
  return {accountId,destinationId:providerId(saved.id),accountName:saved.account_name};
}
export async function prepareBachsWithdrawal(userId:string,amount:Prisma.Decimal,gross:Prisma.Decimal,destination:WithdrawalDestination,key:string):Promise<WithdrawalPlan> {
  const platform=await payoutRequest('BACHS','/accounts/me');
  const platformId=providerId(platform.id);
  if(platform.capabilities?.connect?.status!=='active') throw new WalletError('Bachs Connect must be enabled for Kwonnet before user withdrawals are available',503);
  const {accountId,destinationId,accountName}=await recipient(userId,destination,key);
  let receiveAmount=amount.toFixed(2),receiveCurrency='NGN',expiresAt=new Date(Date.now()+60000);
  let sourceAmount=amount,quoteId:string|undefined;
  if(destination.type==='crypto') {
    receiveCurrency=destination.asset;
    // The provider quote is authoritative. Compensate any deducted fee, rather than reducing the user's value.
    for(let attempt=0;attempt<5;attempt++) {
      const quote=await payoutRequest('BACHS','/payouts/quotes',{from_currency:'USD',to_currency:destination.asset,amount:sourceAmount.toFixed(2),payout_method:'CRYPTO'},`${key}-quote-${attempt}`,accountId);
      if(quote.from_currency!=='USD' || quote.to_currency!==destination.asset || !decimal(quote.from_amount).eq(sourceAmount)) throw new WalletError('Could not verify Bachs conversion quote',503);
      const rate=decimal(quote.exchange_rate),received=decimal(quote.to_amount),target=amount.mul(rate).toDecimalPlaces(6,Prisma.Decimal.ROUND_DOWN);
      if(received.gte(target)) {receiveAmount=received.toString();quoteId=providerId(quote.quote_id);expiresAt=new Date(quote.expires_at);break;}
      sourceAmount=sourceAmount.add(target.sub(received).div(rate)).toDecimalPlaces(2,Prisma.Decimal.ROUND_UP);
      if(attempt===4) throw new WalletError('Could not obtain a crypto quote including provider fees',503);
    }
  }
  if(!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime()<=Date.now()+10000) throw new WalletError('The payout quote expired. Please request a fresh quote.',409);
  // The exchange fee supplies a platform-funded buffer for fees charged on top; never charge extra coins.
  const fundingAmount=Prisma.Decimal.max(gross,sourceAmount.add(gross.sub(amount))).toDecimalPlaces(2,Prisma.Decimal.ROUND_UP);
  await requireProviderBalance('BACHS',destination.type==='bank'?'NGN':'USD',fundingAmount);
  return {receiveAmount,receiveCurrency,expiresAt,data:{platformId,accountId,destinationId,...(accountName?{accountName}:{}),fundingAmount:fundingAmount.toFixed(2),
    request:{destination:destinationId,...(quoteId?{quote_id:quoteId}:{amount:amount.toFixed(2)}),reference:key},sourceAmount:sourceAmount.toFixed(2)}};
}
function transferMatches(data:any,row:CoinWithdrawal,amount:Prisma.Decimal,reverse=false) {
  const plan=row.providerData as any;
  if(!decimal(data.amount).eq(amount) || data.currency!==row.currency || data.transfer_group!==row.id ||
    (reverse?data.source!==plan.accountId||data.destination!==plan.platformId:data.destination!==plan.accountId||data.source!==plan.platformId)) throw new WalletError('Bachs funding response does not match withdrawal',409);
  providerId(data.id);
  return data.status==='paid';
}
export function bachsWithdrawalOutcome(row:CoinWithdrawal,data:any):WithdrawalOutcome {
  const plan=row.providerData as any;
  if(data.reference!==row.id || data.destination!==plan.destinationId || data.currency!==row.receiveCurrency || data.source_currency!==row.currency ||
    !decimal(data.amount).eq(row.receiveAmount) || (row.providerId && String(data.id)!==row.providerId)) throw new WalletError('Bachs payout response does not match withdrawal',409);
  return {id:providerId(data.id),status:data.status==='completed'?'SUCCEEDED':data.status==='failed'?'FAILED':'PROCESSING'};
}
async function recover(row:CoinWithdrawal,save:SaveWithdrawal,proposed:Prisma.Decimal) {
  let plan=row.providerData as any;
  if(plan.recovered) return;
  const amount=plan.recoveryAmount!=null?decimal(plan.recoveryAmount,true):proposed;
  if(amount.isZero()) {await save({providerData:{...plan,recovered:true}});return;}
  if(plan.recoveryAmount==null) {
    await requireProviderBalance('BACHS',row.currency,amount,plan.accountId);
    row=await save({providerData:{...plan,recoveryAmount:amount.toFixed(2),recoveryStartedAt:new Date().toISOString()}});
    plan=row.providerData as any;
  } else if(Date.now()-new Date(plan.recoveryStartedAt).getTime()>23*3600000) throw new WalletError('Uncertain funding recovery requires review',409);
  // The persisted amount and key must stay identical even if the first response is lost.
  const response=await payoutRequest('BACHS','/transfers',{destination:'self',currency:row.currency,amount:amount.toFixed(2),transfer_group:row.id,description:'Kwonnet withdrawal funding recovery'},`${row.id}-recover`,plan.accountId);
  if(!transferMatches(response,row,amount,true)) throw new WalletError('Withdrawal funding recovery is pending',503);
  await save({providerData:{...plan,recovered:true}});
}
export async function runBachsWithdrawal(row:CoinWithdrawal,save:SaveWithdrawal,guard?:()=>Promise<void>):Promise<WithdrawalOutcome> {
  let plan=row.providerData as any;
  if(row.stage==='PREPARED' || row.stage==='FUNDING') {
    if(row.stage==='PREPARED' && row.expiresAt.getTime()<=Date.now()) return {status:'FAILED'};
    if(row.stage==='FUNDING' && Date.now()-row.createdAt.getTime()>23*3600000) throw new WalletError('Uncertain funding requires review',503);
    if(row.stage==='PREPARED') {
      await requireProviderBalance('BACHS',row.currency,decimal(plan.fundingAmount));
      if(guard) await guard();
      row=await save({stage:'FUNDING'});
    }
    const funding=await payoutRequest('BACHS','/transfers',{destination:plan.accountId,amount:plan.fundingAmount,currency:row.currency,transfer_group:row.id,description:'Kwonnet withdrawal funding'},`${row.id}-fund`);
    if(!transferMatches(funding,row,decimal(plan.fundingAmount))) return {status:'PROCESSING'};
    row=await save({stage:'FUNDED',providerData:{...plan,fundingId:providerId(funding.id)}});plan=row.providerData as any;
  }
  if(row.stage==='FUNDED') {
    if(row.expiresAt.getTime()<=Date.now()) {
      await recover(row,save,decimal(plan.fundingAmount));return {status:'FAILED'};
    }
    await requireProviderBalance('BACHS',row.currency,decimal(plan.fundingAmount),plan.accountId);
    if(guard) await guard();
    row=await save({stage:'PAYOUT_SUBMITTING'});
    let response:any;
    try {response=await payoutRequest('BACHS','/payouts',plan.request,row.id,plan.accountId);}
    catch(error) {
      logServiceError('v1/wallets/withdrawals','bachs.payout.submit',error,false,{withdrawalId:row.id});
      // An authoritative rejection can be compensated only after its funding returns.
      const {WithdrawalProviderError}=await import('./withdrawal-provider');
      if(error instanceof WithdrawalProviderError && error.definitive) {
        row=await save({stage:'RECOVERING',providerData:{...plan,failedBeforePayout:true}});
        await recover(row,save,decimal(plan.fundingAmount));return {status:'FAILED'};
      }
      throw error;
    }
    const result=bachsWithdrawalOutcome(row,response);
    row=await save({providerId:result.id,stage:'PAYOUT_ACCEPTED'});
  }
  if(row.stage==='RECOVERING') {
    await recover(row,save,decimal(plan.fundingAmount));return {status:'FAILED'};
  }
  let data:any;
  if(row.providerId) data=await payoutRequest('BACHS',`/payouts/${encodeURIComponent(row.providerId)}`,undefined,undefined,plan.accountId);
  else {
    const payouts=await payoutRequest('BACHS','/payouts?limit=100',undefined,undefined,plan.accountId);
    if(!Array.isArray(payouts.items)) throw new WalletError('Could not reconcile payout',503);
    data=payouts.items.find((item:any)=>item.reference===row.id);
    if(!data) return {status:'PROCESSING'};
    row=await save({providerId:providerId(data.id),stage:'PAYOUT_ACCEPTED'});
  }
  const result=bachsWithdrawalOutcome(row,data);
  if(result.status!=='PROCESSING' && !(row.providerData as any).recovered) {
    const fee=decimal(data.fee,true),total=decimal(data.total_debited),funded=decimal(plan.fundingAmount);
    if(total.gt(funded) || total.lt(decimal(plan.sourceAmount))) throw new WalletError('Payout funding requires review',409);
    let recoverAmount=result.status==='SUCCEEDED'?funded.sub(total):funded.sub(fee);
    if(result.status==='FAILED' && (await availableBalance('BACHS',row.currency,plan.accountId)).gte(funded)) recoverAmount=funded;
    if(recoverAmount.isNegative()) throw new WalletError('Payout recovery requires review',409);
    await recover(row,save,recoverAmount);
  }
  return result;
}
