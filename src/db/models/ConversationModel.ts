import mongoose, { Schema, Document } from "mongoose";
import { IMessage } from "./MessageModel";
import { ConvoKind } from "@/types";

interface ConversationParticipant {
  id: string; // reference to User ID in PostgreSQL
  deletedAt?: Date; // if the user deleted the conversation on their side
  archivedAt?: Date; // If they archived it
  acceptedAt?: Date;
  isPaid?: boolean; // whether this user requires paid messages
  muted?: boolean; // optional mute flag
}

export interface IConversation extends Document {
  initiator: ConversationParticipant;
  responder: ConversationParticipant;
  kind: ConvoKind
  lastMessage: IMessage;
  createdAt: Date;
  updatedAt: Date;
}

const Participant = new Schema<ConversationParticipant>(
  {
    id: { type: String },
    isPaid: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null }

  },
  { _id: false }
);
const ConversationSchema = new Schema<IConversation>(
  {
    initiator: { type: Participant, required: true },
    responder: { type: Participant, required: true },
    kind: { type: String, default: ConvoKind.CHAT }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const {_id, ...rest} = ret;
        return {...rest, id: _id.toString()};
      },
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        const {_id, ...rest} = ret;
        return {...rest, id: _id.toString()};
      },
    },
  }
);
ConversationSchema.virtual("lastMessage",{
    ref: "Message",
    localField: "_id",
    foreignField: "conversation",
    justOne: true,
    options: {
        sort: { timestamp: -1 }
    }
});
ConversationSchema.set('toObject', { virtuals: true})
ConversationSchema.set('toJSON', { virtuals: true})
ConversationSchema.index(
  { "initiator.id": 1, "responder.id": 1, "kind": 1 },
  { unique: true }
);

export default mongoose.model<IConversation>(
  "Conversation",
  ConversationSchema
);
