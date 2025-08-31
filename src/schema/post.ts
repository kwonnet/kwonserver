import { QuizScopeEnum } from "@/types/post";
import {PostScopeEnum, PostTypeEnum, ScopeEnum } from "@prisma/client";
import { z } from "zod";

// Schema for PostMedia
const PostMediaSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  url: z.string(),
  height: z.number(),
  width: z.number(),
  size: z.number(),
  thumbnailUrl: z.string().optional(),
  fileType: z.string(),
  filePath: z.string(),
  altText: z.string().optional(),
  flags: z.array(z.string()),
});

// Schema for PollOption
const PollOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

// Schema for PollThread
const PollThreadSchema = z.object({
  scope: z.nativeEnum(ScopeEnum),
  isMultiVote: z.boolean(),
  duration: z.object({
    days: z.number(),
    hours: z.number(),
    minutes: z.number(),
  }),
  options: z.array(PollOptionSchema),
  continents: z.array(z.string()),
  countries: z.array(z.string()),
});

const QuizOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
});

const QuizThreadSchema = z.object({
  scope: z.nativeEnum(QuizScopeEnum),
  isPaid: z.boolean(),
  rewardAmount: z.number().default(0),
  maxWinners: z.number().default(0),
  duration: z.object({
    days: z.number(),
    hours: z.number(),
    minutes: z.number(),
  }),
  options: z.array(QuizOptionSchema),
  continents: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
})
  .refine((data) => !data.isPaid || data.rewardAmount >= 500, {
    message: "Reward must be at least 500 for paid quizzes.",
    path: ["rewardAmount"],
  })
  .refine((data) => !data.isPaid || data.maxWinners > 0, {
    message: "Max winners must be greater than 0 for paid quizzes.",
    path: ["maxWinners"],
  })
  .refine((data) => data.options.some((option) => option.isCorrect), {
    message: "At least one option must be marked as correct.",
    path: ["options"],
  });


// Schema for PostThread
const PostThreadSchema = z.object({
  type: z.nativeEnum(PostTypeEnum), // Replace with actual PostType enum values
  media: z.array(PostMediaSchema),
  content: z.string(),
  poll: PollThreadSchema.optional(),
  quiz: QuizThreadSchema.optional(),
  tags: z.array(z.string().toLowerCase()).default([]),
  mentions: z.array(z.string()).default([]),
  tagUsers: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  continents: z.array(z.string()).default([]),
  scope: z.nativeEnum(PostScopeEnum),
});

// Schema for PostCreate
export const PostCreateSchema = z.object({
  thread: z.array(PostThreadSchema),
  scheduleAt: z.union([z.string(), z.date()]).optional(),
  location: z.string().optional(),
  isDraft: z.boolean(),
});


