import { mongodbUri } from "@/config";
import logger from "@/logger";
import mongoose from "mongoose";


export async function startMongodb() {
  try {
    await mongoose.connect(mongodbUri, {   });
    logger.info(`Mongodb connected successfully`)
  } catch (error: any) {
    logger.error(`Error: Mongodb connection failed - ${error?.message}`)
  }
}