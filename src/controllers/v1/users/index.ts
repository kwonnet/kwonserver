import {getPublicProfileMetadata} from "@/services/v1/users";
import { SessionUser, AuthUser } from "@/types/user";
import { QueryParams, ReportCreateSchema, SearchQuerySchema, updateAccountStatusSchema, VisitorCreateSchema } from "@/schema";
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
  getUserFollowers,
  getUserFollowing,
  getUserVerifiedFollowers,
  getUserFriends,
  getUserFollowRequests,
  getUserPosts,
  getUserReplies,
  getUserLikedPosts,
  getUserBookmarkPosts,
  getUserHighlightPosts,
  getUserMediaPosts,
  getUserScheduledPosts,
  updateAccountStatus,
  getUserAccountAnalytics,
  updateUserNotifications,
  getUserNotifications,
  getUserBlockedUsers,
  getUserMutedUsers,
  getUserInteractionHistory
} from "@/services/v1/users";
import sseEmitter from "@/sseEmitter";
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
      query: z.string().trim().min(1).max(200),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    });
    const { query, limit, page } = await SearchSchema.parseAsync({
      query: req.query.q, page: req.query.page, limit: req.query.limit,
    });
    const result = await searchUsers({ query, limit, page, viewerId: req.user?.id });
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
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const result = await getUserStats(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserNotificationsController = async (req: Request, res: Response) => {
  try {
    const user = req.user as SessionUser;

    if(user?.id !== req.params.id){
      return res.status(403).send("Authorization failed, operation failed")
    }

    const zodResult = validateZodInput(req.query, QueryParams)

    const zodData = zodResult.data

    if(!zodData){
      return res.status(400).send(zodResult.message)
    }

    const { limit, page } = zodData

    const result = await getUserNotifications(user, { limit, page });

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

export const updateUserNotifController = async (
  req: Request,
  res: Response
) => {
  try {
    const BodySchema = z.object({
      userId: z.string({message: "User ID must be string"}),
      isSeen: z.boolean().optional(),
      isRead: z.boolean().optional()
    });

    const { userId, ...rest} = await BodySchema.parseAsync(req.body);

    const user = req.user as SessionUser;

    if(userId !== user.id){
      return res.status(403).send("Authorization failed, operation failed")
    }

    const result = await updateUserNotifications({recipientId: user.id, ...rest });

    return res.status(result.status).send(result.data);

  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userActiveSubscriptionController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const result = await getUserActiveSubscription(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userUserTaskSettingsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const result = await getUserTaskSettings(user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const followUserController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.body, FollowUserSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    console.log("Follow request ", zodResult.data)

    const result = await followUser(zodResult.data, user);

    console.log("Follow response ", result)

    if (typeof result.data !== "string") {
      console.log("emitted sse event user_follower")
      sseEmitter.send(result.data, "user_follower");
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const userLocationController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.body, UserLocationSchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await logUserLocation(user.id, zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getConnectionsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.query, QueryParams);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const result = await getConnections(user.id, zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserProfileOverviewController = async (
  req: Request,
  res: Response
) => {
  try {
    const targetUserId = req.params.id;

    const user = req.user as SessionUser;

    if (!targetUserId) return res.status(400).send("Invalid identifier provided");

    const result = await getUserProfileOverview(targetUserId, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(500).send(error?.message);
  }
};

export const blockUserController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

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
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

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
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

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

export const updateAccountStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    console.log("Reactivation payload ", req.body)
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.body, updateAccountStatusSchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await updateAccountStatus(zodData, user);

    console.log("Reactivation response ", result)

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const profileVisitorController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const userId = req.params.id;

    const zodResult = validateZodInput(req.body, VisitorCreateSchema);

    const zodData = zodResult.data;

    if (!userId) return res.status(400).send("Invalid User ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const result = await profileVisit({ ...zodData, device: reqInfo.device, meta: reqInfo.ipInfo, referer: req.headers["referer"]}, user);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserFollowersController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserFollowers({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserFollowingController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserFollowing({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserFriendsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserFriends({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserVerifiedFollowersController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserVerifiedFollowers({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserFollowRequestsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserFollowRequests({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserBlockedUsersController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserBlockedUsers({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserMutedUsersController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const QueryParams = SearchQuerySchema.pick({limit: true, page: true, id: true})

    const zodResult = validateZodInput({...req.query, id: req.params.id}, QueryParams);

    const zodData = zodResult.data

    if (!zodData) return res.status(400).send(zodResult.message);
    
    const {id, ...rest } = zodData

    const result = await getUserMutedUsers({...rest, targetUserId: id, currentUserId: user.id })

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};



export const getUserPostsController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserScheduledPostsController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserScheduledPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserRepliesController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserReplies({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserLikesController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserLikedPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserBookmarksController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserBookmarkPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserHighlightPostsController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserHighlightPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserMediaPostsController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    const Params = QueryParams.pick({limit: true, page: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : zodResult.message);
    }

    const result = await getUserMediaPosts({userId, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getUserAccountAnalyticsController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id;

    const user = req.user as AuthUser;

    if (!userId || (user.id !== userId)){
      return res
        .status(400)
        .send("Authorization error, you are not authorised to access this resource");
    }

    const Params = QueryParams.pick({duration: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !userId || !zodData.duration){
      return res
        .status(400)
        .send(!userId ? "Invalid user ID provided" : "Invalid duration value provided");
    }

    const result = await getUserAccountAnalytics(user.id, {duration: zodData.duration!});

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getUserInteractionHistoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.params.id

    const result = await getUserInteractionHistory(userId);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};
export const publicProfileMetadataController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {const profile = await getPublicProfileMetadata(req.params.id); return profile ? res.json(profile) : res.status(404).json({error: 'Profile unavailable'});}
  catch {return res.status(503).json({error: 'Metadata unavailable'});}
};
