import { getCryptoWalletAddresses } from "@/services/v1/crypto";
import { Request, Response } from "express";

export const getWalletAddressesController = async(req: Request, res: Response) => {
    
    const result = await getCryptoWalletAddresses()

    return res.status(result.status).send(result.data)
}
 