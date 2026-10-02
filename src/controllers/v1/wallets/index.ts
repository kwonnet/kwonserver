import { Request, Response } from "express";
import { validateZodInput } from "@/utils";
import { DailyBonusZodSchema, DailyTaskZodSchema, FundCoinsZodSchema, PaginateZodSchema, TransferCoinsZodSchema } from "@/schema";
import { fundCoins, getTxnHistory, getUserCoinsWallet, rewardDailyTask, transferCoins, updateWalletBonus } from "@/services/v1/wallets";
import { AuthUser } from "@/types/user";

export const getUserCoinsWalletController = async (
  req: Request,
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
  req: Request,
  res: Response
) => {
  const zodResult = validateZodInput({ ...req.body, senderId: req.user?.id }, TransferCoinsZodSchema);

  if (!zodResult.data) return res.status(400).send(zodResult.message);

  try {
    const result = await transferCoins(zodResult.data);
    return res.status(result.status).send(result.data ?? result.message);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const fundCoinsController = async (
  req: Request,
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
  req: Request,
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
  req: Request,
  res: Response
) => {
  const user = req.user as AuthUser;

  console.log(req.body)

  const zodResult = validateZodInput(
    { ...req.body, userId: user.id },
    DailyBonusZodSchema
  );

  const zodData = zodResult.data;

  console.log(zodData)

  if (!zodData) return res.status(400).send(zodResult.message);

  if (zodData.amount >= 11)
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
  req: Request,
  res: Response
) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(
    req.body,
    DailyTaskZodSchema
  );

  const zodData = zodResult.data;

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
