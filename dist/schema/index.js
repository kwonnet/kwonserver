"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactivateSchema = exports.SearchQuerySchema = exports.CreatePostTipSchema = exports.CreatePostMediaLogSchema = exports.CreatePostClickSchema = exports.CreatePostViewSchema = exports.CreatePostImpressionSchema = exports.CreatePostHighlightSchema = exports.CreatePostPinSchema = exports.ReportCreateSchema = exports.VisitorCreateSchema = exports.QueryParams = exports.PostZodSchema = exports.VerifyFlwPaymentZodSchema = exports.FlutterwaveConfigZodSchema = exports.TaskZodSchema = exports.QuerySchema = exports.PaginateZodSchema = exports.DailyTaskZodSchema = exports.IDZodSchema = exports.DailyBonusZodSchema = exports.FundCoinsZodSchema = exports.WithdrawCoinsZodSchema = exports.TransferCoinsZodSchema = exports.UserWalletAddressZodSchema = exports.purchasePremiumZodSchema = exports.TmaSubscriptionInvoiceZodSchema = exports.TmaInvoiceZodSchema = exports.purchaseCoinsZodSchema = exports.authZodSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const _types_1 = require("@/@types");
exports.authZodSchema = zod_1.z
    .object({
    authDate: zod_1.z.string().trim(),
    chatInstance: zod_1.z.string().trim().optional(),
    chatType: zod_1.z.string().trim().optional(),
    hash: zod_1.z.string().trim(),
    user: zod_1.z.object({
        allowsWriteToPm: zod_1.z.boolean(),
        firstName: zod_1.z.string().trim(),
        id: zod_1.z.number(),
        languageCode: zod_1.z.string().trim(),
        lastName: zod_1.z.string().trim().optional(),
        photoUrl: zod_1.z.string().trim(),
        username: zod_1.z.string().trim(),
    }),
})
    .passthrough();
exports.purchaseCoinsZodSchema = zod_1.z
    .object({
    packageId: zod_1.z.string().trim(),
    currency: zod_1.z.nativeEnum(client_1.TxnCurrencyEnum, {
        required_error: "Txn currency is invalid",
    }),
    meta: zod_1.z
        .object({
        isFlw: zod_1.z.boolean().optional(), // check if it is flutterwave payment
        from: zod_1.z.string().trim().optional(),
        to: zod_1.z.string().trim().optional(),
        amount: zod_1.z.number(),
        gateway: zod_1.z.nativeEnum(client_1.TxnGatewayEnum, {
            required_error: "Txn gateway is invalid",
        }),
        source: zod_1.z.nativeEnum(client_1.TxnSourceEnum, {
            required_error: "Txn source is invalid",
        }),
        currency: zod_1.z.nativeEnum(client_1.TxnCurrencyEnum, {
            required_error: "Txn currency is invalid",
        }),
        hash: zod_1.z.string().trim().optional(),
        extHash: zod_1.z.string().trim().optional(),
        status: zod_1.z.string().trim().optional(),
        botTxnRef: zod_1.z.string().trim().optional(),
    })
        .passthrough()
        .optional(),
})
    .passthrough();
exports.TmaInvoiceZodSchema = zod_1.z.object({
    id: zod_1.z
        .string({ required_error: "ID of the coin package must be provided" })
        .trim(),
    botTxnRef: zod_1.z.string({ required_error: "Bot txn ID is required" }).trim(),
    gateway: zod_1.z.nativeEnum(client_1.TxnGatewayEnum, {
        required_error: "Gateway is invalid",
    }),
});
exports.TmaSubscriptionInvoiceZodSchema = zod_1.z.object({
    planId: zod_1.z.string({ required_error: "Plan Id must be provided" }).trim(),
    tierId: zod_1.z
        .string({ required_error: "Tier Id must be a string" })
        .trim()
        .optional(),
    botTxnRef: zod_1.z.string({ required_error: "Bot txn ID is required" }).trim(),
    amount: zod_1.z.number({ required_error: "Amount must be a number" }),
    gateway: zod_1.z.nativeEnum(client_1.TxnGatewayEnum, {
        required_error: "Gateway is invalid",
    }),
    planType: zod_1.z.nativeEnum(_types_1.PlanTypeEnum, {
        required_error: "Plan type is invalid",
    }),
    currency: zod_1.z.nativeEnum(client_1.TxnCurrencyEnum, {
        required_error: "Txn currency is invalid",
    }),
    isRecurring: zod_1.z.boolean(),
    planName: zod_1.z.string().trim(),
});
exports.purchasePremiumZodSchema = zod_1.z
    .object({
    planId: zod_1.z.string().trim(),
    planName: zod_1.z.string().trim(),
    amount: zod_1.z.number(),
    planType: zod_1.z.nativeEnum(client_1.BillingCycleEnum, {
        required_error: "Plan type is invalid",
    }),
    isRecurring: zod_1.z.boolean(),
    currency: zod_1.z.nativeEnum(client_1.TxnCurrencyEnum, {
        required_error: "Currency is invalid",
    }),
    source: zod_1.z.nativeEnum(client_1.TxnSourceEnum, {
        required_error: "Source is invalid",
    }),
    gateway: zod_1.z.nativeEnum(client_1.TxnGatewayEnum, {
        required_error: "Gateway is invalid",
    }),
    meta: zod_1.z
        .object({
        from: zod_1.z.string().trim().optional(),
        to: zod_1.z.string().trim().optional(),
        hash: zod_1.z.string().trim().optional(),
        extHash: zod_1.z.string().trim().optional(),
        status: zod_1.z.string().trim().optional(),
        price: zod_1.z.number().optional(),
        discount: zod_1.z.number().optional(),
        tierId: zod_1.z.string().trim().optional(),
    })
        .passthrough()
        .optional(),
})
    .passthrough();
