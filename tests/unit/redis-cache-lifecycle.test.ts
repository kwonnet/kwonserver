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
