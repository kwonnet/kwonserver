import { PrismaClient } from "@prisma/client";

// Enabling relationJoins changes Prisma's default. Keep existing queries on their
// previous strategy; latency-sensitive reads explicitly opt into database joins.
const preserveReadStrategy = ({ args, query }: any) =>
  query({ ...args, relationLoadStrategy: args.relationLoadStrategy ?? "query" });

const createClient = () => new PrismaClient().$extends({
  query: {
    $allModels: {
      findMany: preserveReadStrategy,
      findFirst: preserveReadStrategy,
      findFirstOrThrow: preserveReadStrategy,
      findUnique: preserveReadStrategy,
      findUniqueOrThrow: preserveReadStrategy,
    },
  },
}) as unknown as PrismaClient;

type Client = ReturnType<typeof createClient>;
const globalPrisma = globalThis as typeof globalThis & { prisma?: Client };
const prisma = globalPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalPrisma.prisma = prisma;

export default prisma;
