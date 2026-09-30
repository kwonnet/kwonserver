
import express from "express";
import { authMiddleware } from "@/middleware";
import { createPostClickController, createPostController, createPostHightlightController, createPostImpressionController, createPostMediaLogController, createPostPinController, createPostQuoteController, createPostReplyController, createPostTipController, createPostViewController, deletePostController, getEmbedPostController, getNewsfeedController, getPostAnalyticsController, getPostDetailsController, getPostQuotesController, getPostRepliesController, getPostRepostersController, getTagUsersOrMentionsController, hidePostReplyController, notInterestedPostController, reportPostController, restorePostController, updatePostBookmarksController, updatePostReactionsController, updatePostSharesController, updateRepostsController, votePollPostController, voteQuizPostController, getRecommendationsController } from "@/controllers/v1/posts";



const router = express.Router();

router.post("/", authMiddleware({checkPermission: true}), createPostController)

router.get("/feed/:feedType", authMiddleware({checkPermission: true}), getNewsfeedController)

router.get("/recommendations", authMiddleware({checkPermission: true}), getRecommendationsController)

router.get("/:id", authMiddleware({checkPermission: true}), getPostDetailsController)

router.post("/:id/reactions", authMiddleware({checkPermission: true}), updatePostReactionsController)

router.post("/:id/bookmarks", authMiddleware({checkPermission: true}), updatePostBookmarksController)

router.post("/:id/shares", authMiddleware({checkPermission: true}), updatePostSharesController)

router.post("/:id/reposts", authMiddleware({checkPermission: true}), updateRepostsController)

router.get("/:id/reposts", authMiddleware(), getPostRepostersController)

router.post("/:id/quotes", authMiddleware({checkPermission: true}), createPostQuoteController)

router.get("/:id/quotes", authMiddleware({checkPermission: true}), getPostQuotesController)

router.post("/:id/replies", authMiddleware({checkPermission: true}), createPostReplyController)

router.get("/:id/replies", authMiddleware(), getPostRepliesController)

router.patch("/:id/replies", authMiddleware({checkPermission: true}), hidePostReplyController)

router.get("/:id/mentions", authMiddleware(), getTagUsersOrMentionsController)

router.get("/:id/embed", authMiddleware({required: false}), getEmbedPostController)

router.patch("/:id/poll", authMiddleware({checkPermission: true}), votePollPostController)

router.patch("/:id/quiz", authMiddleware({checkPermission: true}), voteQuizPostController)

router.post("/:id/reports", authMiddleware({checkPermission: true}), reportPostController)

router.post("/:id/pins", authMiddleware({checkPermission: true}), createPostPinController)

router.post("/:id/highlights", authMiddleware({checkPermission: true}), createPostHightlightController)

router.post("/:id/not-interested", authMiddleware({checkPermission: true}), notInterestedPostController)

router.delete("/:id", authMiddleware({checkPermission: true}), deletePostController)

router.patch("/:id/restore", authMiddleware({checkPermission: true}), restorePostController)

router.post("/:id/impressions", authMiddleware({checkPermission: true}), createPostImpressionController)

router.post("/:id/views", authMiddleware({checkPermission: true}), createPostViewController)

router.post("/:id/clicks", authMiddleware({checkPermission: true}), createPostClickController)

router.post("/:id/media", authMiddleware({checkPermission: true}), createPostMediaLogController)

router.post("/:id/tips", authMiddleware({checkPermission: true}), createPostTipController)

router.get("/:id/post-analytics", authMiddleware({checkPermission: true}), getPostAnalyticsController)

const postRoutes = router

export default postRoutes

