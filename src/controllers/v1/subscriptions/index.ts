import { smartGlocalApiKey, unlimintApiKey } from "@/config"
import { IDZodSchema, purchasePremiumZodSchema, TmaSubscriptionInvoiceZodSchema } from "@/schema"
import { cancelAppSubscription, genTmaSubscriptionInvoice, getPlans, purchaseAppSubscription, purchaseAppSubscriptionWithWallet } from "@/services/v1/subscriptions"
import { TmaPaymentGateway, User } from "@/types"
import { validateZodInput } from "@/utils"
import { SubStatusEnum, TxnCurrencyEnum } from "@prisma/client"
import { Request, Response } from "express"
import { AuthUser } from "@/types/user"

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
            const result = await purchaseAppSubscriptionWithWallet(payload, user.id,)
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
        
        const result = await cancelAppSubscription({status: SubStatusEnum.CANCELLED, subId: payload.id})

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send('Error: Unable to process request, please try again later')
    }
}

export const getSubTmaInvoiceController = async (
  req: Request,
  res: Response
) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(req.body, TmaSubscriptionInvoiceZodSchema);

  const zodData = zodResult.data

  if (!zodData) return res.status(400).send(zodResult.message);

  console.log("Tma Invoice: ", zodData)
  // generate invoice
  const providerToken = zodData.gateway === TmaPaymentGateway.SMART_GLOCAL ? smartGlocalApiKey : zodData.gateway === TmaPaymentGateway.UNLIMINT ? unlimintApiKey : ""
  const result = await genTmaSubscriptionInvoice({
    ...zodData,
    providerToken
  }, user)
  return res.status(result.status).send(result.data);

};