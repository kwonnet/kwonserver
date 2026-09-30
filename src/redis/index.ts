import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.on('error', err => console.log('Redis Client Error', err?.message));

redisClient.connect().then(() => {
    console.log("Redis db connection established")
}).catch(err => console.log('Redis db connection error', err?.message));

export default redisClient
