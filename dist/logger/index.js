"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const isProduction = process.env.NODE_ENV === "production";
const logger = (0, pino_1.default)(Object.assign({}, (!isProduction && {
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            singleLine: false, // Format logs over multiple lines for readability
            translateTime: true, // Show human-readable time
        },
    },
})));
exports.default = logger;
