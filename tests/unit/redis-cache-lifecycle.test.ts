import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    disconnect: vi.fn(), createCache: vi.fn(), createKeyv: vi.fn(), on: vi.fn(),
}));
vi.mock('cache-manager', () => ({ createCache: mocks.createCache }));
vi.mock('@keyv/redis', () => ({ createKeyv: mocks.createKeyv }));
import cacheMemoryStore, { closeCacheStore } from '@/store';
it('reuses one connection across concurrent requests and releases it at shutdown', async () => {
    const cache = { disconnect: mocks.disconnect };
    mocks.createCache.mockReturnValue(cache);
    mocks.createKeyv.mockReturnValue({ on: mocks.on });
    const stores = await Promise.all(Array.from({ length: 100 }, () => cacheMemoryStore()));
    for (const store of stores) expect(store).toBe(cache);
    expect(mocks.createKeyv).toHaveBeenCalledOnce();
    await closeCacheStore();
    await closeCacheStore();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    await cacheMemoryStore();
    expect(mocks.createKeyv).toHaveBeenCalledTimes(2);
    await closeCacheStore();
});

it('caches successful catalogs, coalesces misses, and never caches failed service results', async () => {
    const entries = new Map();
    const cache = {
        disconnect: vi.fn(),
        get: vi.fn(async (key: string) => entries.get(key)),
        set: vi.fn(async (key: string, value: unknown) => { entries.set(key, value); }),
    };
    mocks.createCache.mockReturnValue(cache);
    mocks.createKeyv.mockReturnValue({ on: mocks.on });
    const { cachedCatalogRead } = await import('@/store');
    const read = vi.fn(async () => ({ status: 200, data: ['country'] }));
    await Promise.all(Array.from({ length: 20 }, () => cachedCatalogRead('test-locations', 60_000, read)));
    await cachedCatalogRead('test-locations', 60_000, read);
    expect(read).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledWith('catalog:v1:test-locations', {status: 200, data: ['country']}, 60_000);
    const failed = vi.fn(async () => ({status: 500, data: 'failure'}));
    await cachedCatalogRead('failed', 60_000, failed);
    await cachedCatalogRead('failed', 60_000, failed);
    expect(failed).toHaveBeenCalledTimes(2);
    await closeCacheStore();
});

it('falls back to the database when cache reads reject or stall', async () => {
    const cache = {disconnect: vi.fn(), get: vi.fn().mockRejectedValue(new Error('offline')), set: vi.fn().mockResolvedValue(undefined)};
    mocks.createCache.mockReturnValue(cache);
    const { cachedCatalogRead } = await import('@/store');
    const read = vi.fn(async () => ({status: 200, data: 'fresh'}));
    expect(await cachedCatalogRead('offline', 60_000, read)).toEqual({status: 200, data: 'fresh'});
    cache.get.mockImplementation(() => new Promise(() => {}));
    expect(await cachedCatalogRead('stalled', 60_000, read)).toEqual({status: 200, data: 'fresh'});
    expect(read).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
    await closeCacheStore();
});
