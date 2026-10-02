import { ConversationModel, DeviceModel, MessageModel } from "@/db/models";
import { getPublicUser } from "../utils";
import { IOneTimePreKey } from "@/db/models/DeviceModel";
import { IMessage } from "@/db/models/MessageModel";
import { ConvoKind } from "@/types";

export const createConversation = async (body: {
  senderId: string;
  recipientId: string;
  kind: ConvoKind;
}) => {
  try {
    // check if converstaion exists
    const convo = await ConversationModel.findOne({
      $or: [
        {
          "initiator.id": body.senderId,
          "responder.id": body.recipientId,
          kind: body.kind,
        },
        {
          "initiator.id": body.recipientId,
          "responder.id": body.senderId,
          kind: body.kind,
        },
      ],
    });
    if (convo) {
      return { data: convo.toJSON(), status: 200 };
    }
    // if doesn't exist, create new conversation
    const result = await ConversationModel.create({
      initiator: {
        id: body.senderId,
        acceptedAt: new Date(),
      },
      responder: {
        id: body.recipientId,
        ...(body.recipientId === body.senderId && { acceptedAt: new Date()})
      },
      kind: body.kind,
    });
    return { data: result.toJSON(), status: 201 };
  } catch (error) {
    return { data: "Error initiating conversation ", status: 500 };
  }
};

export const registerUserChatDevice = async (body: {
  userId: string;
  deviceId: string;
  identityPubEd25519: string;
  identityPubX25519: string;
  signedPreKeyPubX25519: string;
  signedPreKeySignature: string;
  oneTimePreKeys: IOneTimePreKey[];
}) => {
  try {
    const {
      deviceId,
      identityPubEd25519,
      identityPubX25519,
      oneTimePreKeys,
      signedPreKeyPubX25519,
      signedPreKeySignature,
      userId,
    } = body;

    await DeviceModel.updateOne(
      { userId, deviceId },
      {
        $set: {
          identityPubEd25519,
          identityPubX25519,
          signedPreKeyPubX25519,
          signedPreKeySignature,
        },
        $push: { oneTimePreKeys: { $each: oneTimePreKeys || [] } },
      },
      { upsert: true }
    );

    return { data: null, status: 201 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserChatDevices = async (userId: string) => {
  try {
    const devices = await DeviceModel.find({ userId, revokedAt: null });

    const outputs = [];

    for (const d of devices) {
      // find an available one-time prekey
      const available =
        d.oneTimePreKeys && d.oneTimePreKeys.find((k) => !k.consumedAt);
      let oneTime = null;
      if (available) {
        // atomically mark consumed using updateOne
        const result = await DeviceModel.updateOne(
          {
            _id: d._id,
            oneTimePreKeys: { $elemMatch: {
              keyId: available.keyId, consumedAt: { $exists: false },
            } },
          },
          { $set: { "oneTimePreKeys.$.consumedAt": new Date() } }
        );
        if (result.modifiedCount === 1) {
          oneTime = { keyId: available.keyId, pubX25519: available.pubX25519 };
        }
      }

      outputs.push({
        deviceId: d.deviceId,
        identityPubEd25519: d.identityPubEd25519,
        identityPubX25519: d.identityPubX25519,
        signedPreKeyPubX25519: d.signedPreKeyPubX25519,
        signedPreKeySignature: d.signedPreKeySignature,
        oneTimePreKey: oneTime,
      });
    }

    return { data: outputs, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred trying to get devices, please try again",
      status: 500,
    };
  }
};

export const getUserConversations = async (args: {
  userId: string;
  kind: string;
  limit: number;
  page: number;
}) => {
  try {
    const { kind, limit, page, userId } = args;

    const convos = await ConversationModel.aggregate([
      // step 1: Match converstaions involving current user
      {
        $match: {
          $or: [{ "initiator.id": userId }, { "responder.id": userId }],
          ...(kind === "requests"
            ? { $and: [{"responder.acceptedAt": { $eq: null }}] }
            : {
                $and: [{"kind": kind, "responder.acceptedAt": { $ne: null }}],
                // "seen.userId": { $ne: args.recipientId },
              }),
        },
      },
      // step 2: Join with the messages collection
      {
        $lookup: {
          from: "messages",
          localField: "_id",
          foreignField: "conversation",
          as: "messages",
        },
      },
      // step 3: Add a field for unread message count
      {
        $addFields: {
          unreadCount: {
            $size: {
              $filter: {
                input: "$messages",
                as: "msg",
                cond: {
                  $and: [
                    { $ne: ["$$msg.fromUserId", userId] },
                    { $not: { $in: [userId, "$$msg.read.userId"] } },
                  ],
                },
              },
            },
          },
          unseenCount: {
            $size: {
              $filter: {
                input: "$messages",
                as: "msg",
                cond: {
                  $and: [
                    { $ne: ["$$msg.fromUserId", userId] },
                    { $not: { $in: [userId, "$$msg.seen.userId"] } },
                  ],
                },
              },
            },
          },
          lastMessage: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$messages",
                  as: "msg",
                  cond: {
                    $eq: ["$$msg.createdAt", { $max: "$messages.createdAt" }],
                  },
                },
              },
              0,
            ],
          },
        },
      },
      // step 4: Sort conversations by the last message timesatmp
      {
        $sort: { "lastMessage.createdAt": -1 },
        // $limit: limit,
        // $skip: (page - 1) * limit
      },
      // Apply pagination after sorting, before profile hydration.
      { $skip: Math.max(0, page - 1) * limit },
      { $limit: limit },
      // step 5: Clean up the final output
      {
        $project: {
          _id: 1,
          kind: 1,
          initiator: 1,
          responder: 1,
          unreadCount: 1,
          unseenCount: 1,
          lastMessage: 1,
        },
      },
    ]);

    const IDs = convos.map((r) => [r.initiator.id, r.responder.id]).flat();

    const convoUserSet = new Set(IDs);

    const convoUserIDs = Array.from(convoUserSet);

    const users = await Promise.all(
      convoUserIDs.map((id) => getPublicUser(id))
    );

    const mapUsers = Object.fromEntries(users.map((user) => [user.id, user]));

    const conversations = convos.map((convo) => {
      // const convo = _convo
      const lastMessage = convo?.lastMessage;
      return {
        ...convo,
        id: convo._id?.toString(),
        initiator: {
          ...convo.initiator,
          user: mapUsers[convo.initiator.id],
        },
        responder: {
          ...convo.responder,
          user: mapUsers[convo.responder.id],
        },
        ...(lastMessage && {
          lastMessage: {
            ...lastMessage,
            id: lastMessage._id?.toString(),
            sender: mapUsers[lastMessage.fromUserId],
          },
        }),
      };
    });

    return { data: conversations, status: 200 };
  } catch (error) {
    console.log(error);
    return {
      data: "Error occurred trying to user chat conversations, please try again",
      status: 500,
    };
  }
};

