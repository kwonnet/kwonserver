import prisma from "@/db";


export const getTipPackages = async () => {
  try {
    const packages = await prisma.tipPackage.findMany();
    return {
      data: packages,
      status: 200,
    };
  } catch (error) {
    return { data: "Error: Failed to fetch packages", status: 500 };
  }
};