exports.UserWalletAddressZodSchema = zod_1.z.object({
    address: zod_1.z.string({ required_error: "address must be a string" }).trim(),
    token: zod_1.z.string({ required_error: "token must be a string" }).trim(),
    name: zod_1.z.nativeEnum(client_1.CryptoName, { required_error: "crypto name is invalid" }),
});
exports.TransferCoinsZodSchema = zod_1.z.object({
    senderId: zod_1.z.string({ required_error: "senderId must be a string" }).trim(),
    recipientId: zod_1.z
        .string({ required_error: "recipientId must be a string" })
        .trim(),
    amount: zod_1.z
        .number({ required_error: "amount must be a number" })
        .min(100, { message: "Minimum transfer amount is 100 Coins" }),
});
exports.WithdrawCoinsZodSchema = zod_1.z.object({
    userId: zod_1.z.string({ required_error: "userId must be a string" }).trim(),
    amount: zod_1.z.number({ required_error: "amount must be a number" }),
});
exports.FundCoinsZodSchema = zod_1.z.object({
    userId: zod_1.z.string({ required_error: "userId must be a string" }).trim(),
    amount: zod_1.z.number({ required_error: "amount must be a number" }),
    bonus: zod_1.z.number({ required_error: "bonus must be a number" }),
});
exports.DailyBonusZodSchema = zod_1.z.object({
    userId: zod_1.z.string({ required_error: "userId must be a string" }).trim(),
    amount: zod_1.z.number({ required_error: "amount must be a number" }),
    date: zod_1.z.string({ required_error: "date must be a string" }),
    type: zod_1.z.nativeEnum(_types_1.BonusTypeEnum, {
        required_error: "Bonus type must be either BONUS or ADS",
    }),
});
exports.IDZodSchema = zod_1.z.object({
    id: zod_1.z.string({ required_error: "ID must be a string" }).trim(),
});
exports.DailyTaskZodSchema = zod_1.z.object({
    id: zod_1.z.string({ required_error: "ID must be a string" }).trim(),
    code: zod_1.z
        .union([
        zod_1.z.string({ required_error: "ID must be a string" }).trim().optional(),
        zod_1.z.null(),
        zod_1.z.undefined(),
    ])
        .transform((val) => (val === "" || val == null ? undefined : val)),
});
exports.PaginateZodSchema = zod_1.z.object({
    userId: zod_1.z.string({ required_error: "userId must be a string" }).trim(),
    limit: zod_1.z
        .number({ required_error: "limit must be a number" })
        .min(10, { message: "Limit must be at least 10" }),
    page: zod_1.z
        .number({ required_error: "page must be a number" })
        .min(0, { message: "Page must be at least 0" }),
});
exports.QuerySchema = zod_1.z.object({
    page: zod_1.z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 1))
        .refine((val) => Number.isInteger(val) && val > 0, {
        message: "Page must be a positive integer.",
    }),
    limit: zod_1.z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 50))
        .refine((val) => Number.isInteger(val) && val > 0, {
        message: "Limit must be a positive integer.",
    }),
});
exports.TaskZodSchema = zod_1.z.object({
    title: zod_1.z
        .string({ required_error: "title must be a string" })
        .trim()
        .min(3, { message: "Title must be at least 3 characters" })
        .max(100, { message: "Title must be at most 100 characters" }),
    code: zod_1.z.string({ required_error: "code must be a string" }).trim().optional(),
    description: zod_1.z
        .string({ required_error: "description must be a string" })
        .trim()
        .min(3, { message: "Description must be at least 3 characters" })
        .max(100, { message: "Description must be at most 500 characters" }),
    url: zod_1.z
        .string({ required_error: "url must be valid" })
        .url({ message: "url must be valid" })
        .trim(),
    reward: zod_1.z
        .union([zod_1.z.string(), zod_1.z.number()])
        .refine((val) => !isNaN(Number(val)), {
        message: "Reward must be a valid number.",
    })
        .transform((val) => Number(val)),
    rewardType: zod_1.z.nativeEnum(client_1.RewardTypeEnum, {
        required_error: "reward type must be of the above values",
    }),
});
exports.FlutterwaveConfigZodSchema = zod_1.z
    .object({
    public_key: zod_1.z
        .string({ required_error: "public_key is required & must be a string" })
        .trim(),
    redirect_url: zod_1.z
        .string({ required_error: "redirect_url is required & must be a string" })
        .trim(),
    tx_ref: zod_1.z
        .string({ required_error: "tx_ref is required & must be a string" })
        .trim(),
    amount: zod_1.z.number({
        required_error: "amount is required & must be a string",
    }),
    currency: zod_1.z
        .string({ required_error: "currency is required & must be a string" })
        .trim(),
    payment_plan: zod_1.z
        .string({ required_error: "Payment plan is must be atring or undefined" })
        .trim()
        .optional(),
    payment_options: zod_1.z
        .string({
        required_error: "payment_options is required & must be a string",
    })
        .trim(),
    customer: zod_1.z.object({
        email: zod_1.z
            .string({
            required_error: "customer email is required & must be a string",
        })
            .trim(),
        name: zod_1.z
            .string({
            required_error: "customer name is required & must be a string",
        })
            .trim(),
        phone_number: zod_1.z
            .string({
            required_error: "customer phone_number is required & must be a string",
        })
            .trim(),
    }),
    customizations: zod_1.z
        .object({
        title: zod_1.z
            .string({
            required_error: "customizations title is required & must be a string",
        })
            .trim(),
        description: zod_1.z
            .string({
            required_error: "customizations description is required & must be a string",
        })
            .trim(),
        logo: zod_1.z
            .string({
            required_error: "customizations logo is required & must be a string",
        })
            .trim(),
    })
        .passthrough(),
    meta: zod_1.z.object({}).passthrough(),
})
    .passthrough();