type ChatMessage = IMessage & { _id: any };

const composeConvoMessages = async (
  convoId: string,
  messages: ChatMessage[]
) => {
  try {
    const convo = await ConversationModel.findOne({ _id: convoId });
    if (convo) {
      const users = await Promise.all([
        getPublicUser(convo.initiator.id),
        getPublicUser(convo.responder.id),
      ]);
      const msgs = messages.map((m) => ({
        ...m.toJSON(),
        sender: users.find((u) => u.id === m.fromUserId),
      }));

      return msgs;
    }

    return messages.map((m) => m.toJSON());
  } catch (error) {
    throw error;
  }
};

export const getUserAndRecipientMessages = async (
  userId: string,
  recipientId: string
) => {
  try {
    const convos = await ConversationModel.aggregate([
      // step 1: Match converstaions involving current user
      {
        $match: {
          $or: [
            { "initiator.id": userId, "responder.id": recipientId },
            { "initiator.id": recipientId, "responder.id": userId },
          ],
        },
      },
      // step 2: Join with the messages collection
      {
        $lookup: {
          from: "messages",
          localField: "_id",
          foreignField: "conversation",
          as: "messages",
        },
      },
      // step 3: Add a field for unread message count
      {
        $addFields: {
          unreadCount: {
            $size: {
              $filter: {
                input: "$messages",
                as: "msg",
                cond: {
                  $and: [
                    { $ne: ["$$msg.fromUserId", userId] },
                    { $not: { $in: [userId, "$$msg.read.userId"] } },
                  ],
                },
              },
            },
          },
          unseenCount: {
            $size: {
              $filter: {
                input: "$messages",
                as: "msg",
                cond: {
                  $and: [
                    { $ne: ["$$msg.fromUserId", userId] },
                    { $not: { $in: [userId, "$$msg.seen.userId"] } },
                  ],
                },
              },
            },
          },
        },
      },
      // step 5: Clean up the final output
      {
        $project: {
          _id: 1,
          initiator: 1,
          responder: 1,
          unreadCount: 1,
          unseenCount: 1,
        },
      },
    ]);
    // const convo = await ConversationModel.findOne({
    //   $or: [
    //     { initiator: { id: userId }, responder: { id: recipientId } },
    //     { initiator: { id: recipientId }, responder: { id: userId } },
    //   ],
    // });

    const recipient = await getPublicUser(recipientId);

    const recipientDevices = await DeviceModel.find({ userId: recipientId, revokedAt: null });

    if (convos.length === 0) {
      return {
        data: { recipient, recipientDevices, messages: [] },
        status: 200,
      };
    }

    const convo = convos[0];

    const convoId = convo?._id?.toString();

    const _messages = await MessageModel.find({ conversation: convoId })
      .sort({ _id: -1 })
      .limit(30);
    const messages = _messages.reverse();

    const result = await composeConvoMessages(
      convoId!,
      messages as ChatMessage[]
    );

    return {
      data: {
        recipient,
        recipientDevices,
        messages: result,
        convo: { ...convo, id: convoId },
      },
      status: 200,
    };
  } catch (error) {
    return {
      data: "Error occurred trying to user chat conversations, please try again",
      status: 500,
    };
  }
};

