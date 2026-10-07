import { cachedCatalogRead } from "@/store";
import prisma from "@/db"
import {logServiceError} from '@/logger/events';

export const getContinentsAndCountries = async() => {
    return cachedCatalogRead("locations", 3600000, async () => {
    try {
          const result = await prisma.continent.findMany({ include: { countries: true}})
          if(result.length === 0) {
              return { data: "Not found", status: 404 }
          }
          return { data: result, status: 200 }
      } catch (error) {
    logServiceError("v1/locations/index", "getContinentsAndCountries", error);

          return { data: "Sorry an error occurred trying to get data", status: 500 }
      }
  });
}