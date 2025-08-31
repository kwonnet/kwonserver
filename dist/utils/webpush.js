"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@/config");
const web_push_1 = __importDefault(require("web-push"));
web_push_1.default.setVapidDetails(config_1.webpushConfig.email, config_1.webpushConfig.publicKey, config_1.webpushConfig.privateKey);
exports.default = web_push_1.default;
