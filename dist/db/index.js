"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const convertBigIntToNumber = (obj) => {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj === "bigint")
        return Number(obj);
    if (obj instanceof Date)
        return obj; // Preserve Date objects
    if (Array.isArray(obj))
        return obj.map(convertBigIntToNumber);
    if (typeof obj === "object") {
        return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, convertBigIntToNumber(value)]));
    }
    return obj;
};
let prisma;
if (process.env.NODE_ENV === 'production') {
    prisma = new client_1.PrismaClient();
    prisma.$use((params, next) => __awaiter(void 0, void 0, void 0, function* () {
        // Only run for fetch operations
        if ((params.action === "findUnique" ||
            params.action === "findMany" ||
            params.action === "findFirst" ||
            params.action === "queryRaw" ||
            params.action === "createManyAndReturn" ||
            params.action === "createMany" ||
            params.action === "create") &&
            (params.model === "Post" || params.model === "PostMedia" || params.model === "PollOption" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight")) {
            const result = yield next(params);
            return convertBigIntToNumber(result);
        }
        return next(params); // Skip middleware for other operations
    }));
}
else {
    const globalPrisma = global;
    prisma = globalPrisma.prisma || new client_1.PrismaClient();
    prisma.$use((params, next) => __awaiter(void 0, void 0, void 0, function* () {
        // Only run for fetch operations
        if ((params.action === "findUnique" ||
            params.action === "findMany" ||
            params.action === "findFirst" ||
            params.action === "queryRaw") &&
            (params.model === "Post" || params.model === "PostMedia" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight")) {
            const result = yield next(params);
            return convertBigIntToNumber(result);
        }
        return next(params); // Skip middleware for other operations
    }));
    if (!globalPrisma.prisma)
        globalPrisma.prisma = prisma;
}
exports.default = prisma;
