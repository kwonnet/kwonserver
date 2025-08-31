"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostCreateSchema = void 0;
const post_1 = require("@/@types/post");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
// Schema for PostMedia
const PostMediaSchema = zod_1.z.object({
    fileId: zod_1.z.string(),
    name: zod_1.z.string(),
    url: zod_1.z.string(),
    height: zod_1.z.number(),
    width: zod_1.z.number(),
    size: zod_1.z.number(),
    thumbnailUrl: zod_1.z.string().optional(),
    fileType: zod_1.z.string(),
    filePath: zod_1.z.string(),
    altText: zod_1.z.string().optional(),
    flags: zod_1.z.array(zod_1.z.string()),
});
// Schema for PollOption
const PollOptionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
});
// Schema for PollThread
const PollThreadSchema = zod_1.z.object({
    scope: zod_1.z.nativeEnum(client_1.ScopeEnum),
    isMultiVote: zod_1.z.boolean(),
    duration: zod_1.z.object({
        days: zod_1.z.number(),
        hours: zod_1.z.number(),
        minutes: zod_1.z.number(),
    }),
    options: zod_1.z.array(PollOptionSchema),
    continents: zod_1.z.array(zod_1.z.string()),
    countries: zod_1.z.array(zod_1.z.string()),
});
const QuizOptionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
    isCorrect: zod_1.z.boolean(),
});
const QuizThreadSchema = zod_1.z.object({
    scope: zod_1.z.nativeEnum(post_1.QuizScopeEnum),
    isPaid: zod_1.z.boolean(),
    rewardAmount: zod_1.z.number().default(0),
    maxWinners: zod_1.z.number().default(0),
    duration: zod_1.z.object({
        days: zod_1.z.number(),
        hours: zod_1.z.number(),
        minutes: zod_1.z.number(),
    }),
    options: zod_1.z.array(QuizOptionSchema),
    continents: zod_1.z.array(zod_1.z.string()).default([]),
    countries: zod_1.z.array(zod_1.z.string()).default([]),
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
const PostThreadSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.PostTypeEnum), // Replace with actual PostType enum values
    media: zod_1.z.array(PostMediaSchema),
    content: zod_1.z.string(),
    poll: PollThreadSchema.optional(),
    quiz: QuizThreadSchema.optional(),
    tags: zod_1.z.array(zod_1.z.string().toLowerCase()).default([]),
    mentions: zod_1.z.array(zod_1.z.string()).default([]),
    tagUsers: zod_1.z.array(zod_1.z.string()).default([]),
    scope: zod_1.z.nativeEnum(client_1.PostScopeEnum),
});
// Schema for PostCreate
exports.PostCreateSchema = zod_1.z.object({
    thread: zod_1.z.array(PostThreadSchema),
    scheduleAt: zod_1.z.union([zod_1.z.string(), zod_1.z.date()]).optional(),
    location: zod_1.z.string().optional(),
    isDraft: zod_1.z.boolean(),
});
