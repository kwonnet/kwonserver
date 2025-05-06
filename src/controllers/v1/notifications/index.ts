import { subscribePushNotification } from "@/services/v1/notifications";
import { AuthUser, RequestWithUser } from "@/types"
import { Response } from "express"


export const subscribePushNotifController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  console.log(req.body)

//   const zodResult = validateZodInput(req.body, TmaSubscriptionInvoiceZodSchema);

//   const zodData = zodResult.data

//   if (!zodData) return res.status(400).send(zodResult.message);

  // generate invoice
//   const providerToken = zodData.gateway === TmaPaymentGateway.SMART_GLOCAL ? smartGlocalApiKey : zodData.gateway === TmaPaymentGateway.UNLIMINT ? unlimintApiKey : ""
  const result = await subscribePushNotification(req.body, user)
  return res.status(result.status).send(result.data);

};