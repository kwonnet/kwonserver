"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserLocationSchema = exports.FollowUserSchema = void 0;
const _types_1 = require("@/@types");
const zod_1 = require("zod");
// Schema for PollOption
exports.FollowUserSchema = zod_1.z.object({
    senderId: zod_1.z.string({ message: "Sender must be a string" }),
    recipientId: zod_1.z.string({ message: "Recipient must be a string" }),
    action: zod_1.z.nativeEnum(_types_1.UserFollowAction, { message: "Action must be the provided values" })
});
// Schema for PollOption
exports.UserLocationSchema = zod_1.z.object({
    latitude: zod_1.z.number({ message: "Latitude must be a number" }),
    longitude: zod_1.z.number({ message: "Longitude must be a number" }),
});
