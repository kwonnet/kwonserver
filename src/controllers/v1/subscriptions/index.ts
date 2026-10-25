
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
        
        if(payload.currency === TxnCurrencyEnum.COINS){
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

export async function accountBenefitsController(req:Request,res:Response) {
 res.setHeader('Cache-Control','private, no-store');
 try {const {getAccountBenefits}=await import('@/services/v1/subscriptions/benefits');return res.json(await getAccountBenefits(String(req.user!.id)));}
 catch {return res.status(503).send('Account benefits unavailable');}
}

// All prices, recipients and eligibility are resolved from the authenticated account.
import { z } from 'zod/v3';
import { WalletError } from '@/services/walletLedger';
import * as subscriptions from '@/services/v1/subscriptions';
const checkoutInput = z
  .object({
    planId: z.string().min(1).max(100),
    tierId: z.string().max(100).optional(),
    billingCycle: z.enum(['MONTHLY', 'YEARLY']),
    gateway: z.enum(['WALLET', 'FLUTTERWAVE', 'BACHS']),
    recurring: z.boolean(),
    currency: z.enum(['USD', 'NGN']).optional(),
    changeId: z.string().max(100).optional(),
    offerId: z.string().max(100).optional(),
    quotedCoins: z.number().finite().positive().optional(),
  })
  .strict();
const offerInput = z
  .object({
    planId: z.string().min(1).max(100),
    tierId: z.string().max(100).optional(),
    userId: z.string().min(1).max(100).optional(),
    countryIso3: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    days: z.union([z.literal(7), z.literal(14)]),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
function subscriptionFailure(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).send('Invalid subscription selection');
  if (error instanceof WalletError) return res.status(error.status).send(error.message);
  return res.status(503).send('Subscriptions are temporarily unavailable. Please try again.');
}
export async function subscriptionCatalogController(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    return res.json(await subscriptions.getSubscriptionCatalog(req.user!.id));
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}
export async function subscriptionCheckoutController(req: Request, res: Response) {
  try {
    return res.json(
      await subscriptions.createSubscriptionCheckout(
        req.user!.id,
        checkoutInput.parse(req.body),
        req.get('Idempotency-Key') ?? '',
      ),
    );
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}
export async function subscriptionCheckoutStatusController(req: Request, res: Response) {
  try {
    return res.json(
      await subscriptions.getSubscriptionCheckoutStatus(
        req.user!.id,
        String(req.params.id),
        typeof req.query.paymentId === 'string' ? req.query.paymentId : undefined,
      ),
    );
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}
export async function subscriptionAdminController(req: Request, res: Response) {
  if (!['ADMIN', 'SUPER'].includes(String(req.user?.role)))
    return res.status(403).send('Administrator access required');
  try {
    if (req.method === 'GET') return res.json(await subscriptions.subscriptionAdministration());
    if (req.params.id)
      return res.json(await subscriptions.disableSubscriptionTrialOffer(String(req.params.id)));
    return res
      .status(201)
      .json(
        await subscriptions.createSubscriptionTrialOffer(req.user!.id, offerInput.parse(req.body)),
      );
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}
export async function flutterwaveSubscriptionWebhookController(req: Request, res: Response) {
  if (!subscriptions.verifyFlutterwaveSubscriptionSignature(req.get('verif-hash')))
    return res.status(401).end();
  try {
    await subscriptions.processSubscriptionWebhook('FLUTTERWAVE', req.body);
    return res.json({ received: true });
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}

export async function subscriptionChangeQuoteController(req: Request, res: Response) {
  try {
    return res.json(
      await subscriptions.quoteSubscriptionPlanChange(req.user!.id, checkoutInput.parse(req.body)),
    );
  } catch (error) {
    return subscriptionFailure(res, error);
  }
}
