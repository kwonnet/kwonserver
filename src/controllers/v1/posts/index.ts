import {injectPostBoosts, getPostBoostStatus} from '@/services/v1/posts';
import {getEmbedPost, getPublicPostMetadata, getPublicPostMetadataIndex} from "@/services/v1/posts";
import { z } from 'zod';
import { performance } from "node:perf_hooks";
import logger from "@/logger";
import {
  CreatePostClickSchema,
  CreatePostHighlightSchema,
  CreatePostImpressionSchema,
  CreatePostMediaLogSchema,
  CreatePostPinSchema,
  CreatePostShareSchema,
  CreatePostTipSchema,
  CreatePostViewSchema,
  QueryParams,
  ReportCreateSchema,
  SearchQuerySchema,
} from "@/schema";
import { PostCreateSchema } from "@/schema/post";
import {
  getPostGifters,
  getPostEngagementsOverview,
  searchPosts,
  createAndUpdatePostShares,
  createPost,
  createPostClick,
  createPostHighlight,
  createPostImpression,
  createPostMediaLog,
  createPostPin,
  createPostQuote,
  createPostReply,
  createPostTip,
  createPostView,
  deletePost,
  getNewsfeed,
  getAvailableNewsfeedSnapshot,
  getAvailableNewsfeedPosts,
  getPublicPostPreview,
  getPostAnalytics,
  getPostFeedDetails,
  getPostQuotes,
  getPostReplies,
  getPostReposters,
  getPostTagUsersOrMentions,
  hidePostReply,
  notInterestedPost,
  reportPost,
  restorePost,
  updatePostBookmarks,
  updatePostReactions,
  updateReposts,
  votePollPost,
  voteQuizPost,
  getRecommendedPosts
} from "@/services/v1/posts";
import sseEmitter from "@/sseEmitter";
import { validateZodInput, generateUniqueRef } from "@/utils";
import { getReqInfo } from "@/utils/helpers";
import { Response, Request } from "express";
import { SessionUser, AuthUser } from "@/types/user";
import { getRecommendationResponse } from "@/services/kwonrec";



