import jwt, { SignOptions } from "jsonwebtoken"
import { encrytionKey, jwtKey } from "@/config"
import CryptoJS from "crypto-js"
import { ZodSchema, ZodIssue, infer as ZodInfer  } from 'zod';
import { randomUUID } from "crypto";
import { User } from "@/types";
import { v4 as uuidv4 } from 'uuid';
import { GameMode } from "@prisma/client";

/**
 * 
 * @param params any
 * @param expiresIn string | number - expressed in seconds or a string describing a time span zeit/ms. Eg: 60, "2 days", "10h", "7d"

 * @returns string
 */
export const jwtSign = (params: any, options: SignOptions) => {
    return jwt.sign(params, jwtKey, options)
}

export const jwtDecode = (token: string) =>{
    return jwt.decode(token)
}

export const jwtVerify = (token: string) =>{
    return jwt.verify(token, jwtKey )
}

export function encryptString(str: string, key: string) {
    let encJson = CryptoJS.AES.encrypt(str, key).toString()
    let encData = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(encJson))
    return encData
  }
  
export function decryptString<T>(str: string, key: string) {
    let decData = CryptoJS.enc.Base64.parse(str).toString(CryptoJS.enc.Utf8)
    let bytes = CryptoJS.AES.decrypt(decData, key).toString(CryptoJS.enc.Utf8)
    return JSON.parse(bytes) as T
}

