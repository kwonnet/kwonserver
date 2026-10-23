import { z } from "zod/v3";
import { WalletError } from "@/services/walletLedger";
import {
  listPurchases,
  getRefundQuote,
  requestPurchaseRefund,
  processPurchaseRefund,
} from "@/services/v1/wallets/refunds";
import { Response } from "express";
import type { Request } from "@/types/express";
import { validateZodInput } from "@/utils";
import {
  DailyBonusZodSchema,
  DailyTaskZodSchema,
  FundCoinsZodSchema,
  PaginateZodSchema,
  TransferCoinsZodSchema,
} from "@/schema";
import {
  fundCoins,
  getTxnHistory,
  getUserCoinsWallet,
  rewardDailyTask,
  transferCoins,
  updateWalletBonus,
} from "@/services/v1/wallets";
import { AuthUser } from "@/types/user";

export const getUserCoinsWalletController = async (
  req: Request,
  res: Response,
) => {
  try {
    const result = await getUserCoinsWallet(String(req.user?.id));
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res.status(500).send("Error: Failed to get wallet details: ");
  }
};

export const transferCoinsController = async (req: Request, res: Response) => {
  const zodResult = validateZodInput(
    { ...req.body, senderId: req.user?.id },
    TransferCoinsZodSchema,
  );

  if (!zodResult.data) return res.status(400).send(zodResult.message);

  try {
    const result = await transferCoins({
      ...zodResult.data,
      idempotencyKey: req.get("Idempotency-Key"),
    });
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const fundCoinsController = async (req: Request, res: Response) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(req.body, FundCoinsZodSchema);

  const zodData = zodResult.data;

  if (!zodData) return res.status(400).send(zodResult.message);

  if (zodData.amount < 1 && zodData.bonus < 1)
    return res.status(400).send("Amount or bonus must be greater than zero");

  try {
    const result = await fundCoins(
      { ...zodData, idempotencyKey: req.get("Idempotency-Key") },
      user,
    );
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

export const getTxnHistoryController = async (req: Request, res: Response) => {
  const user = req.user as AuthUser;

  const page = req.query.page ? parseInt(String(req.query.page)) : 1;

  const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;

  const zodResult = validateZodInput(
    { userId: user.id, page, limit },
    PaginateZodSchema,
  );

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
  res: Response,
) => {
  const user = req.user as AuthUser;

  console.log(req.body);

  const zodResult = validateZodInput(
    { ...req.body, userId: user.id },
    DailyBonusZodSchema,
  );

  const zodData = zodResult.data;

  console.log(zodData);

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

export const claimDailyTaskController = async (req: Request, res: Response) => {
  const user = req.user as AuthUser;

  const zodResult = validateZodInput(req.body, DailyTaskZodSchema);

  const zodData = zodResult.data;

  if (!zodData) return res.status(400).send(zodResult.message);
  try {
    const result = await rewardDailyTask({ ...zodData, userId: user.id });
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res
      .status(500)
      .send("Error: Failed to process request, please try again later");
  }
};

function refundError(res: Response, error: unknown) {
  return res
    .status(error instanceof WalletError ? error.status : 503)
    .json({
      message:
        error instanceof WalletError
          ? error.message
          : "Unable to process refund. Please try again.",
    });
}
export async function getPurchasesController(req: Request, res: Response) {
  try {
    return res.json(
      await listPurchases(
        String(req.user?.id),
        Number(req.query.page ?? 1),
        Number(req.query.limit ?? 20),
      ),
    );
  } catch (error) {
    return refundError(res, error);
  }
}
export async function getRefundQuoteController(req: Request, res: Response) {
  try {
    return res.json(await getRefundQuote(req.params.id, String(req.user?.id)));
  } catch (error) {
    return refundError(res, error);
  }
}
export async function requestRefundController(req: Request, res: Response) {
  const parsed = z
    .object({
      coinsDebit: z.number().finite().nonnegative(),
      bonusDebit: z.number().finite().nonnegative(),
      refundAddress: z.string().min(20).max(255).optional(),
      confirmCryptoNetwork: z.boolean().optional(),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid refund request" });
  try {
    return res.json(
      await requestPurchaseRefund(
        req.params.id,
        String(req.user?.id),
        parsed.data,
      ),
    );
  } catch (error) {
    return refundError(res, error);
  }
}
export async function refundStatusController(req: Request, res: Response) {
  try {
    return res.json(
      await processPurchaseRefund(req.params.id, String(req.user?.id)),
    );
  } catch (error) {
    return refundError(res, error);
  }
}

import {
  withdrawalSettings,
  quoteCoinWithdrawal,
  confirmCoinWithdrawal,
  listCoinWithdrawals,
  processCoinWithdrawal,
} from "@/services/v1/wallets";
import {
  withdrawalBanks,
  resolveWithdrawalBank,
} from "@/services/v1/wallets/withdrawal-provider";
const withdrawalGatewaySchema = z.enum(["FLUTTERWAVE", "BACHS"]);
const withdrawalDestinationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("bank"),
      bankCode: z.string().min(1).max(32),
      accountNumber: z.string().length(10),
    })
    .strict(),
  z
    .object({
      type: z.literal("crypto"),
      asset: z.string().min(1).max(32),
      address: z.string().min(20).max(255),
      confirmed: z.literal(true),
    })
    .strict(),
]);
function withdrawalError(res: Response, error: unknown) {
  return res
    .status(error instanceof WalletError ? error.status : 503)
    .json({
      message:
        error instanceof WalletError
          ? error.message
          : "Unable to process withdrawal. Retry the same request.",
    });
}
export async function withdrawalSettingsController(
  req: Request,
  res: Response,
) {
  try {
    return res.json(await withdrawalSettings(String(req.user?.id)));
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalBanksController(req: Request, res: Response) {
  const parsed = withdrawalGatewaySchema.safeParse(req.query.gateway);
  if (!parsed.success)
    return res.status(400).json({ message: "Choose a payout provider" });
  try {
    const settings = await withdrawalSettings(String(req.user?.id));
    if (!settings.nigerian)
      throw new WalletError("Bank withdrawals are available to Nigerian users");
    return res.json(await withdrawalBanks(parsed.data));
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function resolveWithdrawalBankController(
  req: Request,
  res: Response,
) {
  const parsed = z
    .object({
      gateway: withdrawalGatewaySchema,
      bankCode: z.string().min(1).max(32),
      accountNumber: z.string().length(10),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid bank account" });
  try {
    const settings = await withdrawalSettings(String(req.user?.id));
    if (!settings.nigerian)
      throw new WalletError("Bank withdrawals are available to Nigerian users");
    return res.json(
      await resolveWithdrawalBank(
        parsed.data.gateway,
        parsed.data.bankCode,
        parsed.data.accountNumber,
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function quoteCoinWithdrawalController(
  req: Request,
  res: Response,
) {
  const parsed = z
    .object({
      coins: z.number().finite().positive(),
      gateway: withdrawalGatewaySchema,
      destination: withdrawalDestinationSchema,
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid withdrawal request" });
  try {
    return res.json(
      await quoteCoinWithdrawal(String(req.user?.id), parsed.data),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function confirmCoinWithdrawalController(
  req: Request,
  res: Response,
) {
  const parsed = z.union([
    z.object({challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/)}).strict(),
    z.object({method: z.literal("AUTHENTICATOR"), code: z.string().regex(/^\d{6}$/)}).strict(),
  ]).safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Enter the six-digit withdrawal code" });
  try {
    return res.json(
      await confirmCoinWithdrawal(
        String(req.user?.id),
        req.params.id,
        req.get("Idempotency-Key")!,
        parsed.data,
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function listCoinWithdrawalsController(
  req: Request,
  res: Response,
) {
  try {
    return res.json(
      await listCoinWithdrawals(
        String(req.user?.id),
        req.query.page != null ? Number(req.query.page) : undefined,
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalStatusController(req: Request, res: Response) {
  try {
    return res.json(
      await processCoinWithdrawal(req.params.id, String(req.user?.id)),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}

import {
  requestWithdrawalOtp,
  getWithdrawalAdminPolicy,
  updateWithdrawalAdminPolicy,
  restrictUserWithdrawal,
  listWithdrawalAdminQueue,
  getWithdrawalAdminDetails,
  decideWithdrawal,
} from "@/services/v1/wallets";
export async function withdrawalOtpController(req: Request, res: Response) {
  if (!z.object({}).strict().safeParse(req.body).success)
    return res.status(400).json({ message: "Invalid code request" });
  try {
    return res.json(
      await requestWithdrawalOtp(String(req.user?.id), req.params.id),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalAdminPolicyController(
  req: Request,
  res: Response,
) {
  try {
    return res.json(await getWithdrawalAdminPolicy(String(req.user?.id)));
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function updateWithdrawalAdminPolicyController(
  req: Request,
  res: Response,
) {
  const parsed = z
    .object({
      withdrawalsEnabled: z.boolean(),
      maxWithdrawal: z.number().finite().positive(),
      maxNgnWithdrawal: z.number().finite().positive(),
      reviewWithdrawal: z.number().finite().positive(),
      reviewNgnWithdrawal: z.number().finite().positive(),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid withdrawal settings" });
  try {
    return res.json(
      await updateWithdrawalAdminPolicy(String(req.user?.id), parsed.data),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function restrictWithdrawalUserController(
  req: Request,
  res: Response,
) {
  const parsed = z
    .object({
      restricted: z.boolean(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Provide a restriction reason" });
  try {
    return res.json(
      await restrictUserWithdrawal(
        String(req.user?.id),
        req.params.id,
        parsed.data.restricted,
        parsed.data.reason,
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalAdminQueueController(
  req: Request,
  res: Response,
) {
  try {
    return res.json(
      await listWithdrawalAdminQueue(
        String(req.user?.id),
        Number(req.query.page ?? 1),
        String(req.query.status ?? "AWAITING_APPROVAL"),
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalAdminDetailsController(
  req: Request,
  res: Response,
) {
  try {
    return res.json(
      await getWithdrawalAdminDetails(
        String(req.user?.id),
        req.params.id,
        Number(req.query.page ?? 1),
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}
export async function withdrawalAdminDecisionController(
  req: Request,
  res: Response,
) {
  const parsed = z
    .object({
      decision: z.enum(["APPROVE", "REJECT"]),
      note: z.string().trim().min(3).max(500),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Record an approval or rejection reason" });
  try {
    return res.json(
      await decideWithdrawal(
        String(req.user?.id),
        req.params.id,
        parsed.data.decision,
        parsed.data.note,
        req.get("Idempotency-Key")!,
      ),
    );
  } catch (error) {
    return withdrawalError(res, error);
  }
}

export async function transactionRatesController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const { getTransactionRates } = await import("@/services/v1/wallets");
    return res.json(await getTransactionRates(String(req.user!.id)));
  } catch {
    return res.status(503).send("Transaction fees unavailable");
  }
}
