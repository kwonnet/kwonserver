import { QueryParams, ReportCreateSchema, VisitorCreateSchema } from "@/schema";
import { rewardQuerySchema, SearchUserSchema } from "@/schema/gameSchema";
import { FollowUserSchema, UserLocationSchema } from "@/schema/user";
import {
  followUser,
  getConnections,
  getUserAchievements,
  getUserActiveSubscription,
  getUserStats,
  getUserTaskSettings,
  searchUser,
  searchUsers,
  logUserLocation,
  getUserProfileOverview,
  muteUser,
  blockUser,
  reportUser,
  profileVisit,
} from "@/services/v1/users";
import sseEmitter from "@/sseEmitter";
import { AuthUser, RequestWithUser, RewardQuery, User } from "@/types";
import { validateZodInput } from "@/utils";
import { getReqInfo } from "@/utils/helpers";
import { Request, Response } from "express";
import { z } from "zod";

export const searchUserController = async (req: Request, res: Response) => {
  try {
    const zodResult = validateZodInput(req.body, SearchUserSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await searchUser(zodResult.data.query);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const searchUsersController = async (req: Request, res: Response) => {
  try {
    const SearchSchema = z.object({
      query: z.string(),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(50),
    });
    const { query, limit, page } = await SearchSchema.parseAsync({
      query: req.query.q,
    });
    const result = await searchUsers({ query, limit, page });
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .send(error?.issues.map((issue) => issue.message).toString());
    }
    return res.status(400).send(error?.message);
  }
};

export const userAchievementsController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = validateZodInput(req.query as any, rewardQuerySchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await getUserAchievements(zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userStatsController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const result = await getUserStats(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userActiveSubscriptionController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const result = await getUserActiveSubscription(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userUserTaskSettingsController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const result = await getUserTaskSettings(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const followUserController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.body, FollowUserSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await followUser(zodResult.data, user);

    if (typeof result.data !== "string") {
      sseEmitter.send(zodResult.data, "user_follower");
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userLocationController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.body, UserLocationSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await logUserLocation(user.id, zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getConnectionsController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.query, QueryParams);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await getConnections(user.id, zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserProfileOverviewController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const identifier = req.params.id;

    const user = req.user as AuthUser;

    if (!identifier) return res.status(400).send("Invalid identifier provided");

    const result = await getUserProfileOverview(identifier, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const blockUserController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const blockedId = req.params.id;

    if (!blockedId) return res.status(400).send("Invalid ID provided");

    const result = await blockUser(blockedId, user);

    if (typeof result.data !== "string") {
      sseEmitter.send(result.data, `user_blocked_${user.id}`);
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const muteUserController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const mutedId = req.params.id;

    if (!mutedId) return res.status(400).send("Invalid  ID provided");

    const result = await muteUser(mutedId, user);

    if (typeof result.data !== "string") {
      sseEmitter.send(result.data, `user_muted_${user.id}`);
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const reportUserController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const reportedId = req.params.id;

    const zodResult = validateZodInput(req.body, ReportCreateSchema);

    const zodData = zodResult.data;

    if (!reportedId)
      return res.status(400).send("Invalid reported ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await reportUser(zodData, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `user_reported_${user.id}`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const profileVisitorController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const userId = req.params.id;
    
    console.log("profile visit")

    console.log(req.body)

    const zodResult = validateZodInput(req.body, VisitorCreateSchema);

    const zodData = zodResult.data;

    if (!userId) return res.status(400).send("Invalid User ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    console.log("Profile log visit")

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const result = await profileVisit({ ...zodData, device: reqInfo.device, meta: reqInfo.ipInfo, referer: req.headers["referer"]}, user);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};
