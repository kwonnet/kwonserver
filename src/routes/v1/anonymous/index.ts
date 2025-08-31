import express from "express";
import { authMiddleware } from "@/middleware";
import { getConvoMessagesController, getUserAndRecipientMessagesController, getUserChatDevicesController, getUserConversationsController, createConversationController, registerUserChatDeviceController, revokeUserChatDeviceController, updateUserConvoController } from "@/controllers/v1/conversations";
import { getRecipientController } from "@/controllers/v1/anonymous";

const router = express.Router();

router.get("/users/:id", authMiddleware({ checkPermission: true}), getRecipientController)

router.post("/", authMiddleware({checkPermission: true}), createConversationController)

router.get("/users/:id/devices", authMiddleware({ checkPermission: true}), getUserChatDevicesController)

router.get("/users/:id/conversations", authMiddleware({ checkPermission: true}), getUserConversationsController)

router.post("/devices/:deviceId/revoke", authMiddleware({checkPermission: true}), revokeUserChatDeviceController)

router.get("/:id/messages", authMiddleware({ checkPermission: true}), getConvoMessagesController )

router.patch("/users/:id/conversations", authMiddleware({ checkPermission: true}), updateUserConvoController )

const anonymousRoutes = router

export default anonymousRoutes
