import { paymentCurrencySchema, paymentGatewaySchema, paymentSourceSchema, externalPaymentCurrencySchema } from "./payment";
import { boolean, object, string } from "zod";
import { BillingCycleEnum, PostContext, PostMediaAction, PostMediaKind, PostMetricAction, PostMetricSource, PostScopeEnum, PostTypeEnum, ReportReason, RewardTypeEnum, ScopeEnum, TxnCurrencyEnum, TxnGatewayEnum, TxnSourceEnum, UserStatus } from "@prisma/client";
import { z } from "zod";
import { BonusTypeEnum, PlanTypeEnum } from "@/types";

export const purchaseCoinsZodSchema = z
  .object({
    packageId: z.string().trim(),
    currency: paymentCurrencySchema,
    meta: z
      .object({
        isFlw: z.boolean().optional(), // check if it is flutterwave payment
        from: z.string().trim().optional(),
        to: z.string().trim().optional(),
        amount: z.number(),
        gateway: paymentGatewaySchema,
        source: paymentSourceSchema,
        currency: paymentCurrencySchema,
        hash: z.string().trim().optional(),
        extHash: z.string().trim().optional(),
        status: z.string().trim().optional(),
        txnRef: z.string().trim().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const purchasePremiumZodSchema = z
  .object({
    planId: z.string().trim(),
    planName: z.string().trim(),
    amount: z.number(),
    planType: z.nativeEnum(BillingCycleEnum, {
      required_error: "Plan type is invalid",
    }),
    isRecurring: z.boolean(),
    currency: paymentCurrencySchema,
    source: paymentSourceSchema,
    gateway: paymentGatewaySchema,
    meta: z
      .object({
        from: z.string().trim().optional(),
        to: z.string().trim().optional(),
        hash: z.string().trim().optional(),
        extHash: z.string().trim().optional(),
        status: z.string().trim().optional(),
        price: z.number().optional(),
        discount: z.number().optional(),
        tierId: z.string().trim().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const TransferCoinsZodSchema = z.object({
  senderId: z.string({ required_error: "senderId must be a string" }).trim(),
  recipientId: z
    .string({ required_error: "recipientId must be a string" })
    .trim(),
  amount: z
    .number({ required_error: "amount must be a number" })
    .min(100, { message: "Minimum transfer amount is 100 Coins" }),
});

export const FundCoinsZodSchema = z.object({
  userId: z.string({ required_error: "userId must be a string" }).trim(),
  amount: z.number({ required_error: "amount must be a number" }),
  bonus: z.number({ required_error: "bonus must be a number" }),
});

export const DailyBonusZodSchema = z.object({
  userId: z.string({ required_error: "userId must be a string" }).trim(),
  amount: z.number({ required_error: "amount must be a number" }),
  date: z.string({ required_error: "date must be a string" }),
  type: z.nativeEnum(BonusTypeEnum, {
    required_error: "Bonus type must be either BONUS or ADS",
  }),
});

export const IDZodSchema = z.object({
  id: z.string({ required_error: "ID must be a string" }).trim(),
});

export const DailyTaskZodSchema = z.object({
  id: z.string({ required_error: "ID must be a string" }).trim(),
  code: z
    .union([
      z.string({ required_error: "ID must be a string" }).trim().optional(),
      z.null(),
      z.undefined(),
    ])
    .transform((val) => (val === "" || val == null ? undefined : val)),
});

export const PaginateZodSchema = z.object({
  userId: z.string({ required_error: "userId must be a string" }).trim(),
  limit: z
    .number({ required_error: "limit must be a number" })
    .min(10, { message: "Limit must be at least 10" }),
  page: z
    .number({ required_error: "page must be a number" })
    .min(0, { message: "Page must be at least 0" }),
});

export const QuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => Number.isInteger(val) && val > 0, {
      message: "Page must be a positive integer.",
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .refine((val) => Number.isInteger(val) && val > 0, {
      message: "Limit must be a positive integer.",
    }),
});

export const TaskZodSchema = z.object({
  title: z
    .string({ required_error: "title must be a string" })
    .trim()
    .min(3, { message: "Title must be at least 3 characters" })
    .max(100, { message: "Title must be at most 100 characters" }),
  code: z.string({ required_error: "code must be a string" }).trim().optional(),
  description: z
    .string({ required_error: "description must be a string" })
    .trim()
    .min(3, { message: "Description must be at least 3 characters" })
    .max(100, { message: "Description must be at most 500 characters" }),
  url: z
    .string({ required_error: "url must be valid" })
    .url({ message: "url must be valid" })
    .trim(),
  reward: z
    .union([z.string(), z.number()])
    .refine((val) => !isNaN(Number(val)), {
      message: "Reward must be a valid number.",
    })
    .transform((val) => Number(val)),
  rewardType: z.nativeEnum(RewardTypeEnum, {
    required_error: "reward type must be of the above values",
  }),
});

export const FlutterwaveConfigZodSchema = z
  .object({
    public_key: z
      .string({ required_error: "public_key is required & must be a string" })
      .trim(),
    redirect_url: z
      .string({ required_error: "redirect_url is required & must be a string" })
      .trim(),
    tx_ref: z
      .string({ required_error: "tx_ref is required & must be a string" })
      .trim(),
    amount: z.number({
      required_error: "amount is required & must be a string",
    }),
    currency: externalPaymentCurrencySchema,
    payment_plan: z
      .string({ required_error: "Payment plan is must be atring or undefined" })
      .trim()
      .optional(),
    payment_options: z
      .string({
        required_error: "payment_options is required & must be a string",
      })
      .trim(),
    customer: z.object({
      email: z
        .string({
          required_error: "customer email is required & must be a string",
        })
        .trim(),
      name: z
        .string({
          required_error: "customer name is required & must be a string",
        })
        .trim(),
      phone_number: z
        .string({
          required_error:
            "customer phone_number is required & must be a string",
        })
        .trim(),
    }),
    customizations: z
      .object({
        title: z
          .string({
            required_error:
              "customizations title is required & must be a string",
          })
          .trim(),
        description: z
          .string({
            required_error:
              "customizations description is required & must be a string",
          })
          .trim(),
        logo: z
          .string({
            required_error:
              "customizations logo is required & must be a string",
          })
          .trim(),
      })
      .passthrough(),
    meta: z.object({}).passthrough(),
  })
  .passthrough();

export const VerifyFlwPaymentZodSchema = z
  .object({
    status: z
      .string({ required_error: "Status is required & must be a string" })
      .trim(),
    tx_ref: z.union([z.string(), z.number()], {
      required_error: "Txn Ref is required",
    }),
    transaction_id: z.union([z.string(), z.number()], {
      required_error: "Txn ID is required",
    }),
  })
  .passthrough();

export const PostZodSchema = z.array(
  z
    .object({
      content: z
        .string({ required_error: "Content must be a string" })
        .trim()
        .optional(),

      type: z.nativeEnum(PostTypeEnum, {
        required_error: "Post type is invalid",
      }),

      scope: z.nativeEnum(PostScopeEnum, {
        required_error: "Post scope is invalid",
      }),

      media: z
        .array(
          z.object({
            fileId: z.string(), // Assuming fileId is a UUID
            name: z.string().min(1),
            url: z.string().url(),
            height: z.number().positive(),
            width: z.number().positive(),
            size: z.number().positive(), // File size in bytes
            thumbnailUrl: z.string().url().optional(),
            fileType: z.string().min(1), // e.g., "image/png", "video/mp4"
            filePath: z.string().min(1),
            altText: z.string().min(0).optional(), // Optional for accessibility
            flags: z.array(z.string()).default([]), // Ensures an array of strings
          })
        )
        .default([]),

      poll: z
        .object({
          options: z
            .array(
              z.object({
                id: z.string().min(1, "Option ID cannot be empty"), // Ensure ID is not empty
                text: z.string().min(1, "Poll option text cannot be empty"), // Ensure text is not empty
              })
            )
            .min(2, "A poll must have at least two options"), // Ensure at least two options

          continents: z
            .array(z.string().min(1, "Continents values must be string"))
            .optional()
            .default([]), // Can be empty but values must be non-empty strings
          countries: z
            .array(z.string().min(1, "Countries values must be string"))
            .optional()
            .default([]), // Can be empty but values must be non-empty strings
          scope: z.nativeEnum(ScopeEnum),
          isMultiVote: z.boolean(),

          duration: z.object({
            days: z.number().min(0).max(7), // Ensure days are between 0 and 7
            hours: z.number().min(0).max(23), // Hours should be valid
            minutes: z.number().min(0).max(59), // Minutes should be valid
          }),
        })
        .optional(), // Allows `poll` to be undefined
    })
    .passthrough()
);

export const QueryParams = z.object({
  page: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(1)
  ),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(21)
  ),
  type: z.string().optional(),
  slug: z.string({message: 'Slug must be specified'}).optional(),
  kind: z.string({message: 'Kind must be specified'}).optional(),
  hidden: z.coerce.boolean().optional().default(false),
  duration: z.string({message: "Duration must be specified"}).optional(),
  country: z.string({message: "Country must be valid"}).optional().nullable().default(null)
});

export const VisitorCreateSchema = z.object({
  postId: z.string({ message: "Post ID must string" }).optional(),
  sessionId: z.string({ message: "Session ID must be string" }), // assuming post.id is a string
  userId: z.string({ message: "User ID must string" }),
});

export const ReportCreateSchema = z.object({
  id: z.string(), // assuming post.id is a string
  code: z.nativeEnum(ReportReason),
  message: z.string().optional(),
  meta: z.object({
    code: z.nativeEnum(ReportReason),
    title: z.string(),
    description: z.string(),
  }),
});

export type ReportSchema = z.infer<typeof ReportCreateSchema>;

export const CreatePostPinSchema = z.object({
  id: z.string(), // assuming post.id is a string
  context: z.nativeEnum(PostContext),
});

export const CreatePostHighlightSchema = z.object({
  id: z.string(), // assuming post.id is a string
  context: z.nativeEnum(PostContext),
});

export const CreatePostShareSchema = z.object({
  id: z.string({ message: "Post ID must string" }), // assuming post.id is a string
  sessionId: z
    .string({ message: "Session ID must be string" })
    .optional()
    .nullish(),
  timestamp: z.string(),
  kind: z.string().optional()
});

export const CreatePostImpressionSchema = z.object({
  id: z.string({ message: "Post ID must string" }), // assuming post.id is a string
  sessionId: z
    .string({ message: "Session ID must be string" })
    .optional()
    .nullish(),
  timestamp: z.string(),
});

export const CreatePostViewSchema = z.object({
  id: z.string({ message: "Post ID must string" }), // assuming post.id is a string
  sessionId: z
    .string({ message: "Session ID must be string" })
    .optional()
    .nullish(),
  timestamp: z.string({ message: "Timestamp must be a date string" }),
  duration: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(5)
  ),
});

export const CreatePostClickSchema = z.object({
  sessionId: z
    .string({ message: "Session ID must be string" })
    .optional()
    .nullish(),
  timestamp: z.string({ message: "Timestamp must be a date string" }),
  action: z.nativeEnum(PostMetricAction, { message: "action must be an enum" }),
  source: z.nativeEnum(PostMetricSource, { message: "source must be an enum" }),
});

export const CreatePostMediaLogSchema = z.object({
  postId: z.string({ message: "Post ID must string" }), // assuming post.id is a string
  mediaId: z.string({ message: "Media ID must string" }), // assuming post.media.id is a string
  sessionId: z
    .string({ message: "Session ID must be string" })
    .optional()
    .nullish(),
  referer: z
    .string({ message: "referer must be a string" })
    .optional()
    .nullish(),
  muted: z.coerce.boolean().optional().default(true),
  timestamp: z.string({ message: "Timestamp must be a date string" }),
  userId: z.string({ message: "User ID must string" }).optional().nullish(),
  duration: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(0)
  ),
  playbackRate: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(0)
  ),
  watchedPct: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(0)
  ),
  sessionDuration: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(0)
  ),
  kind: z.nativeEnum(PostMediaKind),
  action: z.nativeEnum(PostMediaAction),
});

export const CreatePostTipSchema = z.object({
  postId: z.string({ message: "Post ID must string" }),
  tipId: z.string({ message: "Tip ID must string" }),
  recipientId: z.string({ message: "Recipient ID must be string" }),
  isAnon: z.boolean().optional().default(false),
  message: z.string({ message: "Message must string" }).optional(),
  // timestamp: z.string({message: "Timestamp must be a date string"}),
});

export const SearchQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
  kind: z.string().optional(),
  page: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(1)
  ),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().default(50)
  ),
});

export const updateAccountStatusSchema = z.object({
  userId: z.string({message: "User ID must be a string"}),
  status: z.nativeEnum(UserStatus, {message: "Status must be any of status values"}),
});