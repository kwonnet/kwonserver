import { flutterwaveApiUrl, flutterwaveSecretKey } from "@/config"
import prisma from "@/db"
import { FlutterwaveAppSubPurchase, FlutterwaveCoinPurchase, FlutterwaveConfig, FlutterwaveTxnType, PlanTypeEnum } from "@/types"
import { flwAPI } from "@/utils/flutterwave"
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client"
import axios from "axios"

export const generateFlutterwavePaymentLink = async(config: FlutterwaveConfig) => {
    try {
        const response = await axios.post(flutterwaveApiUrl,config, { 
			headers: {
				Authorization: `Bearer ${flutterwaveSecretKey}`,
				'Content-Type': 'application/json',
			},
		})
        return {data: response.data.data.link, status: 200}
    } catch (error: any) {
        const status = error?.status ?? 500
        let message = error?.message
        if(error?.response?.data){
            message = error?.response?.data?.message ?? message
        }
        return {status, data: message}
    }
}

const coinsResponse = (txnData: any) => {
    const obj: FlutterwaveCoinPurchase = {
        id: String(txnData?.meta?.id),
        amount: Number(txnData?.meta?.amount),
        bonus: Number(txnData?.meta?.bonus),
        txnRef: String(txnData?.tx_ref),
        userId: String(txnData?.meta?.userId),
        gateway: TxnGatewayEnum.FLUTTERWAVE,
        source: TxnSourceEnum.FIAT,
        currency: String(txnData?.meta?.currency) as TxnCurrencyEnum,
        coin: {
            id: String(txnData?.meta?.id),
            name: String(txnData?.meta?.name),
            amount: Number(txnData?.meta?.amount),
            price: Number(txnData?.meta?.price),
            bonus: Number(txnData?.meta?.bonus),
            isActive: Boolean(txnData?.meta?.isActive),
        },
        meta: {
            userId: String(txnData?.meta?.userId),
            telId: String(txnData?.meta?.telId),
            currency: String(txnData?.meta?.currency),
            gateway: txnData?.meta?.gateway as TxnGatewayEnum,
            source: txnData?.meta?.source as TxnSourceEnum,
            type: String(txnData?.meta?.type) as FlutterwaveTxnType,
            txn: {
                txnRef: String(txnData?.tx_ref),
                txnId: String(txnData.id),
                amount: Number(txnData?.amount),
                currency: String(txnData?.meta?.currency),
            },
            customer: txnData?.customer,
      },}
      return obj
}

const subscriptionResponse = (txnData: any) => {
    const obj: FlutterwaveAppSubPurchase = {
        planId: String(txnData?.meta?.planId),
        amount: Number(txnData?.meta?.amount),
        gateway: txnData?.meta?.gateway as TxnGatewayEnum,
        source: txnData?.meta?.source as TxnSourceEnum,
        currency: String(txnData?.meta?.currency) as TxnCurrencyEnum,
        isRecurring: Boolean(txnData?.meta?.isRecurring),
        planType: String(txnData?.meta?.planType) as PlanTypeEnum,
        planName: String(txnData?.meta?.planName),

        meta: {
            type: String(txnData?.meta?.type) as FlutterwaveTxnType,
            planId: String(txnData?.meta?.planId),
            price: Number(txnData?.meta?.price),
            discount: Number(txnData?.meta?.discount),
            tierId: txnData?.meta?.tierId,
            amount: Number(txnData?.meta?.amount),
            planType: String(txnData?.meta?.planType) as PlanTypeEnum,
            userId: String(txnData?.meta?.userId),
            telId: String(txnData?.meta?.telId),
            currency: String(txnData?.meta?.currency),
            gateway: txnData?.meta?.gateway as TxnGatewayEnum,
            source: txnData?.meta?.source as TxnSourceEnum,
            txnRef: String(txnData?.tx_ref),
            txnId: String(txnData.id),
            customer: txnData?.customer,
      },}
      return obj
}

export const verifyFlutterwavePayment = async(arg: {
    status: string;
    tx_ref: string;
    transaction_id: string;
    [key: string]: any
}) => {
    try {
        const txn = await flwAPI.Transaction.verify({ id: arg.transaction_id });
        const txnData = txn.data
        const isSuccess = txnData.status === arg.status && txnData.tx_ref === arg.tx_ref
        if(!isSuccess) return { status: 400, message: "Verification failed as this transaction wasn't successful. But if you think this is a mistake, please contact support!", data: null}
        // check if transaction is already settled
        const tnxExists = await prisma.transaction.findFirst({where: { exTxnRef: arg.tx_ref}})
        if(tnxExists) return { message: "Transaction already settled", status: 400}
        // compose the respective type
        if(txnData?.meta?.type === FlutterwaveTxnType.COIN_PACKAGE){
            return { status: 200, message: "success", data: coinsResponse(txnData) }
        }
        return { status: 200, message: "success", data: subscriptionResponse(txnData) }
    } catch (error: any) {
        const status = error?.status ?? 500
        let message: string = error?.message
        if(error?.response?.data){
            message = error?.response?.data?.message ?? message
        }
        return {status, message, data: null}
    }
}