exports.VerifyFlwPaymentZodSchema = zod_1.z
    .object({
    status: zod_1.z
        .string({ required_error: "Status is required & must be a string" })
        .trim(),
    tx_ref: zod_1.z.union([zod_1.z.string(), zod_1.z.number()], {
        required_error: "Txn Ref is required",
    }),
    transaction_id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()], {
        required_error: "Txn ID is required",
    }),
})
    .passthrough();
exports.PostZodSchema = zod_1.z.array(zod_1.z
    .object({
    content: zod_1.z
        .string({ required_error: "Content must be a string" })
        .trim()
        .optional(),
    type: zod_1.z.nativeEnum(client_1.PostTypeEnum, {
        required_error: "Post type is invalid",
    }),
    scope: zod_1.z.nativeEnum(client_1.PostScopeEnum, {
        required_error: "Post scope is invalid",
    }),
    media: zod_1.z
        .array(zod_1.z.object({
        fileId: zod_1.z.string(), // Assuming fileId is a UUID
        name: zod_1.z.string().min(1),
        url: zod_1.z.string().url(),
        height: zod_1.z.number().positive(),
        width: zod_1.z.number().positive(),
        size: zod_1.z.number().positive(), // File size in bytes
        thumbnailUrl: zod_1.z.string().url().optional(),
        fileType: zod_1.z.string().min(1), // e.g., "image/png", "video/mp4"
        filePath: zod_1.z.string().min(1),
        altText: zod_1.z.string().min(0).optional(), // Optional for accessibility
        flags: zod_1.z.array(zod_1.z.string()).default([]), // Ensures an array of strings
    }))
        .default([]),
    poll: zod_1.z
        .object({
        options: zod_1.z
            .array(zod_1.z.object({
            id: zod_1.z.string().min(1, "Option ID cannot be empty"), // Ensure ID is not empty
            text: zod_1.z.string().min(1, "Poll option text cannot be empty"), // Ensure text is not empty
        }))
            .min(2, "A poll must have at least two options"), // Ensure at least two options
        continents: zod_1.z
            .array(zod_1.z.string().min(1, "Continents values must be string"))
            .optional()
            .default([]), // Can be empty but values must be non-empty strings
        countries: zod_1.z
            .array(zod_1.z.string().min(1, "Countries values must be string"))
            .optional()
            .default([]), // Can be empty but values must be non-empty strings
        scope: zod_1.z.nativeEnum(client_1.ScopeEnum),
        isMultiVote: zod_1.z.boolean(),
        duration: zod_1.z.object({
            days: zod_1.z.number().min(0).max(7), // Ensure days are between 0 and 7
            hours: zod_1.z.number().min(0).max(23), // Hours should be valid
            minutes: zod_1.z.number().min(0).max(59), // Minutes should be valid
        }),
    })
        .optional(), // Allows `poll` to be undefined
})
    .passthrough());
