import { Request } from "express";
import { lookup } from "ip-location-api";
import DeviceDetector from "node-device-detector";
import ClientHints from "node-device-detector/client-hints";

const detector = new DeviceDetector();

const clientHints = new ClientHints();

export const removeProperty = <T extends object, K extends keyof T>(
  obj: T,
  key: K
): Omit<T, K> => {
  const { [key]: _, ...rest } = obj;
  return rest as Omit<T, K>;
};

export function delayExecution(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryExecution<T>(
  promiseFunction: () => Promise<T>,
  retries: number,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Attempt to execute the promise function
      return await promiseFunction();
    } catch (error) {
      // If the function throws an error, record it and retry if we still have attempts left
      lastError = error as Error;
      if (attempt < retries) {
        console.log(`Attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
        // Wait for the specified delay before retrying
        await delayExecution(delayMs);
      } else {
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
}

export function formatNumberWithCommas(num: number): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const getAuthorizationToken = (req: Request) => {
  const cookieToken = req.cookies.x_a_t;

  if (cookieToken) return cookieToken as string;

  const queryToken = req?.query?.token;

  if (queryToken) return queryToken as string;

  const bearerToken = req.headers.authorization;

  if (bearerToken) return bearerToken.split("Bearer ")[1];

  return null;
};

export const getReqIPInfo = async (ip?: string) => {
  try {
    const clientIp = ip?.includes("::ffff:")
      ? ip.split("::ffff:")[1]
      : ip ?? "";

    console.log("user clientIp Ip: ", clientIp);

    const lookupIP =
      !clientIp || clientIp?.includes("::1") ? "8.8.8.8" : clientIp;

    console.log("user lookupIP Ip: ", lookupIP);

    return await lookup(lookupIP);
  } catch (error) {
    return null;
  }
};

export const isEmptyObject = (obj: any) => {
  for (const i in obj) {
    return false;
  }
  return true;
};

export const getReqInfo = async (req: Request) => {
  const headers = req.headers;

  const useragent = headers["user-agent"];

  const deviceResult = detector.detect(
    useragent ?? "",
    clientHints.parse(headers as any, {})
  );

  const detectBot = detector.parseBot(useragent ?? "");

  const isBot = !isEmptyObject(detectBot);

  const ipInfo = await getReqIPInfo(req.ip);

  return { device: deviceResult, ipInfo, isBot };
};

export class AppError extends Error {
  public readonly isOperational: boolean;
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
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
