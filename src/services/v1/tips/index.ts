import prisma from "@/db";
import {logServiceError} from '@/logger/events';


export const getTipPackages = async () => {
  try {
    const packages = await prisma.tipPackage.findMany();
    return {
      data: packages,
      status: 200,
    };
  } catch (error) {
    logServiceError("v1/tips/index", "getTipPackages", error);

    return { data: "Error: Failed to fetch packages", status: 500 };
  }
};
