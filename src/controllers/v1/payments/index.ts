import { FlutterwaveConfigZodSchema, VerifyFlwPaymentZodSchema } from "@/schema";
import { purchaseCoinsWithFlutterwave } from "@/services/v1/coins";
import { generateFlutterwavePaymentLink, syncFlwSubscriptionPlans, verifyFlutterwavePayment } from "@/services/v1/payments"
import { purchaseAppSubscription } from "@/services/v1/subscriptions";
import { FlutterwaveAppSubPurchase, FlutterwaveCoinPurchase, FlutterwaveTxnType } from "@/types"
import { validateZodInput } from "@/utils";
import { getHtmlText } from "@/utils/html";
import { Response } from "express";
import type {Request} from "@/types/express";export const getPaymentLinkController = async(req: Request, res: Response) => {
    try {
        const zodResult = validateZodInput(req.body, FlutterwaveConfigZodSchema)

        const config = zodResult.data

        if(!config){
            return res.status(400).send(zodResult.message)
        }

        const result = await generateFlutterwavePaymentLink(config)

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(400).send(error?.message)
    }
}


export const verifyFlwPaymentController = async(req: Request, res: Response) => {
    const isPOST = req.method === "POST"
    try {
        
        const payload = isPOST ? req.body : req.query

        const zodResult = validateZodInput(payload, VerifyFlwPaymentZodSchema)

        const query = zodResult.data

        if(!query){
            return res.status(400).send(isPOST ? zodResult.message : getHtmlText(false,zodResult.message))
        }

        const result = await verifyFlutterwavePayment(query)


        if(result.status !== 200 || !result.data){
            return res.status(result.status).send(isPOST ? result.message : getHtmlText(false,result.message))
        }
        // check if the payment is for coin purchase
        const coinPayload = result.data as FlutterwaveCoinPurchase
        if(coinPayload.meta.type === FlutterwaveTxnType.COIN_PACKAGE){
            const result2 = await purchaseCoinsWithFlutterwave(coinPayload)
            const isSuccess = result2.status === 200
            const msg = !isSuccess ? String(result2.data) : isPOST ? "Wallet credited": "Transaction verified successfully and your wallet is credited respectively!"
            return res.status(result2.status).send(isPOST ? msg : getHtmlText(isSuccess, msg))
        }
        // handle subscription payment
        const subPayload = result.data as FlutterwaveAppSubPurchase
        const result2 = await purchaseAppSubscription(subPayload, subPayload.meta.userId )
        const isSuccess = result2.status === 200
        const msg = !isSuccess ? String(result2.data) : isPOST ? "Subscription confirmed": "Transaction verified successfully and your subscription is confirmed!"
        return res.status(result2.status).send(isPOST ? msg : getHtmlText(isSuccess, msg))
    } catch (error:any) {
        return res.status(400).send(isPOST ? error?.message : getHtmlText(false, error?.message))
    }
}

export const syncFlwSubscriptionPlansController = async(req: Request, res: Response) => {
    try {

        const result = await syncFlwSubscriptionPlans()

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send(error?.message)
    }
}


