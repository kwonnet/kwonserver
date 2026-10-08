import { initSodium } from "@/lib/sodium";
import { QueryParams, SearchQuerySchema } from "@/schema";
import { createConversation, getConvoMessages, getUserAndRecipientMessages, getUserChatDevices, getUserConversations, registerUserChatDevice, revokeUserChatDevice, updateUserConversations } from "@/services/v1/conversations";
import { ConvoKind } from "@/types";
import { SessionUser } from "@/types/user";
import { validateZodInput } from "@/utils";
import { Response } from "express";
import type {Request} from "@/types/express";
import { z } from "zod/v3";


export const createConversationController = async (
  req: Request,
  res: Response
) => {
  try {

    const BodySchema = z.object({
      senderId: z.string({message: "Sender ID must be astring"}),
      recipientId: z.string({message: "Recipient ID must be a string"}),
      kind: z.nativeEnum(ConvoKind, { message: "Conversation kind can be chat or anonymous"})
    });
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.body, BodySchema);

    const body = zodResult.data;

    if (!body) return res.status(400).send(zodResult.message);

    if(user.id !== body.senderId ){
      return res.status(400).send('Invalid user ID provided')
    }

    if(body.recipientId === body.senderId && body.kind === ConvoKind.ANONYMOUS ){
      return res.status(400).send("Sorry, you can't create anonymous message by yourself")
    }

    // create or return conversation
    const result = await createConversation(body);

    return res.status(result.status).send(result.data);
  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};

export const registerUserChatDeviceController = async (
  req: Request,
  res: Response
) => {
  const BodySchema = z.object({
  deviceId: z.string(),
  identityPubEd25519: z.string(),
  identityPubX25519: z.string(),
  signedPreKeyPubX25519: z.string(),
  signedPreKeySignature: z.string(),
  oneTimePreKeys: z.array(z.any()).default([]),
});
  try {
    const user = req.user as SessionUser;

    const zodResult = validateZodInput(req.body, BodySchema);

    if (!zodResult.data) return res.status(400).send(zodResult.message);

    const body = zodResult.data;

    // verify libsodium key

    const sodium = await initSodium();

    const ok = sodium.crypto_sign_verify_detached(
      sodium.from_base64(
        body.signedPreKeySignature,
        sodium.base64_variants.ORIGINAL
      ),
      sodium.from_base64(
        body.signedPreKeyPubX25519,
        sodium.base64_variants.ORIGINAL
      ),
      sodium.from_base64(
        body.identityPubEd25519,
        sodium.base64_variants.ORIGINAL
      )
    );

    if (!ok) {
      return res
        .status(400)
        .send("Key verification error: invalid signedPreKey signature");
    }
    // register the device
    const result = await registerUserChatDevice({ ...body, userId: user.id });
    return res.status(result.status).send(result.data);
  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};


export const getUserChatDevicesController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const userId = req.params.id

    if (!userId) return res.status(400).send("Invalid user specified");

    // get user chat devices
    const result = await getUserChatDevices(userId);

    return res.status(result.status).send(result.data);

  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};

export const getUserConversationsController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const userId = req.params.id

    if (user.id !== userId) return res.status(400).send("Invalid user ID specified");

    const QuerySchema = QueryParams.pick({limit: true, page: true, kind: true}).merge(z.object({kind: z.string({message: "kind is required"})}))

    const zodResult = validateZodInput(req.query, QuerySchema)

    const zodData = zodResult.data

    if(!zodData) return res.status(400).send(zodResult.message)

    const result = await getUserConversations({userId: user.id, ...zodData});

    return res.status(result.status).send(result.data);

  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};

export const getUserAndRecipientMessagesController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const userId = req.params.id

    const recipientId = req.params.recipientId

    if (user.id !== userId) {
      return res.status(403).send("Unauthorised request, operation not allowed");
    }

    if (!userId || !recipientId) {
      return res.status(404).send("Both user ID and recipient ID is required");
    }

    const result = await getUserAndRecipientMessages(user.id, recipientId);

    return res.status(result.status).send(result.data);

  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};


export const revokeUserChatDeviceController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const deviceId = req.params.deviceId

    if (!deviceId) return res.status(400).send("Invalid user specified");

    const result = await revokeUserChatDevice({deviceId, userId: user.id});

    return res.status(result.status).send(result.data);

  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};

export const getConvoMessagesController = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user as SessionUser;

    const id = req.params.id

    if (!id) return res.status(400).send("Invalid convo ID specified");

    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

    const cursor = req.query.cursor as string | undefined;

    const query: any = { conversationId: id };

    if (cursor) query._id = { $lt: cursor };
    // get user chat devices
    const result = await getConvoMessages(query, limit, user.id);

    return res.status(result.status).send(result.data);

  } catch (error) {
    return res.status(500).send("Sorry an error occurred, please try again");
  }
};

