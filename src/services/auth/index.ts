import { UserStatus, User as PrismaUser, UserTypeEnum } from "@prisma/client";
import { User, UserMetaInfo } from "@/types";
import prisma from "@/db";
import { getRandomNumber } from "@/utils";

const getMessage = (user: PrismaUser) => {
  const arr = user.metadata[user.metadata.length - 1] as {
    reason: string;
    createdAt: string;
  };

  if (user.status === UserStatus.SUSPENDED) {
    // show possible number of days
    return `Your account has been temporarily suspended for ${arr.reason}`;
  }
  return `Your account has been banned for ${arr.reason}`;
};

export const handleReferral = async (telRef: {
  referrerId: string;
  refereeId: string;
}) => {
  try {
    console.log("handleReferral", telRef, "referrerId");
    // Check if the user has a record in the Referral model
    const [referee, userReferrer] = await prisma.$transaction([
      prisma.referral.findFirst({
        where: { referee: { id: telRef.refereeId } },
      }),
      prisma.user.findFirst({
        where: { id: { endsWith: telRef.referrerId } },
      }),
    ]);
    // check if the person has been referred already
    if (referee || !userReferrer) return null;
    // create referral object
    const rewardAmount = getRandomNumber(20, 50, true);
    const result = await prisma.referral.create({
      data: {
        referrerId: userReferrer?.id,
        refereeId: telRef.refereeId,
        rewardAmount,
      },
    });
    console.log("Created referral ", result);
    return result;
  } catch (error: any) {
    console.log("referral error ", error?.message);
    return null;
  }
};

export const createOrLoginUser = async (user: User, referrerId?: string) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: { telId: user.telId },
      include: {
        subscriptions: {
          where: { status: "ACTIVE" },
        },
      },
    });
    if (!dbUser) {
      const { id, ...rest } = user;
      console.log("Currently About to create new user ", user);
      console.log("Ref User ", referrerId);
      const newUser = await prisma.user.create({
        data: {
          ...rest,
          email: `${user.telId}@me.com`,
          wallet: { create: { bonus: 100 } },
        },
        include: { subscriptions: { where: { status: "ACTIVE" } } },
      });

      if (referrerId && !newUser.id.endsWith(referrerId)) {
        // the new user is the referee
        handleReferral({ referrerId, refereeId: newUser.id });
      }
      const {
        username,
        avatar,
        userType,
        meta,
        accountVerified,
        role,
        name,
        subscriptions,
        email,
        telId
      } = newUser;
      const subscription = subscriptions[0];
      return {
        data: {
          id: newUser.id,
          avatar,
          username,
          role,
          name,
          userType,
          email,
          telId,
          meta: {
            ...meta,
            isPro: !!subscription,
            isLegacy: accountVerified,
            isActive: meta?.status === "ACTIVE",
          },
        },
        status: 200,
      };
      // return { data: { ...rest, userType: newUser.userType, role: newUser.role, id: newUser.id }, status: 200 };
    }
    if (dbUser.status !== UserStatus.ACTIVE) {
      return { data: getMessage(dbUser), status: 401 };
    }
    // destructure user
    const {
      id,
      username,
      avatar,
      userType,
      meta,
      accountVerified,
      role,
      name,
      subscriptions,
      email,
      telId
    } = dbUser;
    const subscription = subscriptions[0];
    return {
      data: {
        id,
        avatar,
        username,
        role,
        name,
        userType,
        email,
        telId,
        meta: {
          ...meta,
          isPro: !!subscription,
          isLegacy: accountVerified,
          isActive: meta?.status === "ACTIVE",
        },
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getAuthUser = async (userId: string) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { status: "ACTIVE" },
        },
      },
    });
    if (!user) return { data: "User not found", status: 403 };
    if (user.status !== UserStatus.ACTIVE) {
      return { data: getMessage(user), status: 401 };
    }
    // destructure user
    const {
      id,
      username,
      avatar,
      userType,
      meta,
      accountVerified,
      role,
      name,
      subscriptions,
      email,
      telId
    } = user;
    const subscription = subscriptions[0];
    return {
      data: {
        id,
        avatar,
        username,
        role,
        name,
        userType,
        email,
        telId,
        meta: {
          ...meta,
          isPro: !!subscription,
          isLegacy: accountVerified,
          isActive: meta?.status === "ACTIVE",
        },
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};
