export function inventoryConfig(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number, max = 10000) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const config = {
    initialTarget: number('QUIZ_INITIAL_TARGET', 100),
    defaultTarget: number('QUIZ_DEFAULT_TARGET', 200),
    low: number('QUIZ_LOW_THRESHOLD', 50),
    critical: number('QUIZ_CRITICAL_THRESHOLD', 20),
    batchSize: number('QUIZ_GENERATION_BATCH_SIZE', 50, 100),
    concurrency: number('QUIZ_WORKER_CONCURRENCY', 3, 20),
    maxTarget: number('QUIZ_MAX_TARGET', 2000),
    maxBatches: number('QUIZ_MAX_BATCHES_PER_JOB', 20, 100),
    attempts: number('QUIZ_GENERATION_ATTEMPTS', 3, 10),
    timeoutMs: number('QUIZ_GENERATION_TIMEOUT_MS', 90000, 300000),
    cooldownSeconds: number('QUIZ_FAILURE_COOLDOWN_SECONDS', 900, 86400),
    demandWindowSeconds: number('QUIZ_DEMAND_WINDOW_SECONDS', 3600, 86400),
    cacheSeconds: number('QUIZ_CACHE_SECONDS', 3600, 86400),
    batchIntervalMs: number('QUIZ_BATCH_INTERVAL_MS', 1000, 60000),
  };
  if (config.critical > config.low || config.low >= config.initialTarget ||
      config.initialTarget > config.defaultTarget || config.defaultTarget > config.maxTarget) {
    throw new Error('Quiz thresholds must satisfy critical <= low < initial <= default <= max');
  }
  return config;
}
export type InventoryConfig = ReturnType<typeof inventoryConfig>;
