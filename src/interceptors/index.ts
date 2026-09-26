import { Request, Response, NextFunction } from 'express';
import cacheMemoryStore from '@/store';
import { serializeBigInts } from "@/services/v1/utils";

export const storeDataInCacheMemory = async(req: Request, data: any, {global, ttl}:{global?: boolean, ttl: number}) => {
    try {
        const user = req.user
        const key = (global || !user) ? req.url :  user?.id + req?.url;
        const store = await cacheMemoryStore()
        const converted = serializeBigInts(data);
        console.log("Saving cache key ", key )
        store.set(key, converted, ttl);
        return {message: "Success", isError: false}
    } catch (error: any) {
        console.log("Error saving data ", error?.message)
        return {message: error?.message, isError: true}
    }
}

export const cacheInterceptor = ({global}:{global?: boolean}) => async(req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user
        const key = (global || !user) ? req.url :  user?.id + req?.url;
        const store = await cacheMemoryStore()
        console.log("Getting cache key ", key )
        const data = await store.get(key) as any
        if(!data) return next();
        return res.json(data)
    } catch (error: any) {
        console.log("Error data not found ", error?.message)
        return next();
    }
};