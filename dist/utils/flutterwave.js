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
exports.verifyFlutterwaveTxn = exports.flwAPI = void 0;
const Flutterwave = require('flutterwave-node-v3');
// import { Flutterwave } from "flutterwave-node-v3";
exports.flwAPI = new Flutterwave(process.env.FLUTTERWAVE_PUBK, process.env.FLUTTERWAVE_SECK);
const verifyFlutterwaveTxn = (_a) => __awaiter(void 0, [_a], void 0, function* ({ id, amount, currency }) {
    try {
        const response = yield exports.flwAPI.Transaction.verify({ id });
        if (response.data.status === "successful" &&
            response.data.amount === amount &&
            response.data.currency === currency) {
            return true;
        }
        return false;
    }
    catch (error) {
        return false;
    }
});
exports.verifyFlutterwaveTxn = verifyFlutterwaveTxn;
