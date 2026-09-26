import { serializeBigInts } from "@/services/v1/utils";
import { PrismaClient, Prisma } from "@prisma/client";


let prisma: PrismaClient;

type ModelName = Prisma.ModelName;

const targetModels: string[] | ModelName[] = ["Post", "PostMedia", "PollOption", "Bookmark", "LikedPost", "PostHighlight"];
  const fetchOperations = [
    "findUnique",
    "findMany",
    "findFirst",
    "queryRaw",
    "createManyAndReturn",
    "createMany",
    "create",
    "groupBy",
    "aggregate",
  ];

// const applyBigIntConversion = async ({ model, operation, args, query }: any) => {
//   const targetModels: ModelName[] = ["Post", "PostMedia", "PollOption", "Bookmark", "LikedPost", "PostHighlight"];
//   const fetchOperations = [
//     "findUnique",
//     "findMany",
//     "findFirst",
//     "queryRaw",
//     "createManyAndReturn",
//     "createMany",
//     "create",
//     "groupBy",
//     "aggregate",
//   ];

//   if (fetchOperations.includes(operation) && targetModels.includes(model)) {
//     const result = await query(args);
//     return convertBigIntToNumber(result);
//   }

//   return query(args); // skip conversion for other operations
// };

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient()
  prisma.$extends({
    query: {
      // $allModels: {
      //   $allOperations: async({ model, operation, args, query }) => {
      //     if (fetchOperations.includes(operation) && targetModels.includes(model)) {
      //       const result = await query(args);
            
      //       return convertBigIntToNumber(result);
      //     }

      //     return query(args); // skip conversion for other operations
      //   },
      // },
      $allOperations: async({ model, operation, args, query }) => {
          console.log("Extensions - ", model, operation)
          if (fetchOperations.includes(operation) && targetModels.includes(model as Prisma.ModelName)) {
            const result = await query(args);
            console.log("modified result", result)
            return serializeBigInts(result);
          }

          return query(args); // skip conversion for other operations
        },
    },
  });
} else {
  const globalPrisma = global as typeof global & { prisma?: PrismaClient };
  prisma = globalPrisma.prisma || new PrismaClient()
  prisma.$extends({
    query: {
      // $allModels: {
      //   $allOperations: async({ model, operation, args, query }) => {
      //     console.log("Extensions - ", model, operation)
      //     if (fetchOperations.includes(operation) && targetModels.includes(model)) {
      //       const result = await query(args);
      //       console.log("modified result", result)
      //       return convertBigIntToNumber(result);
      //     }

      //     return query(args); // skip conversion for other operations
      //   },
      // },
      $allOperations: async({ model, operation, args, query }) => {
          console.log("Extensions - ", model, operation)
          if (fetchOperations.includes(operation) && targetModels.includes(model as Prisma.ModelName)) {
            const result = await query(args);
            console.log("modified result", result)
            return serializeBigInts(result);
          }

          return query(args); // skip conversion for other operations
        },
    },

  });

  // if (!globalPrisma.prisma) globalPrisma.prisma = prisma;
}

export default prisma;


// import { PrismaClient } from "@prisma/client";

// const convertBigIntToNumber = (obj: any): any => {
//     if (obj === null || obj === undefined) return obj;
//     if (typeof obj === "bigint") return Number(obj);
//     if (obj instanceof Date) return obj; // Preserve Date objects
//     if (Array.isArray(obj)) return obj.map(convertBigIntToNumber);
//     if (typeof obj === "object") {
//       return Object.fromEntries(
//         Object.entries(obj).map(([key, value]) => [key, convertBigIntToNumber(value)])
//       );
//     }
//     return obj;
//   };
  
// let prisma: PrismaClient

// if(process.env.NODE_ENV === 'production'){
//     prisma = new PrismaClient()
//       prisma.$use(async (params, next) => {
//         // Only run for fetch operations
//         if (
//           (params.action === "findUnique" ||
//           params.action === "findMany" ||
//           params.action === "findFirst" ||
//           params.action === "queryRaw" ||
//           params.action === "createManyAndReturn" ||
//           params.action === "createMany" || 
//           params.action === "create" ||
//           params.action === "groupBy" ||
//           params.action === "aggregate"
//         ) &&  
//           (params.model === "Post" || params.model === "PostMedia" || params.model === "PollOption" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight" )
//         ) {
//           const result = await next(params);
//           return convertBigIntToNumber(result);
//         }
      
//         return next(params); // Skip middleware for other operations
//       });
// }else{
//     const globalPrisma = global as typeof global & { prisma?: PrismaClient}

//     prisma = globalPrisma.prisma || new PrismaClient()
      
//       prisma.$use(async (params, next) => {
//         // Only run for fetch operations
//         if (
//           (params.action === "findUnique" ||
//           params.action === "findMany" ||
//           params.action === "findFirst" ||
//           params.action === "queryRaw") ||
//           params.action === "groupBy" ||
//           params.action === "aggregate"
//           && 
//           (params.model === "Post" || params.model === "PostMedia" || params.model === "Bookmark" || params.model === "LikedPost" || params.model === "PostHighlight")
//         ) {
//           const result = await next(params);
//           return convertBigIntToNumber(result);
//         }
      
//         return next(params); // Skip middleware for other operations
//       });

//     if(!globalPrisma.prisma) globalPrisma.prisma = prisma
// }

// export default prisma