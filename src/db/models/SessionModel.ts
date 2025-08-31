import mongoose, { Schema, Document } from "mongoose";

export interface ISession extends Document {
  conversation: string | null; // can be null for first bootstrap
  fromUserId: string;
  fromDeviceId: string;
  toUserId: string;
  toDeviceId: string;
  // bootstrap initPacket fields
  initPacket?: {
    identityKey?: string; // long-term identity pubkey
    ephPub?: string; // ephemeral pubkey used in X3DH
    preKeyId?: string;
    oneTimePreKeyId?: string;
  };
  // session state
  rootKey_b64?: string; // base64 root key for DoubleRatchet
  createdAt: Date;
  acknowledgedAt?: Date;
  expiredAt?: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    conversation: { type: String, default: null },

    fromUserId: { type: String, required: true },
    fromDeviceId: { type: String, required: true },
    toUserId: { type: String, required: true },
    toDeviceId: { type: String, required: true },

    initPacket: {
      identityKey: String,
      ephPub: String,
      preKeyId: String,
      oneTimePreKeyId: String,
    },

    rootKey_b64: { type: String },

    acknowledgedAt: { type: Date },
    expiredAt: { type: Date },
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

// ensure uniqueness per device pair
SessionSchema.index(
  { fromUserId: 1, fromDeviceId: 1, toUserId: 1, toDeviceId: 1 },
  { unique: true }
);

export default mongoose.model<ISession>("Session", SessionSchema);
