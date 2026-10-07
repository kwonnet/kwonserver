import mongoose, { Document, Schema } from "mongoose";

export interface IOneTimePreKey {
  keyId: number;
  pubX25519: string;
  consumedAt?: Date;
  createdAt?: Date;
}

export interface IDevice extends Document {
  id: string;
  userId: string; // Prisma user id
  deviceId: string; // device id string (uuid)
  identityPubEd25519: string; // base64
  identityPubX25519: string; // base64
  signedPreKeyPubX25519: string; // base64
  signedPreKeySignature: string; // base64
  oneTimePreKeys: IOneTimePreKey[];
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const OneTimePreKeySchema = new Schema<IOneTimePreKey>(
  {
    keyId: Number,
    pubX25519: String,
    consumedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeviceSchema = new Schema<IDevice>(
  {
    userId: { type: String, index: true, required: true },
    deviceId: { type: String, required: true },
    identityPubEd25519: String,
    identityPubX25519: String,
    signedPreKeyPubX25519: String,
    signedPreKeySignature: String,
    revokedAt: { type: Date, default: null },
    oneTimePreKeys: { type: [OneTimePreKeySchema], default: [] },
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

DeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export default mongoose.model("Device", DeviceSchema);
