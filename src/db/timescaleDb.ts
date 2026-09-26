import { PrismaClient } from "@prisma/client";
import { Sequelize } from "sequelize"

export const prismaAnalytics = new PrismaClient({
    datasources: {
      db: {url: process.env.DATABASE_URL_TIMESCALE}
    },
  });

export const sequelizeAnalytics = new Sequelize(process.env.DATABASE_URL_TIMESCALE!) // Example for postgres
