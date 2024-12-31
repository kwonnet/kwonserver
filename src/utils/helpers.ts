import { Request } from "express";

export function delayExecution(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


export async function retryExecution<T>(promiseFunction: () => Promise<T>, retries: number, delayMs: number = 1000): Promise<T> {
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
    throw new Error('Unexpected error during retries');
  }

  export function formatNumberWithCommas(num: number): string {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  export const getAuthorizationToken = (req: Request) => {
  
      const cookieToken = req.cookies.x_a_t
  
      if(cookieToken) return cookieToken as string
  
      const bearerToken = req.headers.authorization
  
      if(!bearerToken) return null
  
      return bearerToken.split("Bearer ")[1]
  
  }