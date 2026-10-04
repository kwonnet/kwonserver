
import express from "express";
import { authMiddleware, detectBotMiddleware } from "@/middleware";
import { blockUserController, followUserController, getConnectionsController, getUserAccountAnalyticsController, getUserBlockedUsersController, getUserBookmarksController, getUserFollowersController, getUserFollowingController, getUserFollowRequestsController, getUserFriendsController, getUserHighlightPostsController, getUserLikesController, getUserMediaPostsController, getUserMutedUsersController, getUserNotificationsController, getUserPostsController, getUserProfileOverviewController, getUserRepliesController, getUserScheduledPostsController, getUserVerifiedFollowersController, muteUserController, profileVisitorController, reportUserController, searchUserController, searchUsersController, updateAccountStatusController, updateUserNotifController, userAchievementsController, userActiveSubscriptionController, userLocationController, userStatsController, userUserTaskSettingsController, getUserInteractionHistoryController } from "@/controllers/v1/users";

import { editableProfileController } from "@/controllers/v1/profile";

const router = express.Router();
router.get("/me/profile", authMiddleware(), editableProfileController);
router.patch("/me/profile", authMiddleware(), editableProfileController);

router.post("/search", detectBotMiddleware(), authMiddleware(), searchUserController)

router.get("/search", detectBotMiddleware(), authMiddleware(), searchUsersController)

router.get("/:id/achievements", detectBotMiddleware(), authMiddleware(), userAchievementsController)

router.get("/:id/stats", detectBotMiddleware(), authMiddleware(), userStatsController)

router.patch("/:id/notifications", detectBotMiddleware(), authMiddleware(), updateUserNotifController)

router.get("/:id/notifications", detectBotMiddleware(), authMiddleware(), getUserNotificationsController)

router.get("/:id/pro", detectBotMiddleware(), authMiddleware(), userActiveSubscriptionController)

router.get("/:id/task-settings", authMiddleware(), userUserTaskSettingsController)

router.post("/follows", authMiddleware(), followUserController)

router.get("/:id/followers", authMiddleware(), getUserFollowersController)

router.get("/:id/following", authMiddleware(), getUserFollowingController)

router.get("/:id/friends", authMiddleware(), getUserFriendsController)

router.get("/:id/verified-followers", authMiddleware(), getUserVerifiedFollowersController)

router.get("/:id/follow-requests", authMiddleware(), getUserFollowRequestsController)

router.get("/:id/blocked", authMiddleware(), getUserBlockedUsersController)

router.get("/:id/muted", authMiddleware(), getUserMutedUsersController)

router.post("/locations", authMiddleware(), userLocationController)

router.get("/connections", authMiddleware(), getConnectionsController)

router.get("/:id/overview", authMiddleware(), getUserProfileOverviewController)

router.post("/:id/block", authMiddleware(), blockUserController)

router.post("/:id/mute", authMiddleware(), muteUserController)

router.post("/:id/reports", authMiddleware(), reportUserController)

router.post("/:id/visitors", authMiddleware(), profileVisitorController)

router.get("/:id/posts", authMiddleware({checkPermission: true}), getUserPostsController)

router.get("/:id/replies", authMiddleware({checkPermission: true}), getUserRepliesController)

router.get("/:id/scheduled", authMiddleware({checkPermission: true}), getUserScheduledPostsController)

router.get("/:id/likes", authMiddleware({checkPermission: true}), getUserLikesController)

router.get("/:id/bookmarks", authMiddleware({checkPermission: true}), getUserBookmarksController)

router.get("/:id/highlights", authMiddleware({checkPermission: true}), getUserHighlightPostsController)

router.get("/:id/media", authMiddleware({checkPermission: true}), getUserMediaPostsController)

router.post("/:id/update-account-status", authMiddleware({checkPermission: true}), updateAccountStatusController)

router.get("/:id/account-analytics", authMiddleware({checkPermission: true}), getUserAccountAnalyticsController)

router.get("/:id/history", getUserInteractionHistoryController)


const userRoutes = router

export default userRoutes
