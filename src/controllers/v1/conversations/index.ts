import { initSodium } from "@/lib/sodium";
import { QueryParams, SearchQuerySchema } from "@/schema";
import { createConversation, getConvoMessages, getUserAndRecipientMessages, getUserChatDevices, getUserConversations, registerUserChatDevice, revokeUserChatDevice, updateUserConversations } from "@/services/v1/conversations";
import { ConvoKind } from "@/types";
import { SessionUser } from "@/types/user";
import { validateZodInput } from "@/utils";
import { Request, Response } from "express";
import { z } from "zod";


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

    const deviceId = req.params.id

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

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const cursor = req.query.cursor as string | undefined;

    const query: any = { conversationId: id };

    if (cursor) query._id = { $lt: cursor };
    // get user chat devices
    const result = await getConvoMessages(query, limit);

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