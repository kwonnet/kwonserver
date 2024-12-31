import { FlutterwaveConfigZodSchema, VerifyFlwPaymentZodSchema } from "@/schema";
import { purchaseCoinsWithFlutterwave } from "@/services/coins";
import { generateFlutterwavePaymentLink, verifyFlutterwavePayment } from "@/services/payments"
import { purchaseAppSubscription } from "@/services/subscriptions";
import { AuthUser, FlutterwaveAppSubPurchase, FlutterwaveCoinPurchase, FlutterwaveTxnType, RequestWithUser } from "@/types"
import { validateZodInput } from "@/utils";
import { getHtmlText } from "@/utils/html";
import { Request, Response } from "express"


export const getPaymentLinkController = async(req: RequestWithUser, res: Response) => {
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
    try {
        const zodResult = validateZodInput(req.query, VerifyFlwPaymentZodSchema)

        const query = zodResult.data

        if(!query){
            return res.status(400).send(getHtmlText(false,zodResult.message))
        }

        const result = await verifyFlutterwavePayment(query)

        if(result.status !== 200 || !result.data){
            return res.status(result.status).send(getHtmlText(false,result.message))
        }
        // check if the payment is for coin purchase
        const coinPayload = result.data as FlutterwaveCoinPurchase
        if(coinPayload.meta.type === FlutterwaveTxnType.COIN_PACKAGE){
            const result2 = await purchaseCoinsWithFlutterwave(coinPayload)
            const isSuccess = result2.status === 200
            const msg = !isSuccess ? String(result2.data) : "Transaction verified successfully and your wallet is credited respectively!"
            return res.status(result2.status).send(getHtmlText(isSuccess, msg))
        }
        // handle subscription payment
        const subPayload = result.data as FlutterwaveAppSubPurchase
        const result2 = await purchaseAppSubscription(subPayload, subPayload.meta.userId )
        const isSuccess = result2.status === 200
        const msg = !isSuccess ? String(result2.data) : "Transaction verified successfully and your subscription is confirmed!"
        return res.status(result2.status).send(getHtmlText(isSuccess, msg))
    } catch (error:any) {
        return res.status(400).send(error?.message)
    }
}