export const getConvoMessages = async (
  query: { [key: string]: any },
  limit: number,
  userId: string
) => {
  try {
    const convo = await ConversationModel.findOne({
      _id: query.conversationId,
      $or: [{ "initiator.id": userId }, { "responder.id": userId }],
    });
    if (!convo) return { data: "Conversation not found", status: 404 };
    const messageQuery = {
      conversation: query.conversationId,
      ...(query._id && { _id: query._id }),
    };
    const msgs = await MessageModel.find(messageQuery)
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = msgs.length > limit;

    const results = hasMore ? msgs.slice(0, -1) : msgs;

    const messages = [...results].reverse();

    const nextCursor = hasMore ? results[results.length - 1]._id : null;

    const result = await composeConvoMessages(
      query.conversationId,
      messages as ChatMessage[]
    );

    return { data: { messages: result, nextCursor }, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred trying to get conversation messages, please try again",
      status: 500,
    };
  }
};

export const revokeUserChatDevice = async ({
  userId,
  deviceId,
}: {
  deviceId: string;
  userId: string;
}) => {
  try {
    await DeviceModel.updateOne(
      { userId, deviceId },
      { $set: { revokedAt: new Date() } }
    );

    return { data: null, status: 200 };
  } catch (error) {
    return {
      data: "Error occurred trying to revoke device, please try again",
      status: 500,
    };
  }
};

export const updateUserConversations = async (args: {
  recipientId: string;
  convoId?: string | null;
  isSeen?: boolean;
  isRead?: boolean;
}) => {
  try {
    const date = new Date();
    let filter: { [key: string]: any } = {
      toUserId: args.recipientId,
      ...(args.convoId && { conversation: args.convoId }),
      "seen.userId": { $ne: args.recipientId },
    };
    let query: { [key: string]: any } = {
      $push: { seen: { userId: args.recipientId, seenAt: date } },
    };

    if (args.convoId && args.isRead && args.isSeen) {
      // Match each missing receipt separately; a message may already be seen
      // but unread (or vice versa). Pushing both duplicates the existing receipt.
      await MessageModel.updateMany(
        { toUserId: args.recipientId, conversation: args.convoId, "read.userId": { $ne: args.recipientId } },
        { $push: { read: { userId: args.recipientId, readAt: date } } }
      );
      filter = {
        toUserId: args.recipientId,
        conversation: args.convoId,
        "seen.userId": { $ne: args.recipientId },
      };
    } else if (args.convoId && args.isRead) {
      filter = {
        toUserId: args.recipientId,
        conversation: args.convoId,
        "read.userId": { $ne: args.recipientId },
      };
      query = { $push: { read: { userId: args.recipientId, readAt: date } } };
    }
    await MessageModel.updateMany(filter, query);
    return { data: args, status: 200 };
  } catch (error) {
    console.log(error);
    return { data: "Error occurred, please try again", status: 500 };
  }
};
