import mongoose, { Document, Schema } from "mongoose";

interface ParticipantDelete {
  userId: string;
  deletedAt: Date;
}

interface ChatSeen {
  userId: string;
  seenAt: string;
}

interface ChatRead {
  userId: string;
  readAt: string;
}

interface ChatReaction {
  userId: string;
  reaction: string;
  reactedAt?: Date;
}

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId;
  fromUserId: string;
  fromDeviceId: string;
  toUserId: string;
  toDeviceId: string;
  ciphertext: string;
  nonce: string;
  header: { [key: string]: any }; // Double Ratchet header
  meta?: any;
  deletedFor: ParticipantDelete[];
  deletedAt?: Date;
  seen: ChatSeen[];
  read: ChatRead[];
  reactions: ChatReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    fromUserId: { type: String, required: true },
    fromDeviceId: { type: String, required: true },
    toUserId: { type: String, required: true },
    toDeviceId: { type: String, required: true },
    ciphertext: { type: String, required: true },
    nonce: { type: String, required: true },
    header: { type: Schema.Types.Mixed, required: true },
    meta: { type: Schema.Types.Mixed, default: null },
    deletedAt: { type: Date, default: null },
    deletedFor: [
      {
        userId: { type: String, required: true },
        deletedAt: { type: Date, default: Date.now },
      },
    ],
    // Seen and read states per participant
    seen: [
      {
        userId: { type: String, required: true },
        seenAt: { type: Date, default: Date.now },
      },
    ],
    read: [
      {
        userId: { type: String, required: true },
        readAt: { type: Date, default: Date.now },
      },
    ],
    reactions: [
      {
        userId: { type: String, required: true },
        reaction: { type: String, required: true }, // e.g. "👍", "❤️", "😂"
        reactedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        ret.id = ret._id!.toString();
        delete ret._id;
      },
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        ret.id = ret?._id!.toString()
        delete ret._id;
      },
    },
  }
);

MessageSchema.index({ conversation: 1, _id: -1 }); // cursor pagination

// Allow sender to delete only within 15 minutes
MessageSchema.methods.canDeleteForEveryone = function (userId: string) {
  if (this.senderId !== userId) return false;
  const diffMinutes = (Date.now() - this.createdAt.getTime()) / (1000 * 60);
  return diffMinutes <= 15;
};

export default mongoose.model("Message", MessageSchema);
