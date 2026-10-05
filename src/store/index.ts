import { createCache } from 'cache-manager';
import { createKeyv as createKeyvRedis } from '@keyv/redis';
import logger from '@/logger';
import { setTimeout, clearTimeout } from 'node:timers';

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

// Shared reference/catalog reads only. Never use this for sessions, wallets,
// private profiles, or viewer-specific feeds. Redis failures fall back to SQL.
const pendingCatalogReads = new Map<string, Promise<unknown>>();
export async function cachedCatalogRead<T>(key: string, ttl: number, read: () => Promise<T>): Promise<T> {
    const cacheKey = `catalog:v1:${key}`;
    const existing = pendingCatalogReads.get(cacheKey);
    if (existing) return existing as Promise<T>;
    const operation = (async () => {
        let store: Awaited<ReturnType<typeof cacheMemoryStore>>;
        try { store = await cacheMemoryStore(); } catch { return read(); }
        let timedOut = false;
        // A slow Redis service must not stall a catalog request.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const hit = await Promise.race([
                store.get<T>(cacheKey),
                new Promise<undefined>(resolve => { timer = setTimeout(() => { timedOut = true; resolve(undefined); }, 200); }),
            ]);
            if (hit !== undefined && hit !== null) return hit;
        } catch { timedOut = true; /* Read directly when Redis is unavailable. */ }
        finally { if (timer) clearTimeout(timer); }
        const value = await read();
        // Do not cache failures or not-found service results.
        if (!timedOut && (value as {status?: number})?.status === 200) {
            void store.set(cacheKey, value, ttl).catch(() => undefined);
        }
        return value;
    })();
    pendingCatalogReads.set(cacheKey, operation);
    try { return await operation; }
    finally { pendingCatalogReads.delete(cacheKey); }
}
