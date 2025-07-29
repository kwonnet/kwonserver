
import express from "express";
import { authMiddleware } from "@/middleware";
import { createPostClickController, createPostController, createPostHightlightController, createPostImpressionController, createPostMediaLogController, createPostPinController, createPostQuoteController, createPostReplyController, createPostTipController, createPostViewController, deletePostController, getEmbedPostController, getNewsfeedController, getPostDetailsController, getPostQuotesController, getPostRepliesController, getPostRepostersController, hidePostReplyController, notInterestedPostController, reportPostController, restorePostController, updatePostBookmarksController, updatePostReactionsController, updatePostSharesController, updateRepostsController, votePollPostController, voteQuizPostController } from "@/controllers/v1/posts";


const router = express.Router();


router.post("/", authMiddleware(), createPostController)

router.get("/feed/:feedType", authMiddleware(), getNewsfeedController)

router.get("/:id", authMiddleware(false), getPostDetailsController)

router.post("/:id/reactions", authMiddleware(), updatePostReactionsController)

router.post("/:id/bookmarks", authMiddleware(), updatePostBookmarksController)

router.post("/:id/shares", authMiddleware(), updatePostSharesController)

router.post("/:id/reposts", authMiddleware(), updateRepostsController)

router.get("/:id/reposts", authMiddleware(), getPostRepostersController)

router.post("/:id/quotes", authMiddleware(), createPostQuoteController)

router.get("/:id/quotes", authMiddleware(), getPostQuotesController)

router.post("/:id/replies", authMiddleware(), createPostReplyController)

router.get("/:id/replies", authMiddleware(), getPostRepliesController)

router.patch("/:id/replies", authMiddleware(), hidePostReplyController)

router.get("/:id/embed", authMiddleware(false), getEmbedPostController)

router.patch("/:id/poll", authMiddleware(), votePollPostController)

router.patch("/:id/quiz", authMiddleware(), voteQuizPostController)

router.post("/:id/reports", authMiddleware(), reportPostController)

router.post("/:id/pins", authMiddleware(), createPostPinController)

router.post("/:id/highlights", authMiddleware(), createPostHightlightController)

router.post("/:id/not-interested", authMiddleware(), notInterestedPostController)

router.delete("/:id", authMiddleware(), deletePostController)

router.patch("/:id/restore", authMiddleware(), restorePostController)

router.post("/:id/impressions", authMiddleware(false), createPostImpressionController)

router.post("/:id/views", authMiddleware(false), createPostViewController)

router.post("/:id/clicks", authMiddleware(false), createPostClickController)

router.post("/:id/media", authMiddleware(false), createPostMediaLogController)

router.post("/:id/tips", authMiddleware(), createPostTipController)


const postRoutes = router

export default postRoutes

