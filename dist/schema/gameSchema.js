"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.querySchema = exports.winnersQuerySchema = exports.userRankQuerySchema = exports.rewardQuerySchema = exports.SearchUserSchema = exports.createGameCategoryRoomSchema = exports.createGameCategorySchema = exports.createGameSchema = void 0;
const zod_1 = require("zod");
exports.createGameSchema = zod_1.z.object({
    userId: zod_1.z
        .string({ required_error: "ID is required" })
        .min(3, "ID is required")
        .trim(),
    name: zod_1.z
        .string({ required_error: "Name is required" })
        .min(3, "Name is required")
        .trim(),
    description: zod_1.z
        .string({ required_error: "Description is required" })
        .min(3, "Description is required")
        .trim(),
    thumbnail: zod_1.z
        .string({ required_error: "Thumbnaim must be string" })
        .trim()
        .optional(),
});
exports.createGameCategorySchema = zod_1.z.object({
    userId: zod_1.z
        .string({ required_error: "ID is required" })
        .min(3, "ID is required")
        .trim(),
    gameId: zod_1.z
        .string({ required_error: "Game ID is required" })
        .min(3, "Game ID is required")
        .trim(),
    name: zod_1.z
        .string({ required_error: "Name is required" })
        .min(3, "Name is required")
        .trim(),
    description: zod_1.z
        .string({ required_error: "Description is required" })
        .min(3, "Description is required")
        .trim(),
    thumbnail: zod_1.z
        .string({ required_error: "Thumbnaim must be string" })
        .trim()
        .optional(),
});
exports.createGameCategoryRoomSchema = zod_1.z.object({
    userId: zod_1.z
        .string({ required_error: "ID is required" })
        .min(3, "ID is required")
        .trim(),
    catId: zod_1.z
        .string({ required_error: "Category ID is required" })
        .min(3, "Game ID is required")
        .trim(),
    name: zod_1.z
        .string({ required_error: "Name is required" })
        .min(3, "Name is required")
        .trim(),
    description: zod_1.z
        .string({ required_error: "Description is required" })
        .min(3, "Description is required")
        .trim(),
    thumbnail: zod_1.z
        .string({ required_error: "Thumbnaim must be string" })
        .trim()
        .optional(),
});
exports.SearchUserSchema = zod_1.z.object({
    query: zod_1.z.string({ required_error: "Query must be a string" }).trim(),
});
exports.rewardQuerySchema = zod_1.z.object({
    userId: zod_1.z
        .string({ required_error: "ID is required" })
        .min(3, "ID is required")
        .trim(),
    catId: zod_1.z.string({ required_error: "Cat ID is required" }).trim().optional(),
    page: zod_1.z
        .string({ required_error: "Page is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid page format");
        }
        return parsed;
    }),
    limit: zod_1.z
        .string({ required_error: "Limit is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid limit format");
        }
        return parsed;
    }),
    year: zod_1.z
        .string({ required_error: "Year is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid year format");
        }
        return parsed;
    })
        .optional(),
});
exports.userRankQuerySchema = zod_1.z.object({
    userId: zod_1.z
        .string({ required_error: "ID is required" })
        .min(3, "ID is required")
        .trim(),
    rankType: zod_1.z.enum(['today', 'week', 'month'], { required_error: "rank type is invalid" }),
});
exports.winnersQuerySchema = zod_1.z.object({
    catId: zod_1.z.string({ required_error: "Cat ID is required" }).trim(),
    page: zod_1.z
        .string({ required_error: "Page is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid page format");
        }
        return parsed;
    }),
    limit: zod_1.z
        .string({ required_error: "Limit is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid limit format");
        }
        return parsed;
    }),
    year: zod_1.z
        .string({ required_error: "Year is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid year format");
        }
        return parsed;
    }),
    month: zod_1.z
        .string({ required_error: "Month is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid month format");
        }
        return parsed;
    })
});
exports.querySchema = zod_1.z.object({
    userId: zod_1.z.string({ required_error: "User ID is required" }).trim(),
    catId: zod_1.z.string({ required_error: "Cat ID is required" }).trim(),
    page: zod_1.z
        .string({ required_error: "Page is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid page format");
        }
        return parsed;
    }),
    limit: zod_1.z
        .string({ required_error: "Limit is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid limit format");
        }
        return parsed;
    }),
    year: zod_1.z
        .string({ required_error: "Year is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid year format");
        }
        return parsed;
    }),
    month: zod_1.z
        .string({ required_error: "Month is required" })
        .trim()
        .transform((value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error("Invalid month format");
        }
        return parsed;
    })
});
