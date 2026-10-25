import {z} from 'zod/v3';
import {WalletError,requestKey} from '@/services/walletLedger';
import {bachsConfigured,verifyBachsSignature} from '@/utils/bachs';
import {createBachsCoinCheckout,getBachsCheckoutStatus,reconcileBachsCheckout,processBachsWebhook} from '@/services/v1/payments';
import type {SessionUser} from '@/types/user';
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

        if (!['ADMIN','SUPER'].includes(String(req.user?.role))) return res.status(403).send('Administrator access required');
        const result = await syncFlwSubscriptionPlans()

        return res.status(result.status).send(result.data)

    } catch (error:any) {

        return res.status(500).send(error?.message)
    }
}



export async function bachsConfigController(_req:Request,res:Response) {
  return res.json({available:bachsConfigured()});
}
export async function createBachsCheckoutController(req:Request,res:Response) {
  try {
    if (!req.user?.id) return res.status(401).json({message:'Sign in before paying'});
    const parsed = z.object({packageId:z.string().min(1).max(128),currency:z.enum(['USD','NGN'])}).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({message:'Invalid coin package request'});
    const result = await createBachsCoinCheckout(req.user as SessionUser,{...parsed.data,key:requestKey(req.get('Idempotency-Key')),origin:req.get('Origin') ?? ''});
    return res.json(result);
  } catch(error) { return bachsHttpError(res,error); }
}
export async function bachsStatusController(req:Request,res:Response) {
  try {
    if (!req.user?.id) return res.status(401).json({message:'Sign in to view your payment'});
    if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.status(400).json({message:'Invalid order ID'});
    // GET reads the receipt; POST refreshes it from Bachs.
    const result = req.method === 'POST'
      ? await reconcileBachsCheckout(req.params.id,req.user.id)
      : await getBachsCheckoutStatus(req.params.id,req.user.id);
    return res.json(result);
  } catch(error) { return bachsHttpError(res,error); }
}
export async function bachsWebhookController(req:Request,res:Response) {
  // Verify the original bytes before parsing JSON.
  if (!verifyBachsSignature(req.body,req.get('X-Bachs-Signature'),req.get('X-Bachs-Timestamp'),req.get('X-Bachs-Signature-V2'))) return res.status(400).json({message:'Invalid webhook signature'});
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.status(400).json({message:'Invalid webhook payload'}); }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return res.status(400).json({message:'Invalid webhook event'});
  try { await processBachsWebhook(event); return res.json({received:true}); }
  // A temporary failure lets Bachs retry delivery.
  catch { return res.status(503).json({message:'Webhook processing temporarily unavailable'}); }
}
function bachsHttpError(res:Response,error:unknown) {
  return res.status(error instanceof WalletError ? error.status : 503).json({message:error instanceof WalletError ? error.message : 'Payment service unavailable. Retry the same checkout.'});
}
