"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignUpSchema = exports.SignInSchema = void 0;
const zod_1 = __importDefault(require("zod"));
exports.SignInSchema = zod_1.default.object({
    email: zod_1.default.string({ message: "Field must be a string" })
        .toLowerCase()
        .trim(),
    password: zod_1.default.string({ message: "Password must be a string" })
        .min(8, { message: "Password must be at least 8 characters" })
        .max(32, "Password must be at most 32 characters")
});
exports.SignUpSchema = zod_1.default.object({
    name: zod_1.default.string({ message: "Name must be a string" })
        .min(1, { message: "Name is required" })
        .toLowerCase()
        .trim(),
    email: zod_1.default.string({ message: "Email must be a string" })
        .email({ message: "Email must be valid" })
        .toLowerCase()
        .trim(),
    password: zod_1.default.string({ message: "Password must be a string" })
        .min(8, { message: "Password must be at least 8 characters" })
        .max(32, "Password must be at most 32 characters"),
    refId: zod_1.default.string({ message: "Referrer ID must be a string" }).nullable().optional()
});
