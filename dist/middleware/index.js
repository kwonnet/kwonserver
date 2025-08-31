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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectBotMiddleware = exports.authMiddleware = exports.versionMiddleware = void 0;
const utils_1 = require("@/utils");
const config_1 = require("@/config");
const helpers_1 = require("@/utils/helpers");
const v1_1 = __importDefault(require("@/routes/v1"));
const logger_1 = __importDefault(require("@/logger"));
const utils_2 = require("@/services/v1/utils");
const versionMiddleware = (req, res, next) => {
    const version = req.url.split("/")[2];
    // if (version === 'v2') {
    //   return v2Routes(req, res, next);
    // }
    return (0, v1_1.default)(req, res, next);
};
exports.versionMiddleware = versionMiddleware;
const authMiddleware = (params) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { required = true, checkPermission = false, checkPermWithEmail = false } = params || {};
        const authToken = (0, helpers_1.getAuthorizationToken)(req);
        if (!required && !authToken)
            return next();
        if (!authToken)
            return res.status(401).send("Invalid auth token, please try again");
        const payload = (0, utils_1.jwtVerify)(authToken);
        if (!required && !payload) {
            return next();
        }
        if (!payload)
            return res.status(401).send("Invalid auth token, please try again");
        // decrypt the token
        const user = (0, utils_1.decryptString)(payload.data, config_1.encrytionKey);
        logger_1.default.info(user, "Auth Middleware ");
        if (checkPermission || checkPermWithEmail) {
            const result = yield (0, utils_2.getAuthUser)(user.id, true);
            if (typeof result.data === "string" || result.status !== 200) {
                return res.status(result.status).send(result.data);
            }
            const _user = !checkPermWithEmail ? (0, helpers_1.removeProperty)(result.data, "email") : result.data;
            // @ts-ignore
            req.user = _user;
        }
        else {
            // @ts-ignore
            req.user = user;
        }
        next();
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        return res
            .status(403)
            .send("Authorization failed, please logout & login to try again");
    }
});
exports.authMiddleware = authMiddleware;
// export const checkAuthPermission = (required: boolean = true) => async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const user = req.user as AuthUser;
//         const result = await getAuthUser(user.id)
//         if ( typeof result.data === "string" || result.status !== 200){
//             return res.status(result.status).send(result.data);
//         }
//         req.user = result.data
//         // @ts-ignore
//         next()
//     } catch (error: any) {
//         logger.error(error?.message)
//         return res.status(403).send("Authorization failed, please logout & login to try again");
//     }
// }
const detectBotMiddleware = (required = true) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reqInfo = yield (0, helpers_1.getReqInfo)(req);
        if (!required && reqInfo.isBot)
            return next();
        if (reqInfo.isBot) {
            return res.status(400).send("Failed to process, bot request detected");
        }
        return next();
    }
    catch (error) {
        logger_1.default.error(error === null || error === void 0 ? void 0 : error.message);
        return res
            .status(400)
            .send("Failed to process request, please try again");
    }
});
exports.detectBotMiddleware = detectBotMiddleware;
