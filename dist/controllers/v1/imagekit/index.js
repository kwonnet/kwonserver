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
exports.getImagekitAuthParams = getImagekitAuthParams;
exports.deleteImagekitFile = deleteImagekitFile;
const config_1 = require("@/config");
const utils_1 = require("@/utils");
const imagekit_1 = __importDefault(require("@/utils/imagekit"));
function getImagekitAuthParams(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = imagekit_1.default.getAuthenticationParameters((0, utils_1.generateUniqueRef)(32));
            console.log("Imagekit result ", result);
            return res.status(200).send(result);
        }
        catch (error) {
            return res.status(500).send(`Authentication request failed: ${error.message}`);
        }
    });
}
function deleteImagekitFile(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const fileId = req.params.fileId;
            if (!fileId)
                return Response.json("No valid ID provided", { status: 422 });
            if (fileId.includes(config_1.imagekitAppName)) {
                const files = yield imagekit_1.default.listFiles({ name: fileId });
                if (files.length > 0) {
                    const file = files[0];
                    yield imagekit_1.default.deleteFile(file.fileId);
                }
            }
            else {
                yield imagekit_1.default.deleteFile(fileId);
            }
            return res.send("Media file deleted successfully");
        }
        catch (error) {
            return res.status(500).json(`File deletion request failed: ${error.message}`);
        }
    });
}
