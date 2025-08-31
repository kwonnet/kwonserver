"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_usd_tzx_rate = exports.get_tzx_usd_rate = void 0;
const get_tzx_usd_rate = (tzxAmount) => {
    return parseFloat((tzxAmount * 0.013).toFixed(2));
};
exports.get_tzx_usd_rate = get_tzx_usd_rate;
const get_usd_tzx_rate = (usdAmount) => {
    return parseFloat((usdAmount / 0.013).toFixed(2));
};
exports.get_usd_tzx_rate = get_usd_tzx_rate;
