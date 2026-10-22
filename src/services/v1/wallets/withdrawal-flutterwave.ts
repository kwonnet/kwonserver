import {Prisma,CoinWithdrawal} from '@prisma/client';
import {WalletError} from '@/services/walletLedger';
import {withdrawalStep,WithdrawalDestination,WithdrawalPlan,WithdrawalOutcome,SaveWithdrawal,payoutRequest,decimal,providerId,requireProviderBalance,availableBalance,cryptoRoutes,resolveWithdrawalBank} from './withdrawal-provider';

async function transferFee(amount:Prisma.Decimal,currency:string,crypto:boolean,debitCurrency?:string) {
  const fees=await payoutRequest('FLUTTERWAVE',`/transfers/fee?amount=${amount.toString()}&currency=${encodeURIComponent(currency)}&type=${crypto?'crypto':'account'}${crypto&&debitCurrency&&debitCurrency!==currency?`&debit_currency=${encodeURIComponent(debitCurrency)}`:''}`);
  const fee=Array.isArray(fees)?fees.find((f:any)=>f.currency===currency):null;
  if(!fee) throw new WalletError('Could not verify Flutterwave payout fees',503);
  return fee;
}
async function usdFunding(receiveAmount:Prisma.Decimal,currency:string) {
  const cost=await payoutRequest('FLUTTERWAVE',`/transfers/rates?amount=${receiveAmount.toString()}&destination_currency=${currency}&source_currency=USD`);
  if(cost.source?.currency!=='USD'||cost.destination?.currency!==currency||!decimal(cost.destination.amount).eq(receiveAmount))throw new WalletError('Could not verify payout funding requirement',503);
  const fee=await transferFee(receiveAmount,currency,true,'USD');
  // Fiat-funded transfers charge fees separately in the debit wallet.
  if(fee.fee_amount_in_fiat_currency==null)throw new WalletError('Could not verify USD payout fees',503);
  const sourceRequired=decimal(cost.source.amount).add(decimal(fee.fee_amount_in_fiat_currency,true)).toDecimalPlaces(2,Prisma.Decimal.ROUND_UP);
  await requireProviderBalance('FLUTTERWAVE','USD',sourceRequired);
  return sourceRequired;
}
export async function prepareFlutterwaveWithdrawal(amount:Prisma.Decimal,destination:WithdrawalDestination):Promise<WithdrawalPlan> {
  return await withdrawalStep<WithdrawalPlan>("provider.preparation", {gateway: "FLUTTERWAVE", destinationType: destination.type}, async () => {
  let debitCurrency='NGN',fiatFeesSeparate=false;
  let currency='NGN',accountBank:string,accountNumber:string,beneficiaryName:string|undefined;
  let transferAmount=amount,receiveAmount=amount,sourceRequired:Prisma.Decimal;
  if(destination.type==='bank') {
    const resolved=await resolveWithdrawalBank('FLUTTERWAVE',destination.bankCode,destination.accountNumber);
    beneficiaryName=resolved.accountName; accountBank=destination.bankCode;accountNumber=destination.accountNumber;
    const fee=await transferFee(amount,currency,false);
    const extra=fee.fee_type==='percentage'?amount.mul(decimal(fee.fee,true)).div(100):decimal(fee.fee,true);
    sourceRequired=amount.add(extra).toDecimalPlaces(2,Prisma.Decimal.ROUND_UP);
  } else {
    const route=cryptoRoutes.FLUTTERWAVE.find(r=>r.id===destination.asset)!;
    currency=route.asset;accountBank=route.network;accountNumber=destination.address;
    const rates=await payoutRequest('FLUTTERWAVE',`/transfers/rates?amount=1&destination_currency=${currency}&source_currency=USD`);
    if(rates.source?.currency!=='USD' || rates.destination?.currency!==currency) throw new WalletError('Could not verify crypto exchange rate',503);
    const rate=decimal(rates.rate);
    receiveAmount=amount.mul(rate).toDecimalPlaces(6,Prisma.Decimal.ROUND_DOWN);
    transferAmount=receiveAmount;
    // Flutterwave deducts stablecoin fees from the transfer; gross them up so Kwonnet pays.
    for(let attempt=0;attempt<4;attempt++) {
      const fee=await transferFee(transferAmount,currency,true);
      const extra=fee.amount_minus_fee!=null?transferAmount.sub(decimal(fee.amount_minus_fee,true)):fee.fee_amount_in_crypto_currency!=null?decimal(fee.fee_amount_in_crypto_currency,true):
        fee.fee_type==='percentage'?transferAmount.mul(decimal(fee.fee,true)).div(100):decimal(fee.fee,true);
      if(extra.isNegative()) throw new WalletError('Invalid crypto transfer fee',503);
      const next=receiveAmount.add(extra).toDecimalPlaces(6,Prisma.Decimal.ROUND_UP);
      if(next.sub(transferAmount).abs().lte('0.000001')) {transferAmount=next;break;}
      transferAmount=next;
      if(attempt===3) throw new WalletError('Could not obtain a stable crypto fee quote',503);
    }
    // Stablecoin fees are deducted from this gross transfer amount, so the
    // matching stablecoin wallet funds both the user's payout and our fee.
    sourceRequired=transferAmount;
    debitCurrency=currency;
    if((await availableBalance('FLUTTERWAVE',currency,undefined,true)).lt(sourceRequired)) {
      sourceRequired=await usdFunding(receiveAmount,currency);
      transferAmount=receiveAmount;debitCurrency='USD';fiatFeesSeparate=true;
    }
  }
  await requireProviderBalance('FLUTTERWAVE',debitCurrency,sourceRequired);
  return {receiveAmount:receiveAmount.toString(),receiveCurrency:currency,expiresAt:new Date(Date.now()+60000),data:{sourceRequired:sourceRequired.toString(),fiatFeesSeparate,
    request:{account_bank:accountBank,account_number:accountNumber,amount:transferAmount.toNumber(),currency,debit_currency:debitCurrency,
      ...(beneficiaryName?{beneficiary_name:beneficiaryName}:{}),narration:'Kwonnet coin withdrawal',skip_beneficiary_creation:"1"}}};
  });
}
export function flutterwaveWithdrawalOutcome(row:CoinWithdrawal,data:any):WithdrawalOutcome {
  const plan=row.providerData as any, body=plan.request;
  if(data.reference!==row.id || String(data.account_number)!==body.account_number || data.bank_code!==body.account_bank || data.currency!==body.currency ||
      (data.debit_currency!=null && data.debit_currency!==body.debit_currency) || !decimal(data.amount).eq(body.amount) ||
      (row.providerId && String(data.id)!==row.providerId)) throw new WalletError('Payout response does not match this withdrawal',409);
  const status=String(data.status).toUpperCase();
  return {id:providerId(data.id),status:status==='SUCCESSFUL'?'SUCCEEDED':status==='FAILED'?'FAILED':'PROCESSING'};
}
export async function runFlutterwaveWithdrawal(row:CoinWithdrawal,save:SaveWithdrawal,guard?:()=>Promise<void>):Promise<WithdrawalOutcome> {
  return await withdrawalStep<WithdrawalOutcome>("provider.dispatch", {gateway: "FLUTTERWAVE", withdrawalId: row.id, stage: row.stage}, async () => {
  let plan=row.providerData as any;
  let response:any;
  if(row.providerId) response=await payoutRequest('FLUTTERWAVE',`/transfers/${encodeURIComponent(row.providerId)}`);
  else if(row.stage==='PREPARED') {
    if(row.expiresAt.getTime()<=Date.now()) return {status:'FAILED'};
    if(plan.request.currency!=='NGN'&&plan.request.debit_currency===plan.request.currency&&
       (await availableBalance('FLUTTERWAVE',plan.request.currency,undefined,true)).lt(decimal(plan.sourceRequired))) {
      plan={...plan,fiatFeesSeparate:true,request:{...plan.request,debit_currency:'USD',amount:decimal(row.receiveAmount).toNumber()}};
    }
    if(!plan.fiatFeesSeparate)await requireProviderBalance('FLUTTERWAVE',plan.request.debit_currency,decimal(plan.sourceRequired));
    if(plan.fiatFeesSeparate) {
      plan={...plan,sourceRequired:(await usdFunding(decimal(row.receiveAmount),plan.request.currency)).toString()};
      if(!decimal(plan.request.amount).eq(decimal(row.receiveAmount)))throw new WalletError('Payout amount does not match this withdrawal',409);
    } else if(plan.request.currency!=='NGN') {
      const amount=decimal(plan.request.amount),fee=await transferFee(amount,plan.request.currency,true,plan.request.debit_currency);
      const extra=fee.amount_minus_fee!=null?amount.sub(decimal(fee.amount_minus_fee,true)):fee.fee_amount_in_crypto_currency!=null?decimal(fee.fee_amount_in_crypto_currency,true):
        fee.fee_type==='percentage'?amount.mul(decimal(fee.fee,true)).div(100):decimal(fee.fee,true);
      if(extra.isNegative() || amount.sub(extra).lt(decimal(row.receiveAmount))) throw new WalletError('Crypto fees changed. Please review a fresh withdrawal quote.',409);
      if(plan.request.debit_currency===plan.request.currency) {
        await requireProviderBalance('FLUTTERWAVE',plan.request.currency,amount);
      } else {
        // Preserve the funding currency on existing, already-authorized fiat plans.
        const rates=await payoutRequest('FLUTTERWAVE',`/transfers/rates?amount=${amount.toString()}&destination_currency=${plan.request.currency}&source_currency=USD`);
        if(rates.source?.currency!=='USD' || rates.destination?.currency!==plan.request.currency || !decimal(rates.destination.amount).eq(amount)) throw new WalletError('Could not verify current payout funding',503);
        const fiatFee=fee.fee_amount_in_fiat_currency!=null?decimal(fee.fee_amount_in_fiat_currency,true):extra.div(decimal(rates.rate));
        await requireProviderBalance('FLUTTERWAVE','USD',decimal(rates.source.amount).add(fiatFee));
      }
    } else {
      const fee=await transferFee(decimal(plan.request.amount),'NGN',false);
      const extra=fee.fee_type==='percentage'?decimal(plan.request.amount).mul(decimal(fee.fee,true)).div(100):decimal(fee.fee,true);
      await requireProviderBalance('FLUTTERWAVE','NGN',decimal(plan.request.amount).add(extra));
    }
    if(guard) await guard();
    row=await save({stage:'PAYOUT_SUBMITTING',providerData:plan});
    response=await payoutRequest('FLUTTERWAVE','/transfers',{...plan.request,reference:row.id},row.id);
  } else {
    // A lost POST response is reconciled by the unique reference, never sent again blindly.
    const transfers=await payoutRequest('FLUTTERWAVE',`/transfers?reference=${encodeURIComponent(row.id)}`);
    if(!Array.isArray(transfers)) throw new WalletError('Could not reconcile payout',503);
    response=transfers.find((item:any)=>item.reference===row.id);
    if(!response) return {status:'PROCESSING'};
  }
  const result=flutterwaveWithdrawalOutcome(row,response);
  if(result.id && !row.providerId) await save({providerId:result.id,stage:'PAYOUT_ACCEPTED'});
  return result;
  });
}
