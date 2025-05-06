import prisma from "@/db";
import { AuthUser } from "@/types";

export const subscribePushNotification = async (body: any, user: AuthUser) => {
  try {
    const result = await prisma.pushNotification.create({
      data: { config: body, userId: user.id },
    });
    return { data: result, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};
