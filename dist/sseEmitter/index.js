"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_express_sse_1 = __importDefault(require("ts-express-sse"));
const sseEmitter = new ts_express_sse_1.default(["sse"]);
exports.default = sseEmitter;
