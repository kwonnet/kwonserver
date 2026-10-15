import { QuizScopeEnum } from "@/types/post";
import {PostScopeEnum, PostTypeEnum, ScopeEnum } from "@prisma/client";
import { z } from "zod/v3";

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
  text: z.string().trim().min(1,"Options cannot be empty").max(500),
});

// Schema for PollThread
const PollThreadSchema = z.object({
  scope: z.nativeEnum(ScopeEnum),
  isMultiVote: z.boolean(),
  duration: z.object({
    days: z.number().int().min(0).max(30),
    hours: z.number().int().min(0).max(23),
    minutes: z.number().int().min(0).max(59),
  }).refine(d=>d.days*1440+d.hours*60+d.minutes>0,"Set a positive duration"),
  options: z.array(PollOptionSchema).min(2).max(20).refine(options=>new Set(options.map(o=>o.text.toLowerCase())).size===options.length,"Options must be different"),
  continents: z.array(z.string()),
  countries: z.array(z.string()),
});

const QuizOptionSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1,"Options cannot be empty").max(500),
  isCorrect: z.boolean(),
});

const QuizThreadSchema = z.object({
  scope: z.nativeEnum(QuizScopeEnum),
  isPaid: z.boolean(),
  rewardAmount: z.number().finite().min(0).max(1000000000).refine(n=>Number(n.toFixed(2))===n,"Use at most two decimal places").default(0),
  maxWinners: z.number().int().min(0).max(50000).default(0),
  duration: z.object({
    days: z.number().int().min(0).max(30),
    hours: z.number().int().min(0).max(23),
    minutes: z.number().int().min(0).max(59),
  }).refine(d=>d.days*1440+d.hours*60+d.minutes>0,"Set a positive duration"),
  options: z.array(QuizOptionSchema).min(2).max(20).refine(options=>new Set(options.map(o=>o.text.toLowerCase())).size===options.length,"Options must be different"),
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
}).refine(p=>p.type!==PostTypeEnum.QUIZ||!!p.quiz,"Quiz settings required").refine(p=>p.type!==PostTypeEnum.POLL||!!p.poll,"Poll settings required");

// Schema for PostCreate
export const PostCreateSchema = z.object({
  expectedQuizFee: z.number().min(0).max(1).optional(),
  thread: z.array(PostThreadSchema).min(1).max(20),
  scheduleAt: z.union([z.string().datetime({offset: true}), z.date()]).refine(value => new Date(value).getTime() >= Date.now() + 5 * 60_000, 'Schedule at least five minutes in the future').optional(),
  location: z.string().optional(),
  isDraft: z.boolean(),
});


