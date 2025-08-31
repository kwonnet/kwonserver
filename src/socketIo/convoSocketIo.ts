import { MessageModel, SessionModel } from "@/db/models";
import logger from "@/logger";
import { getAuthUser, getPublicUser } from "@/services/v1/utils";
import { User } from "@/types";
import { getAuthTokenUser } from "@/utils";
import { DefaultEventsMap, Server, Socket } from "socket.io";

interface IoSocket
  extends Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> {
  data: {
    user: User;
  };
}

interface SessionEvelope {
  toUserId: string;
  toDeviceId: string;
  type: string;
  initPacket: {
    ephPub: any;
  };
  fromUserId: string;
  fromDeviceId: string;
}

interface MessageEnvelope {
  toUserId: string;
  toDeviceId: string;
  type: string;
  header: {
    dhPub_b64: string; // base64 of sender's DH public key for this message (X25519)
    pn: number; // previous chain length
    n: number; // message number within sending chain
  };
  ciphertext: string;
  nonce: string;
  fromUserId: string;
  fromDeviceId: string;
  meta?: { [key: string]: any };
}

interface SessionAckBody {
  fromUserId: string;
  fromDeviceId: string;
  toUserId: string;
  toDeviceId: string;
}

const convoSocketIo = (
  _io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) => {
  // connect to namespace
  const io = _io.of("/conversations");
  // perform auth
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Convo Unauthenticated user"));
      const user = getAuthTokenUser(token);
      // console.log("Authenticated Socket user ", user)
      if (!user) return next(new Error("Convo Error: Unauthenticated user"));
      socket.data.user = { ...user, name: user.username };
      logger.info(`Convo Socket io Authenticated - ${socket.id}`);
      next();
    } catch (error) {
      console.error("Convo Error authenticating socket user: ", error);
      next(new Error("Convo Error: Unauthenticated user"));
    }
  });
  // Set up socket connection
  io.on("connection", (socket: IoSocket) => {
    logger.info(`Connected conversations namespace - ${socket.id}`);
    // join conversation room
    socket.on("convo:join", ({ convoId }) => {
      const room = `convo:${convoId}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} joined conversation ${room}`);
    });
    // leave conversation room
    socket.on("convo:leave", ({ convoId }) => {
      const room = `convo:${convoId}`;
      socket.leave(room);
      logger.info(`Socket ${socket.id} left conversation ${room}`);
    });
    // join personal room
    socket.on("room:join", ({ room }) => {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room ${room}`);
    });
    /**
     * Handle bootstrap packets for first-time device-to-device sessions.
     * These are sent when no session exists yet between two devices.
     */
    socket.on("session:init", async (payload) => {
      // payload.envelopes: array of envelopes targeted per device
      const envelopes: SessionEvelope[] = payload.envelopes;
      for (const env of envelopes || []) {
        // Upsert session entry between devices
        const body = {
          fromUserId: env.fromUserId,
          fromDeviceId: env.fromDeviceId,
          toUserId: env.toUserId,
          toDeviceId: env.toDeviceId,
        };
        // update or create session
        const session = await SessionModel.findOneAndUpdate(
          body,
          {
            $setOnInsert: {
              initPacket: env.initPacket,
              createdAt: new Date(),
            },
          },
          { new: true, upsert: true }
        );
        // attempt live delivery to recipient device sockets
        io.to(`user:${env.toUserId}:device:${env.toDeviceId}`).emit(
          "session:init",
          env
        );
        // send back to the sender
        socket.emit("session:ack", {
          ok: true,
          sessionId: session._id,
          ...body,
        });

      }
    });
    /**
     * Acknowledge that the recipient consumed the bootstrap and established session.
     */
    socket.on(
      "session:ack",
      async ({
        fromUserId,
        fromDeviceId,
        toDeviceId,
        toUserId,
      }: SessionAckBody) => {
        await SessionModel.updateOne(
          {
            fromUserId,
            fromDeviceId,
            toUserId,
            toDeviceId,
          },
          { $set: { acknowledgedAt: new Date() } }
        );
      }
    );

    /**
     * Listen to conversation emitted messages
     */

    socket.on(
      "message:send",
      async (payload: { convoId: string; envelopes: MessageEnvelope[] }) => {
        const envelopes: MessageEnvelope[] = payload.envelopes || [];
        const user = socket.data.user
        for (const env of envelopes) {
          try {
            // 1. Ensure valid session exists between devices
            // const session = await SessionModel.findOne({
            //   fromUserId: env.fromUserId,
            //   fromDeviceId: env.fromDeviceId,
            //   toUserId: env.toUserId,
            //   toDeviceId: env.toDeviceId,
            //   acknowledgedAt: { $exists: true }, // means bootstrap acknowledged
            // });

            // if (!session) {
            //   console.warn(
            //     "No active session found for message, dropping:",
            //     env
            //   );
            //   socket.emit("message:sent", {
            //     ok: false,
            //     error: "No valid E2E session between devices",
            //     toUserId: env.toUserId,
            //     toDeviceId: env.toDeviceId,
            //   });
            //   continue;
            // }

            const isCurrentUser = user.id === env.fromUserId
            const now = new Date()
            // 2. Persist encrypted message
            const msg = await MessageModel.create({
              conversation: payload.convoId,
              fromUserId: env.fromUserId,
              fromDeviceId: env.fromDeviceId,
              toUserId: env.toUserId,
              toDeviceId: env.toDeviceId,
              ciphertext: env.ciphertext,
              nonce: env.nonce,
              header: env.header,
              meta: env?.meta,
              ...(isCurrentUser && {
                seen: [{userId: env.fromUserId, seenAt: now }],
                read: [{userId: env.fromUserId, readAt: now }]
              })
            });

            const sender = await getPublicUser(env.fromUserId)

            // 3. Deliver to live socket if recipient online
            io.to(`convo:${payload.convoId}`).emit("message:new",
              {
                ...msg.toJSON(),
                id: msg?._id?.toString(),
                sender,
              }
            );
            // io.to(`user:${env.toUserId}:device:${env.toDeviceId}`).emit(
            //   "message:new",
            //   {
            //     ...msg.toJSON(),
            //     id: msg?._id?.toString(),
            //     sender,
            //   }
            // );

            // 4. Confirm back to sender
            socket.emit("message:sent", {
              ok: true,
              messageId: msg._id?.toString(),
            });
          } catch (err) {
            console.error("message:send error", err);
            socket.emit("message:sent", {
              ok: false,
              error: "Message send failed",
            });
          }
        }
      }
    );

    // Listen to message read receipt

    socket.on("message:receipt", async(args: { id: string, convoId: string, userId: string}) =>{
      try {
        const now = new Date()
        const result = await MessageModel.findOneAndUpdate({_id: args.id, conversation: args.convoId, toUserId: args.userId}, { $push: { seen: { userId: args.userId, seenAt: now  }, read: { userId: args.userId, readAt: now  } }}, {new: true})
        if(result){
          io.to(`convo:${args.convoId}`).emit("message:receipt", {...args, seen: result.seen, read: result.read})
        }
      } catch (error) {
        
      }
    })




  });
};

export default convoSocketIo;
