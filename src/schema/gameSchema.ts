import { z } from "zod";

export const createGameSchema = z.object({
  userId: z
    .string({ required_error: "ID is required" })
    .min(3, "ID is required")
    .trim(),
  name: z
    .string({ required_error: "Name is required" })
    .min(3, "Name is required")
    .trim(),
  description: z
    .string({ required_error: "Description is required" })
    .min(3, "Description is required")
    .trim(),
  thumbnail: z
    .string({ required_error: "Thumbnaim must be string" })
    .trim()
    .optional(),
});

export const createGameCategorySchema = z.object({
  userId: z
    .string({ required_error: "ID is required" })
    .min(3, "ID is required")
    .trim(),
  gameId: z
    .string({ required_error: "Game ID is required" })
    .min(3, "Game ID is required")
    .trim(),
  name: z
    .string({ required_error: "Name is required" })
    .min(3, "Name is required")
    .trim(),
  description: z
    .string({ required_error: "Description is required" })
    .min(3, "Description is required")
    .trim(),
  thumbnail: z
    .string({ required_error: "Thumbnaim must be string" })
    .trim()
    .optional(),
});

export const createGameCategoryRoomSchema = z.object({
  userId: z
    .string({ required_error: "ID is required" })
    .min(3, "ID is required")
    .trim(),
  catId: z
    .string({ required_error: "Category ID is required" })
    .min(3, "Game ID is required")
    .trim(),
  name: z
    .string({ required_error: "Name is required" })
    .min(3, "Name is required")
    .trim(),
  description: z
    .string({ required_error: "Description is required" })
    .min(3, "Description is required")
    .trim(),
  thumbnail: z
    .string({ required_error: "Thumbnaim must be string" })
    .trim()
    .optional(),
});

export const SearchUserSchema = z.object({
  query: z.string({ required_error: "Query must be a string" }).trim(),
});



export const rewardQuerySchema = z.object({
  userId: z
    .string({ required_error: "ID is required" })
    .min(3, "ID is required")
    .trim(),
  catId: z.string({ required_error: "Cat ID is required" }).trim().optional(),
  page: z
    .string({ required_error: "Page is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid page format");
      }
      return parsed;
    }),
  limit: z
    .string({ required_error: "Limit is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid limit format");
      }
      return parsed;
    }),
  year: z
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

export const userRankQuerySchema = z.object({
  userId: z
    .string({ required_error: "ID is required" })
    .min(3, "ID is required")
    .trim(),
  rankType: z.enum(['today', 'week', 'month'], { required_error: "rank type is invalid" }),
  mode: z.enum(['single', 'multi'], { required_error: "Invalid game mode - single | multi expected" }),
});

export const winnersQuerySchema = z.object({
  catId: z.string({ required_error: "Cat ID is required" }).trim(),
  page: z
    .string({ required_error: "Page is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid page format");
      }
      return parsed;
    }),
  limit: z
    .string({ required_error: "Limit is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid limit format");
      }
      return parsed;
    }),
  year: z
    .string({ required_error: "Year is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid year format");
      }
      return parsed;
    }),

    month: z
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

export const querySchema = z.object({
  userId: z.string({ required_error: "User ID is required" }).trim(),
  
  catId: z.string({ required_error: "Cat ID is required" }).trim(),
  page: z
    .string({ required_error: "Page is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid page format");
      }
      return parsed;
    }),
  limit: z
    .string({ required_error: "Limit is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid limit format");
      }
      return parsed;
    }),
  year: z
    .string({ required_error: "Year is required" })
    .trim()
    .transform((value) => {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error("Invalid year format");
      }
      return parsed;
    }),

    month: z
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
