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
exports.getContinentsAndCountries = void 0;
const db_1 = __importDefault(require("@/db"));
const getContinentsAndCountries = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.continent.findMany({ include: { countries: true } });
        if (result.length === 0) {
            return { data: "Not found", status: 404 };
        }
        return { data: result, status: 200 };
    }
    catch (error) {
        return { data: "Sorry an error occurred trying to get data", status: 500 };
    }
});
exports.getContinentsAndCountries = getContinentsAndCountries;
