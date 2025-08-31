import { UserFollowAction } from "@/types";
import { z } from "zod";

// Schema for PollOption
export const FollowUserSchema = z.object({
  senderId: z.string({message: "Sender must be a string"}),
  recipientId: z.string({message: "Recipient must be a string"}),
  action: z.nativeEnum(UserFollowAction, { message: "Action must be the provided values"})
});

// Schema for PollOption
export const UserLocationSchema = z.object({
  latitude: z.number({message: "Latitude must be a number"}),
  longitude: z.number({message: "Longitude must be a number"}),
});