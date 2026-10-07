
import { IDZodSchema, purchasePremiumZodSchema } from "@/schema"
import { cancelAppSubscription, getPlans, purchaseAppSubscription, purchaseAppSubscriptionWithWallet } from "@/services/v1/subscriptions"
import { User } from "@/types"
import { validateZodInput } from "@/utils"
import { SubStatusEnum, TxnCurrencyEnum } from "@prisma/client"
import { Response } from "express";
import type {Request} from "@/types/express";import { AuthUser } from "@/types/user"

export const getSubscriptionPlansController = async(req: Request, res: Response) => {
    try {
        const result = await getPlans()

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send("Error: Unable to process request, please try again later")
    }
}

export const subscriptionPremiumController = async(req: Request, res: Response) => {
    try {
        const zodResult = validateZodInput(req.body, purchasePremiumZodSchema)
        
        if(!zodResult.data){
            return res.status(400).send("Invalid txn payload received, please contact support")
        }
        const payload = zodResult.data

        const user = req.user as AuthUser; 
        
        if(payload.currency === TxnCurrencyEnum.TZX){
            const result = await purchaseAppSubscriptionWithWallet({ ...payload, idempotencyKey: req.get("Idempotency-Key") }, user.id)
            return res.status(result.status).send(result.data)
        }
        const result = await purchaseAppSubscription(payload, user.id)
        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send("Error: Unable to process request, please try again later")
    }
}

export const cancelSubscriptionController = async(req: Request, res: Response) => {
    try {
        const zodResult = validateZodInput(req.body, IDZodSchema)
        
        if(!zodResult.data){
            return res.status(400).send("Invalid txn payload received, please contact support")
        }
        const payload = zodResult.data

        const user = req.user as User; 
        
        const result = await cancelAppSubscription({status: SubStatusEnum.CANCELLED, subId: payload.id, userId: user.id})

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send('Error: Unable to process request, please try again later')
    }
}