export const createPostController = async (
  req: Request,
  res: Response
) => {
  try {
    const zodResult = validateZodInput(req.body, PostCreateSchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const user = req.user as AuthUser;

    const result = await createPost(zodData, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const getNewsfeedController = async (
  req: Request,
  res: Response
) => {
  try {
    const feedType = req.params.feedType;

    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData || !["foryou", "following", "friends", "trending", "latest"].includes(feedType) || !Number.isInteger(zodData.page) || zodData.page < 1 || !Number.isInteger(zodData.limit) || zodData.limit < 1 || zodData.limit > 100){
      return res
        .status(400)
        .send(!zodData ? zodResult.message : "Invalid feed type or pagination provided");
    }

    const { limit } = zodData

    const started = performance.now();
    const resp = feedType === "foryou" ? await getRecommendationResponse(user.id, limit, zodData.page) : null;
    const source = resp ? (resp.data.degraded ? "fallback" : "kwonrec") : "database";
    const rankedAt = performance.now();
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Feed-Source", source);
    const recs = resp?.data.recommendations.map((item: { id: string }) => item.id) ?? [];

    const result = await getNewsfeed(recs, user, {feed:feedType, ...zodData });

    if (result.status === 200 && Array.isArray(result.data)) {
      res.setHeader('X-Feed-Organic-Count',String(result.data.length));
      try {result.data = await injectPostBoosts(result.data,user) as typeof result.data;} catch { /* Feed remains available when promotion storage is unhealthy. */ }
    }
    const finishedAt = performance.now();
    const recommendationMs = Math.round(rankedAt - started);
    const hydrationMs = Math.round(finishedAt - rankedAt);
    res.setHeader("Server-Timing", `recommendations;dur=${recommendationMs}, hydration;dur=${hydrationMs}`);
    logger.info({ event: "newsfeed_load", feed: feedType, page: zodData.page,
      source: source, recommendationMs, hydrationMs,
      totalMs: Math.round(finishedAt - started), status: result.status,
      posts: Array.isArray(result.data) ? result.data.length : 0 }, "Newsfeed loaded");

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    console.log(error?.message, "Error in getNewsfeedController")
    return res.status(400).send(error?.message);
  }
};


export const getPostRepliesController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = req.params.id;

    if (!id) return res.status(400).send("Invalid id provided");

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const user = req.user as AuthUser;

    const result = await getPostReplies(
      { postId: id, userId: user.id, ...zodData },
      user
    );

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getTagUsersOrMentionsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.query, SearchQuerySchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    console.log("mentions-tag-users query ", zodResult.data)

    const result = await getPostTagUsersOrMentions(user.id, zodResult.data);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    
    return res.status(400).send(error?.message);
  }
};

export const getPostQuotesController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData || !postId)
      return res
        .status(400)
        .send(!postId ? "Invalid post id" : zodResult.message);

    const user = req.user as AuthUser;

    const result = await getPostQuotes({ postId, ...zodData }, user);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getPostRepostersController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData || !postId)
      return res
        .status(400)
        .send(!postId ? "Invalid post id" : zodResult.message);

    const user = req.user as SessionUser;

    const result = await getPostReposters({ postId, ...zodData }, user);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getPostDetailsController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await getPostFeedDetails(postId, user);
    
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getEmbedPostController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await getEmbedPost(postId, user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const updatePostReactionsController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await updatePostReactions(postId, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(
        {
          liked: data.liked,
          userId: data?.data?.userId,
          id: data?.data?.postId,
        },
        "post_reaction"
      );
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const updatePostBookmarksController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await updatePostBookmarks(postId, user.id);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(
        {
          saved: data.isBookmarked,
          userId: data?.data?.userId,
          id: data?.data?.postId,
        },
        "post_bookmark"
      );
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const updatePostSharesController = async (
  req: Request,
  res: Response
) => {
  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostShareSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      postId,
      userId: user.id,
      kind: zodData.kind,
      sessionId: zodData.sessionId,
      timestamp: zodData.timestamp,
      referer: req.headers["referer"]
    };
    // save post share in redis queue
    // const result = await insertPostShareQueue(payload)

    const result = await createAndUpdatePostShares(payload);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send({ userId: user?.id, id: data?.id }, "post_share");
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const updateRepostsController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await updateReposts(postId, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(
        {
          reposted: data.isReposted,
          userId: data?.data?.userId,
          childId: data?.data?.id, // created reposted post child ID
          postId: data?.data?.parentId, // parent reposted post ID
        },
        "post_repost"
      );
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostQuoteController = async (
  req: Request,
  res: Response
) => {
  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, PostCreateSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid quoted post id");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await createPostQuote(postId, user.id, zodData);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(
        {
          quoted: data.isQuoted,
          userId: data?.data?.userId,
          id: data?.data?.postId,
        },
        "post_quote"
      );
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostReplyController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, PostCreateSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid reply post id");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await createPostReply(postId, zodData, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, "post_reply");
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const reportPostController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, ReportCreateSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid reply post id");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await reportPost(zodData, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_report_${data.userId}`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const notInterestedPostController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const postId = req.params.id;

    if (!postId) return res.status(400).send("Invalid post id");

    const result = await notInterestedPost(postId, user.id);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_not_interested_${data.userId}`);
    }

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const deletePostController = async (
  req: Request,
  res: Response
) => {
  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    if (!postId) return res.status(400).send("Invalid quoted post id");

    const result = await deletePost(postId, user);
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_delete`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const restorePostController = async (
  req: Request,
  res: Response
) => {
  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    if (!postId) return res.status(400).send("Invalid quoted post id");

    const result = await restorePost(postId, user);
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_restore`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const hidePostReplyController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const postId = req.params.id;

    if (!postId) return res.status(400).send("Invalid ID provided");

    const result = await hidePostReply(postId, user);
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_hidden`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostImpressionController = async (
  req: Request,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostImpressionSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      postId,
      userId: user.id,
      sessionId: zodData.sessionId,
      timestamp: zodData.timestamp,
      referer: req.headers["referer"]
    };
    // save impression in redis queue
    // const result = await insertImpressionQueue(payload)
    const result = await createPostImpression(payload);
    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_impression`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostViewController = async (
  req: Request,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostViewSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      postId,
      userId: user.id,
      sessionId: zodData.sessionId,
      timestamp: zodData.timestamp,
      duration: zodData.duration,
      referer: req.headers["referer"]
    };
    // save view in redis queue
    // const result = await insertImpressionQueue(payload)
    const result = await createPostView(payload);
    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_view`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostClickController = async (
  req: Request,
  res: Response
) => {
  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostClickSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      postId,
      userId: user.id,
      referer: req.headers["referer"],
      ...zodData
    };
    // save view in redis queue
    const result = await createPostClick(payload);    
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const createPostMediaLogController = async (
  req: Request,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostMediaLogSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      ...zodData,
      postId,
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      userId: user.id,
      referer: req.headers["referer"]
    };
    // save view in redis queue
    // const result = await insertImpressionQueue(payload)
    const result = await createPostMediaLog(payload);
    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_media_action`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostPinController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostPinSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid reply post id");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await createPostPin(zodData, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_pin_${data.userId}`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const createPostHightlightController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostHighlightSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid reply post id");

    if (!zodData) return res.status(400).send(zodResult.message);

    const result = await createPostHighlight(zodData, user);

    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_highlight_${data.userId}`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const votePollPostController = async (
  req: Request,
  res: Response
) => {
  try {

    const postId = req?.params?.id;

    const optionId = req?.body?.optionId;

    const user = req.user as AuthUser;

    if (!postId || !optionId)
      return res.status(400).send("Invalid post or option id");

    const result = await votePollPost(postId, optionId, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const voteQuizPostController = async (
  req: Request,
  res: Response
) => {
  try {

    const postId = req?.params?.id;

    const optionId = req?.body?.optionId;

    const user = req.user as AuthUser;

    if (!postId || !optionId)
      return res.status(400).send("Invalid post or option id");

    const result = await voteQuizPost(postId, optionId, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};


export const createPostTipController = async (
  req: Request,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {

    const user = req.user as SessionUser;

    const postId = req.params.id;

    const zodResult = validateZodInput(req.body, CreatePostTipSchema);

    const zodData = zodResult.data;

    if (!postId) return res.status(400).send("Invalid ID provided");

    if (!zodData) return res.status(400).send(zodResult.message);

    const reqInfo = await getReqInfo(req);

    if (reqInfo.isBot) {
      return res.status(400).send("Failed to process, bot request detected");
    }

    const payload = {
      ...zodData,
      postId,
      device: reqInfo.device,
      meta: reqInfo.ipInfo,
      senderId: user.id,
      referer: req.headers["referer"]
    };
    // save tip in redis queue?
    // const result = await createPostTip(payload)
    const result = await createPostTip({ ...payload, idempotencyKey: req.get('Idempotency-Key') }, user);
    // emit sse event
    const data = result.data;
    if (typeof data !== "string") {
      sseEmitter.send(result.data, `post_tip`);
    }
    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getPostAnalyticsController = async (
  req: Request,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    if (!postId){
      return res
        .status(400)
        .send("Invalid post ID provided");
    }

    const Params = QueryParams.pick({duration: true})

    const zodResult = validateZodInput(req.query, Params);

    const zodData = zodResult.data;

    if (!zodData || !zodData.duration){
      return res
        .status(400)
        .send("Invalid duration value provided");
    }

    const result = await getPostAnalytics(postId, user, {duration: zodData.duration!});

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getRecommendationsController = async(req: Request,
  res: Response) => {
  try {
    const user_id = (req.user as AuthUser).id;
    const { limit } = req.query;

    console.log(req.query, "Get recommendations")

    const resp = await getRecommendationResponse(user_id, limit)

    const rec = resp.data 

    const recommendations = rec?.recommendations as {id: string, score: number}[]

    console.log(recommendations)

    const result = await getRecommendedPosts(user_id, recommendations?.map(item => item.id))

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
}

export const getContentTopicController = async(req: Request,
  res: Response) => {
  try {
    const user_id = (req.user as AuthUser).id;
    const { limit } = req.query;

    console.log(req.query, "Get recommendations")

    const resp = await getRecommendationResponse(user_id, limit)

    const rec = resp.data 

    const recommendations = rec?.recommendations as {id: string, score: number}[]

    console.log(recommendations)

    const result = await getRecommendedPosts(user_id, recommendations?.map(item => item.id))

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
}

export async function getPublicPostPreviewController(_req: Request, res: Response) {
  // Re-evaluate visibility on every request, including immediately after a privacy change.
  res.setHeader("Cache-Control", "no-store");
  try {
    const posts = await getPublicPostPreview();
    return res.status(200).json(posts);
  } catch {
    logger.warn("Public feed preview unavailable");
    return res.status(503).json({ message: "The feed is temporarily unavailable." });
  }
}

export async function searchPostsController(req: Request, res: Response) {
  const input = z.object({ q: z.string().trim().min(1).max(200), tab: z.enum(['top', 'latest']).default('top'),
    page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).safeParse(req.query);
  if (!input.success) return res.status(400).send({ error: 'Invalid search parameters' });
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const { q, tab, page, limit } = input.data;
    return res.send(await searchPosts(q, tab, page, limit, req.user as AuthUser | undefined));
  } catch { return res.status(500).send({ error: 'Unable to load search results' }); }
}


export const getPostGiftersController = async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const query = z.object({page: z.coerce.number().int().min(1).max(100_000).default(1), limit: z.coerce.number().int().min(1).max(50).default(21)}).safeParse(req.query);
  if (!query.success) return res.status(400).send("Invalid pagination");
  try {
    const result = await getPostGifters(req.params.id, req.user!.id, query.data.page, query.data.limit);
    return res.status(result.status).send(result.data);
  } catch { return res.status(500).send("Unable to load gifters. Please try again"); }
};


export const getPostEngagementsOverviewController = async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const result = await getPostEngagementsOverview(req.params.id, req.user!.id);
    return res.status(result.status).send(result.data);
  } catch { return res.status(500).send("Unable to load engagements"); }
};

export const publicPostMetadataController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {const post = await getPublicPostMetadata(req.params.id); return post ? res.json(post) : res.status(404).json({error: 'Post unavailable'});}
  catch {return res.status(503).json({error: 'Metadata unavailable'});}
};
export const publicPostMetadataIndexController = async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {return res.json(await getPublicPostMetadataIndex());}
  catch {return res.status(503).json({error: 'Metadata unavailable'});}
};

export async function postBoostStatusController(req: Request,res: Response) {
 res.setHeader('Cache-Control','private, no-store');
 try {const status=await getPostBoostStatus(req.params.id,req.user!.id); return status ? res.json(status) : res.status(404).json({error:'Boost status unavailable'});}
 catch {return res.status(503).json({error:'Boost status unavailable'});}
}

const availableFeedTypes = ['foryou', 'following', 'friends', 'trending', 'latest'];
export const availableNewsfeedController = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const feed = req.params.feedType;
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(','))] : [];
  if (!availableFeedTypes.includes(feed) || !ids.length || ids.length > 50 || ids.some(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id)))
    return res.status(400).json({error: 'Invalid feed snapshot'});
  try {const result = await getAvailableNewsfeedPosts(req.user as AuthUser, feed, ids);return res.status(result.status).json(result.data);}
  catch {return res.status(503).json({error: 'New posts unavailable'});}
};
export const availableNewsfeedStreamController = (req: Request, res: Response) => {
  const feed = req.params.feedType;
  let since = typeof req.query.since === 'string' ? new Date(req.query.since) : new Date();
  const now = Date.now();
  if (!availableFeedTypes.includes(feed) || !Number.isFinite(since.getTime()) || since.getTime() > now + 60000)
    return res.status(400).send('Invalid feed window');
  since = new Date(Math.max(since.getTime(), now - 86400000));
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  let busy = false;
  let closed = false;
  const tick = async () => {
    if (busy || closed || res.writableNeedDrain) return;
    busy = true;
    try {
      const snapshot = await getAvailableNewsfeedSnapshot(req.user!.id, feed, since);
      if (!closed) res.write(`event: feed_available\ndata: ${JSON.stringify({feed, ...snapshot})}\n\n`);
    } catch {if (!closed) res.write(': feed temporarily unavailable\n\n');}
    finally {busy = false;}
  };
  const timer = setInterval(() => void tick(), 30000);
  const heartbeat = setInterval(() => {if (!closed && !res.writableNeedDrain) res.write(': heartbeat\n\n');}, 15000);
  // Renew auth on reconnect; keep stream windows bounded.
  const lifetime = setTimeout(() => res.end(), 55 * 60000);
  res.on('close', () => {closed = true;clearInterval(timer);clearInterval(heartbeat);clearTimeout(lifetime);});
  void tick();
};
