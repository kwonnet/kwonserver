import { createCache } from 'cache-manager';
import { createKeyv as createKeyvRedis } from '@keyv/redis';

const cacheMemoryStore = async () => {
    try {
        const redisStore = createKeyvRedis(String(process.env.REDIS_URL));

        console.log(`Cache store initialized with Redis Connnected`);

    return createCache({
        stores: [redisStore],
    });
    } catch (error: any) {
        console.log(`Error initializing cache store: ${error?.message}`)
       throw error 
    }
}

export default cacheMemoryStore