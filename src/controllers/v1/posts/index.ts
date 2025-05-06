import {
  CreatePostHighlightSchema,
  CreatePostImpressionSchema,
  CreatePostMediaLogSchema,
  CreatePostPinSchema,
  CreatePostViewSchema,
  QueryParams,
  ReportCreateSchema,
} from "@/schema";
import { PostCreateSchema } from "@/schema/post";
import {
  createPost,
  createPostHighlight,
  createPostImpression,
  createPostMediaLog,
  createPostPin,
  createPostQuote,
  createPostReply,
  createPostView,
  deletePost,
  getNewsfeed,
  getPostFeedDetails,
  getPostQuotes,
  getPostReplies,
  getPostReposters,
  hidePostReply,
  notInterestedPost,
  reportPost,
  restorePost,
  updatePostBookmarks,
  updatePostReactions,
  updatePostShares,
  updateReposts,
  votePollPost,
  voteQuizPost,
} from "@/services/v1/posts";
import sseEmitter from "@/sseEmitter";
import { AuthUser, RequestWithUser, User } from "@/types";
import { validateZodInput } from "@/utils";
import { getReqInfo } from "@/utils/helpers";
import { Response } from "express";


export const createPostController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(req.body);
    const zodResult = validateZodInput(req.body, PostCreateSchema);

    const zodData = zodResult.data;

    if (!zodData) return res.status(400).send(zodResult.message);

    const user = req.user as User;

    const result = await createPost(zodData, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getNewsfeedController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const feedType = req.params.feedType;

    const user = req.user as AuthUser;

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    if (!zodData || !feedType){
      return res
        .status(400)
        .send(!feedType ? "Invalid feed type provided" : zodResult.message);
    }

    const result = await getNewsfeed({feed:feedType, ...zodData }, user);

    return res.status(result.status).send(result.data);
    
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getPostRepliesController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const id = req.params.id;

    if (!id) return res.status(400).send("Invalid id provided");

    const zodResult = validateZodInput(req.query, QueryParams);

    const zodData = zodResult.data;

    console.log("Post rEPLIES ", zodData);

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

export const getPostQuotesController = async (
  req: RequestWithUser,
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
  req: RequestWithUser,
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

    const result = await getPostReposters({ postId, ...zodData }, user);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getPostDetailsController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await getPostFeedDetails(postId, user.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const getEmbedPostController = async (
  req: RequestWithUser,
  res: Response
) => {
  try {
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await getPostFeedDetails(postId, user?.id);

    return res.status(result.status).send(result.data);
  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};

export const updatePostReactionsController = async (
  req: RequestWithUser,
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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" bookmark ", req.body);
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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" shares ", req.body);
    const postId = req.params.id;

    const user = req.user as AuthUser;

    const result = await updatePostShares(postId, user.id);

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" reposts ", req.body);
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
          id: data?.data?.id,
          postId: data?.data?.parentId,
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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" quote ", req.body);

    const user = req.user as AuthUser;

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
  req: RequestWithUser,
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
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" delete ", req.body);

    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log(" restore ", req.body);

    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {
    console.log("Post impressions logger ", req.body);

    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {
    console.log("Post View logger ", req.body);

    const user = req.user as AuthUser;

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


export const createPostMediaLogController = async (
  req: RequestWithUser,
  res: Response
) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  try {
    console.log("Post Media Analytics logger ", req.body);

    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    const user = req.user as AuthUser;

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log("Vote Poll", req.params, req.body);

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
  req: RequestWithUser,
  res: Response
) => {
  try {
    console.log("Vote Quiz", req.params, req.body);

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
