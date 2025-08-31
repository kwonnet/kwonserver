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
exports.extractCatId = exports.getCurrent_ton_usd_rate = exports.getAuthTokenUser = exports.parseStringNumbers = exports.getMonthlyExpiration = exports.getGameRandomTimer = exports.getRewardDateInfo = exports.getPlayerRankingKey = exports.getGameMode = exports.getStringMonth = exports.composeMessage = exports.validateZodInput = exports.jwtVerify = exports.jwtDecode = exports.jwtSign = void 0;
exports.encryptString = encryptString;
exports.decryptString = decryptString;
exports.generateToken = generateToken;
exports.isDateHourElapsed = isDateHourElapsed;
exports.isDateMinuteElapsed = isDateMinuteElapsed;
exports.getRemainingDaysInMonth = getRemainingDaysInMonth;
exports.getWeekNumber = getWeekNumber;
exports.getDateInfo = getDateInfo;
exports.getCurrentDataInfo = getCurrentDataInfo;
exports.getRankingKeys = getRankingKeys;
exports.getRankingRewardKeys = getRankingRewardKeys;
exports.getPlayerRewardKeys = getPlayerRewardKeys;
exports.getUserRedisKeys = getUserRedisKeys;
exports.getPlayerRedisKeys = getPlayerRedisKeys;
exports.getSpentCoinsKey = getSpentCoinsKey;
exports.getExpiryAtUTC = getExpiryAtUTC;
exports.getRandomNumber = getRandomNumber;
exports.getTONRate = getTONRate;
exports.generateUniqueRef = generateUniqueRef;
exports.extractId = extractId;
exports.sleep = sleep;
exports.getWithrawalTxnFee = getWithrawalTxnFee;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@/config");
const crypto_js_1 = __importDefault(require("crypto-js"));
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
/**
 *
 * @param params any
 * @param expiresIn string | number - expressed in seconds or a string describing a time span zeit/ms. Eg: 60, "2 days", "10h", "7d"

 * @returns string
 */
