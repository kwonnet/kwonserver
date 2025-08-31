import mongoose, { Schema, Document } from "mongoose";



export interface IAnonMessage extends Document {
    ciphertext: string;
    nonce: string;
    header: {[key:string]: any};
    kind: string;
    meta: {[key:string]: any};
}

const MessageSchema = new Schema({
    ciphertext: { type: String, required: true },
    nonce: { type: String, required: true },
    header: { type: Schema.Types.Mixed, required: true },
    kind: { type: String, required: true },
    meta: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true})

export interface IAnonymousConvo extends Document {
  recipientId: string;
  messages: IAnonMessage[]
  createdAt: Date;
  updatedAt: Date;
}

const AnonymousConvoSchema = new Schema<IAnonymousConvo>(
  {
    recipientId: { type: String, required: true },
    messages: [MessageSchema]
    
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
AnonymousConvoSchema.index(
  { "createdAt": 1 },
  {expireAfterSeconds: 86400 * 7}
);

export default mongoose.model<IAnonymousConvo>(
  "AnonymousConvo",
  AnonymousConvoSchema
);
