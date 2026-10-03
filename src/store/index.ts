import { createCache } from 'cache-manager';
import { createKeyv as createKeyvRedis } from '@keyv/redis';
import logger from '@/logger';

let store: ReturnType<typeof createCache> | undefined;

// One cache/Redis client per process, not per HTTP request. Construction is
// synchronous so simultaneous first callers cannot create separate clients.
const cacheMemoryStore = async () => {
    if (!store) {
        const redisStore = createKeyvRedis(String(process.env.REDIS_URL));
        redisStore.on('error', () => logger.warn('Redis cache unavailable'));
        store = createCache({ stores: [redisStore] });
    }
    return store;
};

export async function closeCacheStore() {
    const current = store;
    store = undefined;
    await current?.disconnect();
}

export default cacheMemoryStore;