export const updateUserConvoController = async (
  req: Request,
  res: Response
) => {
  try {
    const BodySchema = z.object({
      userId: z.string({message: "User ID must be string"}),
      convoId: z.string({message: "User ID must be string"}).optional().nullish(),
      isSeen: z.boolean().optional(),
      isRead: z.boolean().optional()
    });

    const { userId, ...rest} = await BodySchema.parseAsync(req.body);

    const user = req.user as SessionUser;

    if(userId !== user.id){
      return res.status(403).send("Authorization failed, operation failed")
    }

    console.log("update conversation",{recipientId: user.id, ...rest })

    const result = await updateUserConversations({recipientId: user.id, ...rest });

    console.log("update result ", result)

    return res.status(result.status).send(result.data);

  } catch (error: any) {
    return res.status(400).send(error?.message);
  }
};
import * as messaging from '@/services/v1/conversations';
import { EnrollSchema, SendSchema, ReceiptSchema, RequestSchema } from '@/services/v1/conversations/e2ee-contracts';
import logger from '@/logger';
import { safeError } from '@/logger/sanitize';
const UUID = z.string().uuid();
function messagingController(work: (req: Request, user: SessionUser) => Promise<any>) {
    return async (req: Request, res: Response) => {
        try {
            const result = await work(req, req.user as SessionUser);
            res.setHeader('Cache-Control', 'no-store');
            return res.send(result);
        }
        catch (error) {
            logger.error({ event: 'messaging_operation_failed', userId: req.user?.id, err: safeError(error) }, 'Messaging operation failed');
            return res.status(error instanceof messaging.MessagingError ? error.status : error instanceof z.ZodError ? 400 : 500).send(error instanceof messaging.MessagingError ? error.message : 'Unable to process messaging request');
        }
    };
}
function session(user: SessionUser) { if (!user.sessionId)
    throw new messaging.MessagingError(401, 'Sign in again'); return user.sessionId; }
function device(req: Request) { return UUID.parse(req.headers['x-messaging-device']); }
export const messagingEnrollController = messagingController((req, u) => messaging.enrollMessagingDevice(u.id, session(u), EnrollSchema.parse(req.body)));
export const messagingRosterController = messagingController((req, u) => messaging.messagingRoster(u.id, z.string().min(1).parse(req.params.id)));
export const messagingClaimController = messagingController((req, u) => messaging.claimMessagingPreKey(u.id, session(u), device(req), UUID.parse(req.params.deviceId), UUID.parse(req.body.claimId)));
export const messagingCreateController = messagingController((req, u) => messaging.createMessagingConversation(u.id, z.string().min(1).parse(req.body.recipientId)));
export const messagingListController = messagingController((req, u) => { if (u.id !== req.params.id)
    throw new messaging.MessagingError(403, 'Not permitted'); return messaging.listMessagingConversations(u.id, String(req.query.kind ?? 'chat'), Math.max(1, Number(req.query.page) || 1), Math.min(100, Math.max(1, Number(req.query.limit) || 21))); });
export const messagingPeerController = messagingController((req, u) => { if (u.id !== req.params.id)
    throw new messaging.MessagingError(403, 'Not permitted'); return messaging.messagingPeer(u.id, String(req.params.recipientId)); });
export const messagingSendController = messagingController((req, u) => messaging.sendMessagingEvent(u.id, session(u), device(req), SendSchema.parse(req.body)));
export const messagingSyncController = messagingController((req, u) => messaging.messagingSync(u.id, session(u), device(req), UUID.parse(req.params.id), z.string().regex(/^\d{1,20}$/).parse(req.query.after ?? '0'), z.string().regex(/^\d{1,20}$/).parse(req.query.receiptAfter ?? '0')));
export const messagingReceiptController = messagingController((req, u) => messaging.messagingReceipt(u.id, session(u), device(req), ReceiptSchema.parse(req.body)));
export const messagingRequestController = messagingController((req, u) => messaging.resolveMessagingRequest(u.id, session(u), device(req), UUID.parse(req.params.id), RequestSchema.parse(req.body)));
export const messagingDeleteController = messagingController((req, u) => messaging.deleteMessagingForMe(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.messageId)));
export const messagingRevokeController = messagingController((req, u) => messaging.revokeMessagingDevice(u.id, UUID.parse(req.params.deviceId)));
export const messagingUploadController = messagingController((req, u) => messaging.putMessagingBlob(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.blobId), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)));
export const messagingDownloadController = async (req: Request, res: Response) => {
    try {
        const u = req.user as SessionUser;
        const bytes = await messaging.getMessagingBlob(u.id, session(u), device(req), UUID.parse(req.params.id), UUID.parse(req.params.blobId));
        res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment' });
        return res.send(bytes);
    }
    catch (error) {
        logger.error({ event: 'messaging_attachment_failed', err: safeError(error) }, 'Encrypted attachment unavailable');
        return res.status(error instanceof messaging.MessagingError ? error.status : 400).send('Attachment unavailable');
    }
};
