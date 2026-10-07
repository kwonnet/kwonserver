import { PrismaClient } from "@prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";

// Enabling relationJoins changes Prisma's default. Keep existing queries on their
// previous strategy; latency-sensitive reads explicitly opt into database joins.
const preserveReadStrategy = ({ args, query }: any) =>
  query({ ...args, relationLoadStrategy: args.relationLoadStrategy ?? "query" });

const databaseUrl = process.env.DATABASE_URL;
const databaseOptions = databaseUrl ? new URL(databaseUrl) : undefined;
const configuredLimit = Number(databaseOptions?.searchParams.get("connection_limit") || 10);
const poolLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 10;
const createClient = () => new PrismaClient({adapter: new PrismaPg({connectionString: databaseUrl, max: poolLimit, connectionTimeoutMillis: 5000}, {schema: databaseOptions?.searchParams.get("schema") || "public"})}).$extends({
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
