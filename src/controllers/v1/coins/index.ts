import { Request, Response } from "express";

import { getCoinPackages, purchaseCoinsWithToken, purchaseCoinsWithWallet } from "@/services/v1/coins";
import { validateZodInput } from "@/utils";
import { purchaseCoinsZodSchema } from "@/schema";
import { TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum } from "@prisma/client";

import { AuthUser } from "@/types/user";

export const getCoinsController = async (req: Request, res: Response) => {
  const result = await getCoinPackages();

  return res.status(result.status).send(result.data);
};

export const purchaseCoinsController = async (
  req: Request,
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
    // Purchase through a supported external payment method.
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
