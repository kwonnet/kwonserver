import { Response } from "express";
import { AuthUser, RequestWithUser } from "@/types";
import {
  decryptString,
  encryptString,
  jwtSign,
  jwtVerify,
  validateZodInput,
} from "@/utils";
import { encrytionKey } from "@/config";
import {
  DailyBonusZodSchema,
  DailyTaskZodSchema,
  FundCoinsZodSchema,
  PaginateZodSchema,
  TransferCoinsZodSchema,
  UserWalletAddressZodSchema,
  WithdrawCoinsZodSchema,
} from "@/schema";
import {
  fundCoins,
  getTxnHistory,
  getUserCoinsWallet,
  rewardDailyTask,
  saveUserWalletAddress,
  transferCoins,
  updateWalletBonus,
  withdrawCoins,
} from "@/services/wallet";


export const getProofTokenController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;
  const token = encryptString(
    JSON.stringify(`${user.id}_${user.telId}`),
    encrytionKey
  );
  const jwtToken = jwtSign({ proof: token }, "10m");
  return res.status(200).send(jwtToken);
};

export const saveUserWalletAddressController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.body, UserWalletAddressZodSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const { token, ...rest } = zodResult.data;

    const jwtData = jwtVerify(token) as {
      proof: string;
      [key: string]: string;
    };

    const clientProof = decryptString(jwtData.proof, encrytionKey);

    const serverProof = `${user.id}_${user.telId}`;

    if (clientProof !== serverProof)
      return res
        .status(400)
        .send(
          "Invalid proof token, please disconnect your wallet and reconnect again"
        );
    // save user wallet address
    const result = await saveUserWalletAddress(rest, user);
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    console.log(error?.message);
    return res
      .status(500)
      .send(
        "Error: Please disconnect your wallet, close the app and try again"
      );
  }
};

export const getUserCoinsWalletController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const result = await getUserCoinsWallet(String(req.user?.id));
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res.status(500).send("Error: Failed to get wallet details: ");
  }
};

export const transferCoinsController = async (
  req: RequestWithUser,
  res: Response
) => {
  const zodResult = validateZodInput(req.body, TransferCoinsZodSchema);

  if (!zodResult.data) return res.status(400).send(zodResult.message);

  try {
    const result = await transferCoins(zodResult.data);
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const withdrawCoinsController = async (
  req: RequestWithUser,
  res: Response
) => {
  const zodResult = validateZodInput(
    {...req.body, userId: req.user?.id},
    WithdrawCoinsZodSchema
  );
  const zodData = zodResult.data
  if (!zodData) return res.status(400).send(zodResult.message);
  try {
    const result = await withdrawCoins(zodData);
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const fundCoinsController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(req.body, FundCoinsZodSchema);

  const zodData = zodResult.data;

  if (!zodData) return res.status(400).send(zodResult.message);

  if (zodData.amount < 1 && zodData.bonus < 1)
    return res.status(400).send("Amount or bonus must be greater than zero");

  try {
    const result = await fundCoins(zodData, user);
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const getTxnHistoryController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  const page = req.query.page ? parseInt(String(req.query.page)) : 1;

  const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;

  const zodResult = validateZodInput({ userId: user.id, page, limit }, PaginateZodSchema);

  const zodData = zodResult.data;

  if (!zodData) return res.status(400).send(zodResult.message);

  try {
    const result = await getTxnHistory(zodData);
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const claimDailyBonusController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(
    { userId: user.id, bonus: req.body.amount ?? 0 },
    DailyBonusZodSchema
  );

  const zodData = zodResult.data;

  if (!zodData) return res.status(400).send(zodResult.message);

  if (zodData.bonus >= 11)
    return res.status(400).send("Bonus amount is illegal");

  try {
    const result = await updateWalletBonus({ ...zodData, isTask: false });
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const claimDailyTaskController = async (
  req: RequestWithUser,
  res: Response
) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(
    req.body,
    DailyTaskZodSchema
  );

  const zodData = zodResult.data;

  console.log(zodData)

  if (!zodData) return res.status(400).send(zodResult.message);
  try {
    const result = await rewardDailyTask({...zodData, userId: user.id})
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};
