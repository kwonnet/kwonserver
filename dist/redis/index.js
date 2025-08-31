"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const redisClient = (0, redis_1.createClient)();
redisClient.on('error', err => console.log('Redis Client Error', err === null || err === void 0 ? void 0 : err.message));
redisClient.connect().then(() => {
    console.log("Redis db connection established");
}).catch(err => console.log('Redis db connection error', err === null || err === void 0 ? void 0 : err.message));
exports.default = redisClient;
