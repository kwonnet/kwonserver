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
exports.refreshTokenController = exports.getMeController = exports.signInController = exports.signUpController = void 0;
const utils_1 = require("@/utils");
const auth_1 = require("@/services/v1/auth");
const ip_location_api_1 = require("ip-location-api");
const auth_2 = require("@/schema/auth");
const zod_1 = require("zod");
const logger_1 = __importDefault(require("@/logger"));
const utils_2 = require("@/services/v1/utils");
const composeAuthUser = (user) => {
    return { id: user.id, name: user.name, email: String(user.email), username: user.username, role: user.role };
};
const signUpController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // await reload({fields: 'all'})
        const body = yield auth_2.SignUpSchema.parseAsync(req.body);
        // console.log("Authenticating user")
        const clientIp = ((_a = req === null || req === void 0 ? void 0 : req.ip) === null || _a === void 0 ? void 0 : _a.includes('::ffff:')) ? req.ip.split('::ffff:')[1] : (_b = req === null || req === void 0 ? void 0 : req.ip) !== null && _b !== void 0 ? _b : '';
        // console.log("user clientIp Ip: ", clientIp)
        const lookupIP = !clientIp || (clientIp === null || clientIp === void 0 ? void 0 : clientIp.includes("::1")) ? "8.8.8.8" : clientIp;
        // console.log("user lookupIP Ip: ", lookupIP)
        const location = yield (0, ip_location_api_1.lookup)(lookupIP);
        // console.log("user Location: ", location)
        // create or login a user
        const result = yield (0, auth_1.createUser)(body, location);
        if (typeof result.data === "string" || result.status !== 200) {
            return res.status(result.status).send(result.data);
        }
        const user = result.data;
        // generate access token
        const accessToken = (0, utils_1.generateToken)(composeAuthUser(user), { expiresIn: "24h" });
        // set cookies
        res.cookie("tx_a_t", accessToken, {
            httpOnly: true, // Prevents client-side JS from accessing the cookie
            secure: true, // Ensures the cookie is sent over HTTPS only
            maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
            sameSite: "none", // Restricts cross-site requests
        });
        // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
        // return response
        return res.send({ user: result.data, accessToken });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const issues = error.issues;
            const message = issues.map((issue) => issue.message).join(", ");
            return res.status(400).send(message);
        }
        return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
    }
});
exports.signUpController = signUpController;
const signInController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const LoginSchema = auth_2.SignInSchema.pick({
            email: true,
            password: true,
        });
        const body = yield LoginSchema.parseAsync(req.body);
        const clientIp = ((_a = req === null || req === void 0 ? void 0 : req.ip) === null || _a === void 0 ? void 0 : _a.includes('::ffff:')) ? req.ip.split('::ffff:')[1] : (_b = req === null || req === void 0 ? void 0 : req.ip) !== null && _b !== void 0 ? _b : '';
        // console.log("user Ip: ", clientIp)
        // const location = await lookup(clientIp)
        // console.log("user Location: ", location)
        // create or login a user
        const result = yield (0, auth_1.loginUser)(body);
        console.log(result);
        if (typeof result.data === "string" || result.status !== 200) {
            // console.log(result)
            return res.status(result.status).send(result.data);
        }
        const user = result.data;
        // generate access token
        const accessToken = (0, utils_1.generateToken)(composeAuthUser(user), { expiresIn: "24h" });
        logger_1.default.info(user, "Signed in user");
        // set cookies
        res.cookie("tx_a_t", accessToken, {
            httpOnly: true, // Prevents client-side JS from accessing the cookie
            secure: true, // Ensures the cookie is sent over HTTPS only
            maxAge: 3600000 * 24, // Cookie expires after 1 hour (in milliseconds)
            sameSite: "none", // Restricts cross-site requests
        });
        // res.cookie("token", token, { expires: new Date(Date.now() + 900000), httpOnly: true } )
        // return response
        return res.send({ user: result.data, accessToken });
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const issues = error.issues;
            const message = issues.map((issue) => issue.message).join(", ");
            return res.status(400).send(message);
        }
        return res.status(500).send("Error: Sorry an error occurred trying to process request. Please refresh the page and try again.");
    }
});
exports.signInController = signInController;
const getMeController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const user = req.user as UserPublic;
        // const result = await getAuthUser(user.id, true);
        // @ts-ignore
        return res.status(200).send(req.user);
    }
    catch (error) {
        return res
            .status(403)
            .send("Authorization failed, please close the app and open try again");
    }
});
exports.getMeController = getMeController;
const refreshTokenController = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authToken = req.body.token;
        if (!authToken)
            return res.status(401).send("Invalid auth token, please try again");
        const jwtUser = (0, utils_1.getAuthTokenUser)(authToken);
        if (!jwtUser)
            return res.status(401).send("Invalid auth token, please try again");
        const result = yield (0, utils_2.getAuthUser)(jwtUser === null || jwtUser === void 0 ? void 0 : jwtUser.id, true);
        if (typeof result.data === "string" || result.status !== 200) {
            return res.status(result.status).send(result.data);
        }
        const user = result.data;
        // generate access token
        const accessToken = (0, utils_1.generateToken)(composeAuthUser(user), { expiresIn: "24h" });
        return res.status(200).send({ user, accessToken });
    }
    catch (error) {
        return res.status(500).send("Error: Sorry an error occurred trying to process request. Please close this app & open again.");
    }
});
exports.refreshTokenController = refreshTokenController;
