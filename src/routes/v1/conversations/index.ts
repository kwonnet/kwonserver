import express from "express";
import { authMiddleware } from "@/middleware";
import { getConvoMessagesController, getUserAndRecipientMessagesController, getUserChatDevicesController, getUserConversationsController, createConversationController, registerUserChatDeviceController, revokeUserChatDeviceController, updateUserConvoController } from "@/controllers/v1/conversations";

const router = express.Router();

router.post("/", authMiddleware({checkPermission: true}), createConversationController)

router.post("/users/:id/register-device", authMiddleware({checkPermission: true}), registerUserChatDeviceController)

router.get("/users/:id/devices", authMiddleware({ checkPermission: true}), getUserChatDevicesController)

router.get("/users/:id/conversations", authMiddleware({ checkPermission: true}), getUserConversationsController)

router.get("/users/:id/recipients/:recipientId/messages", authMiddleware({ checkPermission: true}), getUserAndRecipientMessagesController)

router.post("/devices/:deviceId/revoke", authMiddleware({checkPermission: true}), revokeUserChatDeviceController)

router.get("/:id/messages", authMiddleware({ checkPermission: true}), getConvoMessagesController )

router.patch("/users/:id/conversations", authMiddleware({ checkPermission: true}), updateUserConvoController )

const conversationRoutes = router

export default conversationRoutes
