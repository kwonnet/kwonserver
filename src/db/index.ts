import { PrismaClient } from "@prisma/client";

const convertBigIntToNumber = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "bigint") return Number(obj);
    if (obj instanceof Date) return obj; // Preserve Date objects
    if (Array.isArray(obj)) return obj.map(convertBigIntToNumber);
    if (typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [key, convertBigIntToNumber(value)])
      );
    }
    return obj;
  };
  
let prisma: PrismaClient

if(process.env.NODE_ENV === 'production'){
    prisma = new PrismaClient()
      prisma.$use(async (params, next) => {
        // Only run for fetch operations
        if (
          (params.action === "findUnique" ||
          params.action === "findMany" ||
          params.action === "findFirst" ||
          params.action === "queryRaw" ||
          params.action === "createManyAndReturn" ||
          params.action === "createMany" || 
          params.action === "create" ||
          params.action === "groupBy" ||
          params.action === "aggregate"
        ) &&  
          (params.model === "Post" || params.model === "PostMedia" || params.model === "PollOption" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight" )
        ) {
          const result = await next(params);
          return convertBigIntToNumber(result);
        }
      
        return next(params); // Skip middleware for other operations
      });
}else{
    const globalPrisma = global as typeof global & { prisma?: PrismaClient}

    prisma = globalPrisma.prisma || new PrismaClient()
      
      prisma.$use(async (params, next) => {
        // Only run for fetch operations
        if (
          (params.action === "findUnique" ||
          params.action === "findMany" ||
          params.action === "findFirst" ||
          params.action === "queryRaw") ||
          params.action === "groupBy" ||
          params.action === "aggregate"
          && 
          (params.model === "Post" || params.model === "PostMedia" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight")
        ) {
          const result = await next(params);
          return convertBigIntToNumber(result);
        }
      
        return next(params); // Skip middleware for other operations
      });

    if(!globalPrisma.prisma) globalPrisma.prisma = prisma
}

export default prisma