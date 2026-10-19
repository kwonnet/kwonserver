import redis from "@/redis";
/** A single time authority for admission, phase deadlines and displayed timers. */
export async function gameClock() {
  const result = await redis.eval(
    "local t=redis.call('TIME');return tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)",
    { keys: [], arguments: [] },
  );
  return Number(result);
}
