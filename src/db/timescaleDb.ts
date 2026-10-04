// Backwards-compatible alias: analytics is maintained in the application's
// PostgreSQL database. Do not create unused Prisma/Sequelize connection pools.
import prisma from "@/db";
export const prismaAnalytics = prisma;
