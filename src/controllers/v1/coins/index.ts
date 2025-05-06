import { Request, Response } from "express";
import { AuthUser, RequestWithUser, TmaPaymentGateway, User } from "@/types";
import {
  getCoinPackages,
  getStarsCoinsInvoice,
  getTmaPaymentCoinsInvoice,
  purchaseCoinsWithToken,
  purchaseCoinsWithWallet,
} from "@/services/v1/coins";
import { validateZodInput } from "@/utils";
import { purchaseCoinsZodSchema, TmaInvoiceZodSchema } from "@/schema";
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";
import { smartGlocalApiKey, unlimintApiKey } from "@/config";


export const getTmaPaymentInvoiceController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  console.log(req.body)

  const zodResult = validateZodInput(req.body, TmaInvoiceZodSchema);

  const zodData = zodResult.data

  console.log(zodData)

  if (!zodData) return res.status(400).send(zodResult.message);
  // handle telegram stars
  if(zodData.gateway === TmaPaymentGateway.STARS){
    const result = await getStarsCoinsInvoice(zodData, user);
    return res.status(result.status).send(result.data);
  }
  // handle tma smart glocal & unlimint payment invoice generator
  const result = await getTmaPaymentCoinsInvoice({...zodData, providerToken: zodData.gateway === "SMART_GLOCAL" ? smartGlocalApiKey : unlimintApiKey}, user);
  return res.status(result.status).send(result.data);

};

export const getCoinsController = async (req: Request, res: Response) => {
  const result = await getCoinPackages();

  return res.status(result.status).send(result.data);
};

export const purchaseCoinsController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log("payload ", req.body)
    
    const zodResult = validateZodInput(req.body, purchaseCoinsZodSchema);

    if (!zodResult.data) {
      return res
        .status(400)
        .send("Invalid txn payload received, please contact support");
    }
    const payload = zodResult.data;

    const user = req.user as AuthUser;

    if (payload.currency === TxnCurrencyEnum.TZX) {
      const result = await purchaseCoinsWithWallet(
        {
          id: payload.packageId,
          currency: payload.currency,
          meta: payload.meta
        },
        user
      );
      return res.status(result.status).send(result.data);
    }
    // purchase with stars or TON or Fiat or USD or NGN
    const result = await purchaseCoinsWithToken(
      {
        id: payload.packageId,
        currency: payload.currency as TxnCurrencyEnum,
        gateway: payload?.meta?.gateway as TxnGatewayEnum,
        source: payload?.meta?.source as TxnSourceEnum,
        meta: payload.meta as any,
      },
      user
    );
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send(
        "Sorry an error occurred trying to process transaction, please try again later!"
      );
  }
};
