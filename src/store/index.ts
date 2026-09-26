import { createCache } from 'cache-manager';
import { createKeyv as createKeyvRedis } from '@keyv/redis';

const cacheMemoryStore = async () => {
    try {
        const redisStore = createKeyvRedis(process.env.REDIS_URL);

    return createCache({
        stores: [redisStore],
    });
    } catch (error: any) {
        console.log(`Error initializing cache store: ${error?.message}`)
       throw error 
    }
}

export default cacheMemoryStore