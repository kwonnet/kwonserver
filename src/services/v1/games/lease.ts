import { AsyncLocalStorage } from "node:async_hooks";
import redis from "@/redis";
export const gameRuntimeLease = new AsyncLocalStorage<{
  key: string;
  token: string;
}>();
export async function assertGameRuntimeLease() {
  const lease = gameRuntimeLease.getStore();
  if (lease && (await redis.get(lease.key)) !== lease.token)
    throw new Error("Game room lease was replaced");
}