const jwtSign = (params, options) => {
    return jsonwebtoken_1.default.sign(params, config_1.jwtKey, options);
};
exports.jwtSign = jwtSign;
const jwtDecode = (token) => {
    return jsonwebtoken_1.default.decode(token);
};
exports.jwtDecode = jwtDecode;
const jwtVerify = (token) => {
    return jsonwebtoken_1.default.verify(token, config_1.jwtKey);
};
exports.jwtVerify = jwtVerify;
function encryptString(str, key) {
    let encJson = crypto_js_1.default.AES.encrypt(str, key).toString();
    let encData = crypto_js_1.default.enc.Base64.stringify(crypto_js_1.default.enc.Utf8.parse(encJson));
    return encData;
}
function decryptString(str, key) {
    let decData = crypto_js_1.default.enc.Base64.parse(str).toString(crypto_js_1.default.enc.Utf8);
    let bytes = crypto_js_1.default.AES.decrypt(decData, key).toString(crypto_js_1.default.enc.Utf8);
    return JSON.parse(bytes);
}
function generateToken(payload, options) {
    const jsonString = JSON.stringify(payload);
    const encryptedPayload = encryptString(jsonString, config_1.encrytionKey);
    return (0, exports.jwtSign)({ data: encryptedPayload }, options);
}
// export const validateZodInput = <T>(
//   payload: T,
//   schema: ZodSchema,
//   isArrayErrorResult: boolean = false
// ): {message: string, data: T | null, errors?: string[] | Partial<T> } => {
//   try {
//     const parseResult = schema?.parse(payload);
//     return { data: parseResult as T, message: 'success', errors: undefined };
//   } catch (error: any) {
//     const issues: ZodIssue[] = error.issues ?? [];
//     const message = issues.map((issue: ZodIssue) => issue.message).join('\r\n');
//     if (isArrayErrorResult) {
//       const errors: string[] = issues.map((issue: ZodIssue) => issue.message);
//       return { message, data: null, errors };
//     }
//     const errors: Partial<T> = {};
//     for (const issue of issues) {
//       const field = issue.path[0];
//       errors[field as keyof T] = issue.message as T[keyof T];
//     }
//     return { message, errors, data: null };
//   }
// };
const validateZodInput = (payload, schema, isArrayErrorResult = false) => {
    var _a;
    try {
        // Infer the type of the payload from the schema
        const parseResult = schema.parse(payload);
        return { data: parseResult, message: "success", errors: undefined };
    }
    catch (error) {
        const issues = (_a = error.issues) !== null && _a !== void 0 ? _a : [];
        const message = issues.map((issue) => issue.message).join("\r\n");
        if (isArrayErrorResult) {
            const errors = issues.map((issue) => issue.message);
            return { message, data: null, errors };
        }
        const errors = {};
        for (const issue of issues) {
            const field = issue.path[0];
            if (typeof field === "string" || typeof field === "number") {
                errors[field] = issue.message;
            }
        }
        return { message, errors, data: null };
    }
};
exports.validateZodInput = validateZodInput;
const composeMessage = ({ playerName, content, playerId }) => {
    return {
        id: (0, crypto_1.randomUUID)(),
        content,
        playerName: playerName !== null && playerName !== void 0 ? playerName : 'SWEN',
        playerId: playerId !== null && playerId !== void 0 ? playerId : (0, crypto_1.randomUUID)(),
        createdAt: new Date().toISOString()
    };
};
exports.composeMessage = composeMessage;
/**
 * Checks if a given date is more than a specified number of hours elapsed from the current date.
 *
 * @param date - The date to compare. Can be a string in a valid date format or a Date object.
 * @param elapse - The number of hours to elapse.
 *
 * @returns A boolean indicating whether the given date is more than `elapse` hours elapsed from the current date.
 *
 * @example
 * ```typescript
 * const date1 = new Date("2022-01-01T10:00:00Z"); // 10:00 AM UTC
 * const date2 = new Date("2022-01-01T12:00:00Z"); // 12:00 PM UTC
 * const date3 = new Date("2022-01-01T14:00:00Z"); // 2:00 PM UTC
 *
 * console.log(isDateHourElapsed(date1, 2)); // Output: false
 * console.log(isDateHourElapsed(date2, 2)); // Output: true
 * console.log(isDateHourElapsed(date3, 2)); // Output: true
 * ```
 */
function isDateHourElapsed(date, elapse) {
    const givenDate = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    // Calculate the time difference in milliseconds
    const difference = now.getTime() - givenDate.getTime();
    // Convert the difference to hours
    const differenceInHours = difference / (1000 * 60 * 60);
    // Check if the difference is more than 1 hour
    return differenceInHours > elapse;
}
function isDateMinuteElapsed(date, elapse) {
    const givenDate = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    // Calculate the time difference in milliseconds
    const difference = now.getTime() - givenDate.getTime();
    // Convert the difference to hours
    const differenceInMinutes = difference / (1000 * 60);
    // Check if the difference is more than the specified minute
    return differenceInMinutes > elapse;
}
/**
 * Get the remaining days of the current month from the current date.
 * @returns The number of remaining days in the current month.
 */
function getRemainingDaysInMonth() {
    const today = new Date();
    // Get the current month and year
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth(); // Month is 0-indexed
    // Create a new date for the first day of the next month
    const nextMonth = new Date(Date.UTC(year, month + 1, 1));
    // Get the last day of the current month by subtracting 1 day from the next month's first day
    nextMonth.setUTCDate(nextMonth.getUTCDate() - 1); // Correct way to subtract 1 day
    // Calculate the remaining days in the month
    const remainingDays = nextMonth.getUTCDate() - today.getUTCDate();
    return remainingDays;
}
/**
 * Get the week number for a given date in a month (using UTC).
 * @param date The date for which to calculate the week.
 * @returns The week number (1-4 or 1-5).
 */