export function generateToken(payload: object, options: SignOptions): string {
    const jsonString = JSON.stringify(payload);
    const encryptedPayload = encryptString(jsonString, encrytionKey );
    return jwtSign({ data: encryptedPayload }, options);
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

export const validateZodInput = <S extends ZodSchema>(
  payload: unknown,
  schema: S,
  isArrayErrorResult: boolean = false
): {
  message: string;
  data: ZodInfer<S> | null;
  errors?: string[] | Partial<ZodInfer<S>>;
} => {
  try {
    // Infer the type of the payload from the schema
    const parseResult = schema.parse(payload);
    return { data: parseResult, message: "success", errors: undefined };
  } catch (error: any) {
    const issues: ZodIssue[] = error.issues ?? [];
    const message = issues.map((issue: ZodIssue) => issue.message).join("\r\n");

    if (isArrayErrorResult) {
      const errors: string[] = issues.map((issue: ZodIssue) => issue.message);
      return { message, data: null, errors };
    }

    const errors: Partial<ZodInfer<S>> = {};
    for (const issue of issues) {
      const field = issue.path[0];
      if (typeof field === "string" || typeof field === "number") {
        errors[field as keyof ZodInfer<S>] = issue.message as ZodInfer<S>[keyof ZodInfer<S>];
      }
    }

    return { message, errors, data: null };
  }
};




export const composeMessage = ({playerName, content, playerId}:{ playerName?: string, content: string, playerId?: string }) => {
  return {
    id: randomUUID(),
    content,
    playerName: playerName ?? 'SWEN',
    playerId: playerId ?? randomUUID(), 
    createdAt: new Date().toISOString()
  }
}

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
export function isDateHourElapsed(date: Date | string, elapse: number): boolean {
  const givenDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();

  // Calculate the time difference in milliseconds
  const difference = now.getTime() - givenDate.getTime();

  // Convert the difference to hours
  const differenceInHours = difference / (1000 * 60 * 60);

  // Check if the difference is more than 1 hour
  return differenceInHours > elapse;
}

export function isDateMinuteElapsed(date: Date | string, elapse: number): boolean {

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
export function getRemainingDaysInMonth(): number {
  const today = new Date();
  
  // Get the current month and year
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // Month is 0-indexed
  
  // Create a new date for the first day of the next month
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  
  // Get the last day of the current month by subtracting 1 day from the next month's first day
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);  // Correct way to subtract 1 day
  
  // Calculate the remaining days in the month
  const remainingDays = nextMonth.getUTCDate() - today.getUTCDate();
  
  return remainingDays;
}

/**
 * Get the week number for a given date in a month (using UTC).
 * @param date The date for which to calculate the week.
 * @returns The week number (1-4 or 1-5).
 */
export function getWeekNumber(date: Date): number {
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

export function getDateInfo(date: Date = new Date()) {
  // Current date info
  const currentYear = date.getUTCFullYear();
  const currentMonth = date.getUTCMonth() + 1; // Months are zero-indexed
  const currentDay = date.getUTCDate();

  // Calculate current week
  const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
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
  const dayOfPrevYear = Math.floor(
    (tempDate.getTime() - startOfPrevYear.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
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
export const getStringMonth = (index: number) => {
  const monthNames: {[key: string]: string} = {
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
  }
  return monthNames[`${index}`]
};

export const getGameMode = (mode: GameMode) => {
  return mode.toLowerCase() as "single" | "multi"
}

// export const getCurrentMonthAndYear = () => {
//   const now = new Date();
//   const month = now.getUTCMonth() + 1
//   const year = now.getUTCFullYear();
//   return { month, year };
// };

export const getPlayerRankingKey = (args:{ranking: string, playerId: string, catId: string, mode: "single" | "multi"}) => {
  // get ranking keys
  const playerKeys = getPlayerRedisKeys(args.playerId, args.catId, args.mode)
  if(args.ranking === "today"){
    return playerKeys.today
  }
  if(args.ranking === "week"){
    return playerKeys.week
  }
  return playerKeys.month
}

// Helper function to calculate ISO week number
function getISOWeek(date: Date): { year: number; week: number } {
  const tempDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Set the date to Thursday of the current week (ISO starts week on Monday)
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  // First day of the year
  const startOfYear = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  // Calculate the ISO week number
  const week = Math.ceil(((tempDate.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7);
  return { year: tempDate.getUTCFullYear(), week };
}

export function getCurrentDataInfo(){
  const date = new Date()
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // Month is 1-indexed for the key
  const day = date.getUTCDate();
  const { week } = getISOWeek(date);

  return { year, month, week, day}
}

export const getRewardDateInfo = () => {
  const date = new Date()

  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const previousDay = new Date(utcDate);
  previousDay.setUTCDate(utcDate.getUTCDate() - 1);

  const previousMonth = new Date(utcDate);
  previousMonth.setUTCDate(1);
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
}

export function getRankingKeys(catId: string, mode: "single" | "multi"){
  const { day, month, week, year } = getCurrentDataInfo()
  return {
    month: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:month:${month}`,
    monthStat:`ranking:cat:${catId}:mode:${mode}:${year}:${month}:stat`,
    week:  `ranking:cat:${catId}:mode:${mode}:${year}:${month}:week:${week}`,
    today: `ranking:cat:${catId}:mode:${mode}:${year}:${month}:today:${day}`
  }
}

export function getRankingRewardKeys(catId: string, mode: "single" | "multi") {

  const info = getRewardDateInfo()

  return {
    dateInfo: {
      year: info.monthlyRewardYear,
      month: info.monthlyRewardMonth,
    },
    rewardMonth: `ranking:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:month:${info.monthlyRewardMonth}`,

    rewardMonthStat: `ranking:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:stat`,

    rewardWeek:  `ranking:cat:${catId}:mode:${mode}:${info.weeklyRewardYear}:${info.weeklyRewardMonth}:week:${info.weeklyRewardWeek}`,

    rewardDay: `ranking:cat:${catId}:mode:${mode}:${info.dailyRewardYear}:${info.dailyRewardMonth}:today:${info.dailyRewardDay}`,

  }
}

export function getPlayerRewardKeys(playerId: string, catId: string, mode: "single" | "multi") {

  const info = getRewardDateInfo()

  return {
    month: `player:${playerId}:cat:${catId}:mode:${mode}:${info.monthlyRewardYear}:${info.monthlyRewardMonth}:month:${info.monthlyRewardMonth}`,


    week:  `player:${playerId}:cat:${catId}:mode:${mode}:${info.weeklyRewardYear}:${info.weeklyRewardMonth}:week:${info.weeklyRewardWeek}`,


    day: `player:${playerId}:cat:${catId}:mode:${mode}:${info.dailyRewardYear}:${info.dailyRewardMonth}:today:${info.dailyRewardDay}`
  }
}


export function getUserRedisKeys(userId: string){
  return {
    session: `user:${userId}:session`,
    wallet: `user:${userId}:wallet`,
    txn: `user:${userId}:transactions`,
  }
}



export function getPlayerRedisKeys(playerId: string, catId: string, mode: "single" | "multi"){
  const { day, month, week, year } = getCurrentDataInfo()
  return {
    energy: `player:${playerId}:cat:${catId}:energy`,
    info: `player:${playerId}:cat:${catId}:mode:${mode}:${year}`,
    month: `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:month:${month}`,
    week:  `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:week:${week}`,
    today: `player:${playerId}:cat:${catId}:mode:${mode}:${year}:${month}:today:${day}`
  }
}

export function getSpentCoinsKey({gameId, catId, mode, dateInfo}:{gameId: string, catId: string, mode: GameMode, dateInfo?: { year: number, month: number}}){
  const _mode = getGameMode(mode)
  if(!dateInfo){
    const { month, year } = getCurrentDataInfo()
    return `game:${gameId}:category:${catId}:${_mode}:${year}:${month}:spent`
  }
  return `game:${gameId}:category:${catId}:${_mode}:${dateInfo.year}:${dateInfo.month}:spent`

}

export const getGameRandomTimer = () => {
  const timerArray = [18, 19, 12, 17, 14, 16, 20, 13, 15, 10];
  const count = timerArray.length;
  const random = Math.floor(Math.random() * count);
  const timer = timerArray[random];
  return timer;
};

/**
 * Set a Redis key to expire at a specific date/time (e.g., midnight UTC on the 8th day).
 * @param days The number of days after which the key should expire (plus one extra day).
 */
export function getExpiryAtUTC(days: number) {
  // Current time in milliseconds
  const now = new Date();
  // Calculate the expiration date (days + 1)
  const expirationDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (days),
    0, 0, 0 // Midnight UTC
  ));
  // Convert expiration date to UNIX timestamp (seconds)
  return Math.floor(expirationDate.getTime() / 1000);
}

export const getMonthlyExpiration = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // UTC month is zero-based, so add 1
  // Calculate the last second of the current month
  const firstDayNextMonth = new Date(Date.UTC(year, month, 1)); // First day of next month
  const lastSecondThisMonth = firstDayNextMonth.getTime() - 1; // Subtract 1 millisecond to get the last moment of the current month
  const nowUTC = Date.now();
  const secondsUntilExpiration = Math.floor(
    (lastSecondThisMonth - nowUTC) / 1000
  );
  return secondsUntilExpiration;
};

export function getRandomNumber(min: number, max: number, rounded: boolean = false): number {
  const random = Math.random() * (max - min) + min;
  return rounded ? Math.round(random) :  Math.round(random * 10) / 10; // Round to 1 decimal place
}

type StringNumberParser = Record<string, string>;

export const parseStringNumbers = (obj: StringNumberParser): Record<string, string | number> => {
  const parsed: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if the string is a valid number
    if (!isNaN(Number(value))) {
      parsed[key] = Number(value); // Convert to a number if valid
    } else {
      parsed[key] = value; // Keep as string if not a number
    }
  }

  return parsed;
};

export const getAuthTokenUser = (token?: string, logoutOnly = false) => {

    if(!token) return null;

    // Expired signatures can identify a session for revocation only, never for access.
    const payload = (logoutOnly ? jwt.verify(token, jwtKey, {ignoreExpiration: true}) : jwtVerify(token)) as { token: string, [key: string]: any}

    if(!payload) return null;
    // decrypt the token
    const user = decryptString(String(payload.data), encrytionKey)

    return user as User
}







export function generateUniqueRef(size: number = 16): string {
  const uuid = uuidv4().replace(/-/g, ''); // Remove dashes
  const numericValue = BigInt(`0x${uuid}`).toString(); // Convert to a large number
  return numericValue.slice(0, size); // Take the first 15 digits
}

export const extractCatId = (str: string): string | null => {
  const match = str.match(/cat:([a-zA-Z0-9]+)/); // Match 'cat:' followed by alphanumeric characters
  return match ? match[1] : null; // Return the captured group or null if not found
};

export function extractId(input: string) {
  // Regular expression to match the desired ID pattern
  const match = input.match(/_([a-z0-9]{24})_/i);
  return match ? match[1] : null; // Return the matched ID or null if not found
}


export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
