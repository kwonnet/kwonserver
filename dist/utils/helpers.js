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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = exports.getReqInfo = exports.isEmptyObject = exports.getReqIPInfo = exports.getAuthorizationToken = exports.removeProperty = void 0;
exports.delayExecution = delayExecution;
exports.retryExecution = retryExecution;
exports.formatNumberWithCommas = formatNumberWithCommas;
const ip_location_api_1 = require("ip-location-api");
const node_device_detector_1 = __importDefault(require("node-device-detector"));
const client_hints_1 = __importDefault(require("node-device-detector/client-hints"));
const detector = new node_device_detector_1.default();
const clientHints = new client_hints_1.default();
const removeProperty = (obj, key) => {
    const _a = obj, _b = key, _ = _a[_b], rest = __rest(_a, [typeof _b === "symbol" ? _b : _b + ""]);
    return rest;
};
exports.removeProperty = removeProperty;
function delayExecution(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function retryExecution(promiseFunction_1, retries_1) {
    return __awaiter(this, arguments, void 0, function* (promiseFunction, retries, delayMs = 1000) {
        let lastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Attempt to execute the promise function
                return yield promiseFunction();
            }
            catch (error) {
                // If the function throws an error, record it and retry if we still have attempts left
                lastError = error;
                if (attempt < retries) {
                    console.log(`Attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
                    // Wait for the specified delay before retrying
                    yield delayExecution(delayMs);
                }
                else {
                    console.log(`Attempt ${attempt} failed. No retries left.`);
                    throw lastError; // Throw the last error after all attempts fail
                }
            }
        }
        // If all retries fail, throw the last error
        if (lastError) {
            throw lastError;
        }
        // This line should never be reached as we're either returning a value or throwing an error
        throw new Error("Unexpected error during retries");
    });
}
function formatNumberWithCommas(num) {
    return num.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}
const getAuthorizationToken = (req) => {
    var _a;
    const cookieToken = req.cookies.x_a_t;
    if (cookieToken)
        return cookieToken;
    const queryToken = (_a = req === null || req === void 0 ? void 0 : req.query) === null || _a === void 0 ? void 0 : _a.token;
    if (queryToken)
        return queryToken;
    const bearerToken = req.headers.authorization;
    if (bearerToken)
        return bearerToken.split("Bearer ")[1];
    return null;
};
exports.getAuthorizationToken = getAuthorizationToken;
const getReqIPInfo = (ip) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const clientIp = (ip === null || ip === void 0 ? void 0 : ip.includes("::ffff:"))
            ? ip.split("::ffff:")[1]
            : ip !== null && ip !== void 0 ? ip : "";
        console.log("user clientIp Ip: ", clientIp);
        const lookupIP = !clientIp || (clientIp === null || clientIp === void 0 ? void 0 : clientIp.includes("::1")) ? "8.8.8.8" : clientIp;
        console.log("user lookupIP Ip: ", lookupIP);
        return yield (0, ip_location_api_1.lookup)(lookupIP);
    }
    catch (error) {
        return null;
    }
});
exports.getReqIPInfo = getReqIPInfo;
const isEmptyObject = (obj) => {
    for (const i in obj) {
        return false;
    }
    return true;
};
exports.isEmptyObject = isEmptyObject;
const getReqInfo = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const headers = req.headers;
    const useragent = headers["user-agent"];
    const deviceResult = detector.detect(useragent !== null && useragent !== void 0 ? useragent : "", clientHints.parse(headers, {}));
    const detectBot = detector.parseBot(useragent !== null && useragent !== void 0 ? useragent : "");
    const isBot = !(0, exports.isEmptyObject)(detectBot);
    const ipInfo = yield (0, exports.getReqIPInfo)(req.ip);
    return { device: deviceResult, ipInfo, isBot };
});
exports.getReqInfo = getReqInfo;
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        // Ensures instanceof works when transpiled to ES5
        Object.setPrototypeOf(this, new.target.prototype);
        // Optional: capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.AppError = AppError;
