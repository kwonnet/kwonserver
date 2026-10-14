import { cachedCatalogRead } from "@/store";
import prisma from "@/db";
import { logServiceError } from '@/logger/events';

export const getTipPackages = async () => {
  const mediaBase = (process.env.CLOUDFLARE_PUBLIC_MEDIA_URL || "https://media.kwonnet.com").replace(/\/+$/, "");
  return cachedCatalogRead(`gift-packages:media-v1:${mediaBase}`, 60_000, async () => {
    try {
      const packages = await prisma.tipPackage.findMany({
        where: { isActive: true, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
        orderBy: [{ price: 'asc' }, { name: 'asc' }],
      });
      return { data: packages.map(gift => gift.thumbnail?.startsWith("/static/tips/")
        ? {...gift, thumbnail: `${mediaBase}${gift.thumbnail}`}
        : gift), status: 200 };
    } catch (error) {
      logServiceError("v1/tips/index", "getTipPackages", error);
      return { data: "Error: Failed to fetch packages", status: 500 };
    }
  });
};