exports.QueryParams = zod_1.z.object({
    page: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(1)),
    limit: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(21)),
    type: zod_1.z.string().optional(),
    hidden: zod_1.z.coerce.boolean().optional().default(false),
});
exports.VisitorCreateSchema = zod_1.z.object({
    postId: zod_1.z.string({ message: "Post ID must string" }).optional(),
    sessionId: zod_1.z.string({ message: "Session ID must be string" }), // assuming post.id is a string
    userId: zod_1.z.string({ message: "User ID must string" }),
});
exports.ReportCreateSchema = zod_1.z.object({
    id: zod_1.z.string(), // assuming post.id is a string
    code: zod_1.z.nativeEnum(client_1.ReportReason),
    message: zod_1.z.string().optional(),
    meta: zod_1.z.object({
        code: zod_1.z.nativeEnum(client_1.ReportReason),
        title: zod_1.z.string(),
        description: zod_1.z.string(),
    }),
});
exports.CreatePostPinSchema = zod_1.z.object({
    id: zod_1.z.string(), // assuming post.id is a string
    context: zod_1.z.nativeEnum(client_1.PostContext),
});
exports.CreatePostHighlightSchema = zod_1.z.object({
    id: zod_1.z.string(), // assuming post.id is a string
    context: zod_1.z.nativeEnum(client_1.PostContext),
});
exports.CreatePostImpressionSchema = zod_1.z.object({
    id: zod_1.z.string({ message: "Post ID must string" }), // assuming post.id is a string
    sessionId: zod_1.z
        .string({ message: "Session ID must be string" })
        .optional()
        .nullish(),
    timestamp: zod_1.z.string(),
});
exports.CreatePostViewSchema = zod_1.z.object({
    id: zod_1.z.string({ message: "Post ID must string" }), // assuming post.id is a string
    sessionId: zod_1.z
        .string({ message: "Session ID must be string" })
        .optional()
        .nullish(),
    timestamp: zod_1.z.string({ message: "Timestamp must be a date string" }),
    duration: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(5)),
});
exports.CreatePostClickSchema = zod_1.z.object({
    sessionId: zod_1.z
        .string({ message: "Session ID must be string" })
        .optional()
        .nullish(),
    timestamp: zod_1.z.string({ message: "Timestamp must be a date string" }),
    action: zod_1.z.nativeEnum(client_1.PostMetricAction, { message: "action must be an enum" }),
    source: zod_1.z.nativeEnum(client_1.PostMetricSource, { message: "source must be an enum" }),
});
exports.CreatePostMediaLogSchema = zod_1.z.object({
    postId: zod_1.z.string({ message: "Post ID must string" }), // assuming post.id is a string
    mediaId: zod_1.z.string({ message: "Media ID must string" }), // assuming post.media.id is a string
    sessionId: zod_1.z
        .string({ message: "Session ID must be string" })
        .optional()
        .nullish(),
    referer: zod_1.z
        .string({ message: "referer must be a string" })
        .optional()
        .nullish(),
    muted: zod_1.z.coerce.boolean().optional().default(true),
    timestamp: zod_1.z.string({ message: "Timestamp must be a date string" }),
    userId: zod_1.z.string({ message: "User ID must string" }).optional().nullish(),
    duration: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(0)),
    playbackRate: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(0)),
    watchedPct: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(0)),
    sessionDuration: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(0)),
    kind: zod_1.z.nativeEnum(client_1.PostMediaKind),
    action: zod_1.z.nativeEnum(client_1.PostMediaAction),
});
exports.CreatePostTipSchema = zod_1.z.object({
    postId: zod_1.z.string({ message: "Post ID must string" }),
    tipId: zod_1.z.string({ message: "Tip ID must string" }),
    recipientId: zod_1.z.string({ message: "Recipient ID must be string" }),
    isAnon: zod_1.z.boolean().optional().default(false),
    message: zod_1.z.string({ message: "Message must string" }).optional(),
    // timestamp: z.string({message: "Timestamp must be a date string"}),
});
exports.SearchQuerySchema = zod_1.z.object({
    id: zod_1.z.string(),
    query: zod_1.z.string(),
    page: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(1)),
    limit: zod_1.z.preprocess((val) => (val === undefined ? undefined : Number(val)), zod_1.z.number().default(50)),
});
exports.ReactivateSchema = zod_1.z.object({
    userId: zod_1.z.string({ message: "User ID must be a string" }),
    isActive: zod_1.z.boolean({ message: "isActive must be a boolean value" }),
});