function getWeekNumber(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth(); // Month is 0-indexed
    const day = date.getUTCDate();
    // Get the first day of the month in UTC
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const startDayOfWeek = firstDayOfMonth.getUTCDay(); // 0 (Sunday) to 6 (Saturday)
    // Calculate the zero-based day of the month (adjusted for the starting weekday)
    const adjustedDay = day + startDayOfWeek - 1;
    // Calculate the week number (1-indexed)
    return Math.floor(adjustedDay / 7) + 1;
}
function getDateInfo(date = new Date()) {
    // Current date info
    const currentYear = date.getUTCFullYear();
    const currentMonth = date.getUTCMonth() + 1; // Months are zero-indexed
    const currentDay = date.getUTCDate();
    // Calculate current week
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const currentWeek = Math.ceil(dayOfYear / 7);
    // Previous date info
    const previousDate = new Date(date);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const previousYear = previousDate.getUTCFullYear();
    const previousMonth = previousDate.getUTCMonth() + 1;
    const previousDay = previousDate.getUTCDate();
    // Calculate previous week
    const tempDate = new Date(date);
    tempDate.setUTCDate(tempDate.getUTCDate() - 7);
    const startOfPrevYear = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    const dayOfPrevYear = Math.floor((tempDate.getTime() - startOfPrevYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const previousWeek = Math.ceil(dayOfPrevYear / 7);
    return {
        currentYear,
        currentMonth,
        currentDay,
        currentWeek,
        previousYear,
        previousMonth,
        previousDay,
        previousWeek,
    };
}
/**
 *
 * @param index number between 1 to 12
 * @returns string
 */
const getStringMonth = (index) => {
    const monthNames = {
        "1": "january",
        "2": "february",
        "3": "march",
        "4": "april",
        "5": "may",
        "6": "june",
        "7": "july",
        "8": "august",
        "9": "september",
        "10": "october",
        "11": "november",
        "12": "december",
    };
    return monthNames[`${index}`];
};
exports.getStringMonth = getStringMonth;
const getGameMode = (mode) => {
    return mode.toLowerCase();
};
exports.getGameMode = getGameMode;
// export const getCurrentMonthAndYear = () => {
//   const now = new Date();
//   const month = now.getUTCMonth() + 1
//   const year = now.getUTCFullYear();
//   return { month, year };
// };
const getPlayerRankingKey = (args) => {
    // get ranking keys
    const playerKeys = getPlayerRedisKeys(args.playerId, args.catId, args.mode);
    if (args.ranking === "today") {
        return playerKeys.today;
    }
    if (args.ranking === "week") {
        return playerKeys.week;
    }
    return playerKeys.month;
};
exports.getPlayerRankingKey = getPlayerRankingKey;
// Helper function to calculate ISO week number
function getISOWeek(date) {
    const tempDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Set the date to Thursday of the current week (ISO starts week on Monday)
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
    // First day of the year
    const startOfYear = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    // Calculate the ISO week number
    const week = Math.ceil(((tempDate.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7);
    return { year: tempDate.getUTCFullYear(), week };
}
function getCurrentDataInfo() {
    const date = new Date();
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // Month is 1-indexed for the key
    const day = date.getUTCDate();
    const { week } = getISOWeek(date);
    return { year, month, week, day };
}
const getRewardDateInfo = () => {
    const date = new Date();
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const previousDay = new Date(utcDate);
    previousDay.setUTCDate(utcDate.getUTCDate() - 1);
    const previousMonth = new Date(utcDate);
    previousMonth.setUTCMonth(utcDate.getUTCMonth() - 1);
    // Current week info
    // const { year: currentYear, week: currentWeek } = getISOWeek(utcDate);
    // console.log(currentYear, currentWeek)
    // Previous week info
    const previousWeekDate = new Date(utcDate);
    previousWeekDate.setUTCDate(utcDate.getUTCDate() - 7);
    const { year: previousWeekYear, week: previousWeekNumber } = getISOWeek(previousWeekDate);
    return {
        yearlyRewardYear: utcDate.getUTCFullYear() - 1,
        monthlyRewardYear: previousMonth.getUTCFullYear(),
        monthlyRewardMonth: previousMonth.getUTCMonth() + 1,
        weeklyRewardYear: previousWeekYear,
        weeklyRewardMonth: previousWeekDate.getUTCMonth() + 1, // Month the week falls into
        weeklyRewardWeek: previousWeekNumber,
        dailyRewardYear: previousDay.getUTCFullYear(),
        dailyRewardMonth: previousDay.getUTCMonth() + 1,
        dailyRewardDay: previousDay.getUTCDate(),
    };
};
exports.getRewardDateInfo = getRewardDateInfo;
function getRankingKeys(catId, mode) {
    const { day, month, week, year } = getCurrentDataInfo();
    return {
        month: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:month:${month}`,
        monthStat: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:stat`,
        week: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:week:${week}`,
        today: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:today:${day}`
    };
}
function getRankingRewardKeys(catId, mode) {
    const info = (0, exports.getRewardDateInfo)();
    return {
        dateInfo: {
            year: info.monthlyRewardYear,
            month: info.monthlyRewardMonth,
        },
        rewardMonth: `ranking:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:month:${info.monthlyRewardMonth}`,
        rewardMonthStat: `ranking:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:stat`,
        rewardWeek: `ranking:cat:${catId}:mode:${mode}:${info.weeklyRewardYear}:${info.weeklyRewardMonth}:week:${info.weeklyRewardWeek}`,
        rewardDay: `ranking:cat:${catId}:mode:${mode}:${info.dailyRewardYear}:${info.dailyRewardMonth}:today:${info.dailyRewardDay}`,
    };
}
function getPlayerRewardKeys(playerId, catId, mode) {
    const info = (0, exports.getRewardDateInfo)();
    return {
        month: `player:${playerId}:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:month:${info.monthlyRewardMonth}`,
        week: `player:${playerId}:cat:${catId}:mode:${mode}:${info.weeklyRewardYear}:${info.weeklyRewardMonth}:week:${info.weeklyRewardWeek}`,
        day: `player:${playerId}:cat:${catId}:mode:${mode}:${info.dailyRewardYear}:${info.dailyRewardMonth}:today:${info.dailyRewardDay}`
    };
}
function getUserRedisKeys(userId) {
    return {
        session: `user:${userId}:session`,
        wallet: `user:${userId}:wallet`,
        txn: `user:${userId}:transactions`,
    };
}
function getPlayerRedisKeys(playerId, catId, mode) {
    const { day, month, week, year } = getCurrentDataInfo();
    return {
        energy: `player:${playerId}:cat:${catId}:energy`,
        info: `player:${playerId}:cat:${catId}:mode:${mode}:${year}`,
        month: `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:month:${month}`,
        week: `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:week:${week}`,
        today: `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:today:${day}`
    };
}
function getSpentCoinsKey({ gameId, catId, mode, dateInfo }) {
    const _mode = (0, exports.getGameMode)(mode);
    if (!dateInfo) {
        const { month, year } = getCurrentDataInfo();
        return `game:${gameId}:category:${catId}:${_mode}:${year}:${month}:spent`;
    }
    return `game:${gameId}:category:${catId}:${_mode}:${dateInfo.year}:${dateInfo.month}:spent`;
}
const getGameRandomTimer = () => {
    const timerArray = [18, 19, 12, 17, 14, 16, 20, 13, 15, 10];
    const count = timerArray.length - 1;
    const random = Math.floor(Math.random() * count);
    const timer = timerArray[random];
    return timer;
};
exports.getGameRandomTimer = getGameRandomTimer;
/**
 * Set a Redis key to expire at a specific date/time (e.g., midnight UTC on the 8th day).
 * @param days The number of days after which the key should expire (plus one extra day).
 */
function getExpiryAtUTC(days) {
    // Current time in milliseconds
    const now = new Date();
    // Calculate the expiration date (days + 1)
    const expirationDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (days), 0, 0, 0 // Midnight UTC
    ));
    // Convert expiration date to UNIX timestamp (seconds)
    return Math.floor(expirationDate.getTime() / 1000);
}
const getMonthlyExpiration = () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1; // UTC month is zero-based, so add 1
    // Calculate the last second of the current month
    const firstDayNextMonth = new Date(Date.UTC(year, month, 1)); // First day of next month
    const lastSecondThisMonth = firstDayNextMonth.getTime() - 1; // Subtract 1 millisecond to get the last moment of the current month
    const nowUTC = Date.now();
    const secondsUntilExpiration = Math.floor((lastSecondThisMonth - nowUTC) / 1000);
    return secondsUntilExpiration;
};
exports.getMonthlyExpiration = getMonthlyExpiration;
function getRandomNumber(min, max, rounded = false) {
    const random = Math.random() * (max - min) + min;
    return rounded ? Math.round(random) : Math.round(random * 10) / 10; // Round to 1 decimal place
}
const parseStringNumbers = (obj) => {
    const parsed = {};
    for (const [key, value] of Object.entries(obj)) {
        // Check if the string is a valid number
        if (!isNaN(Number(value))) {
            parsed[key] = Number(value); // Convert to a number if valid
        }
        else {
            parsed[key] = value; // Keep as string if not a number
        }
    }
    return parsed;
};
exports.parseStringNumbers = parseStringNumbers;
const getAuthTokenUser = (token) => {
    if (!token)
        return null;
    const payload = (0, exports.jwtVerify)(token);
    if (!payload)
        return null;
    // decrypt the token
    const user = decryptString(String(payload.data), config_1.encrytionKey);
    return user;
};
exports.getAuthTokenUser = getAuthTokenUser;
const getCurrent_ton_usd_rate = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const res = { data: { "the-open-network": { usd: 6.3 } } }; //await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd")
        const result = yield fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
        if (!result.ok)
            return null;
        const data = yield result.json();
        const tonUsdRate = data["the-open-network"]["usd"];
        if (!tonUsdRate)
            return null;
        return tonUsdRate;
    }
    catch (error) {
        return null;
    }
});
exports.getCurrent_ton_usd_rate = getCurrent_ton_usd_rate;
function getTONRate(curr_ton_rate, amount, isWithrawal) {
    const rate = !isWithrawal ? curr_ton_rate - 0.9 : curr_ton_rate + 0.1;
    const coin_usd = amount * 0.013;
    const tonRate = coin_usd / rate;
    return parseFloat(tonRate.toFixed(2));
}
function generateUniqueRef(size = 16) {
    const uuid = (0, uuid_1.v4)().replace(/-/g, ''); // Remove dashes
    const numericValue = BigInt(`0x${uuid}`).toString(); // Convert to a large number
    return numericValue.slice(0, size); // Take the first 15 digits
}
const extractCatId = (str) => {
    const match = str.match(/category:([a-zA-Z0-9]+)/); // Match 'category:' followed by alphanumeric characters
    return match ? match[1] : null; // Return the captured group or null if not found
};
exports.extractCatId = extractCatId;
function extractId(input) {
    // Regular expression to match the desired ID pattern
    const match = input.match(/_([a-z0-9]{24})_/i);
    return match ? match[1] : null; // Return the matched ID or null if not found
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function getWithrawalTxnFee(amount) {
    if (amount <= 500) {
        // fee should be $0.5
        return parseFloat((0.5 / 0.013).toFixed(2));
    }
    // fee should be $1
    return parseFloat((1 / 0.013).toFixed(2));
}
