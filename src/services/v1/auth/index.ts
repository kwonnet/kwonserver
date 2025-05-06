import {
  UserStatus,
  User as PrismaUser,
  SubStatusEnum,
  Country,
} from "@prisma/client";
import { User } from "@/types";
import prisma from "@/db";
import { getRandomNumber } from "@/utils";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { LookupResult } from "ip-location-api";


export const createUser = async (
  body: {
    name: string;
    email: string;
    password: string;
    referrerId?: string | null;
  },
  location?: LookupResult | null
) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: { email: { mode: "insensitive", equals: body.email} },
    });
    if (dbUser) return { status: 422, data: "User already exists" };
    // create new user

    const hash = await bcrypt.hash(body.password, 10);

    let userCountry: Country | null = null;

    if (location && location?.country) {
      userCountry = await prisma.country.findFirst({
        where: {
          OR: [
            { iso2: { mode: "insensitive", equals: location?.country} },
            { iso3: { mode: "insensitive", equals: location?.country} },
            { name: { mode: "insensitive", equals: location?.country} },
          ],
          
        },
        
      });
    }

    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        username: `${body.email.split("@")[0]}${randomUUID().slice(-9)}`,
        password: hash,
        wallet: { create: { bonus: 100 } },
        location: {
          create: {
            latitude: location?.latitude ?? 0,
            longitude: location?.longitude ?? 0,
            meta: location,
          },
        },
        ...(userCountry && { country: { connect: { id: userCountry?.id } } }),
      },
      include: {
        subscriptions: {
          where: {
            status: {
              in: [
                SubStatusEnum.ACTIVE,
                SubStatusEnum.TRIAL,
                SubStatusEnum.PAYMENT_ERROR,
              ],
            },
          },
        },
        country: {
          select: {
            id: true,
            name: true,
            iso2: true,
            iso3: true,
            emoji: true,
            continentId: true,
          },
        },
      },
    });

    if (body.referrerId && !newUser.id.endsWith(body.referrerId)) {
      // the new user is the referee
      handleReferral({ referrerId: body.referrerId, refereeId: newUser.id });
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
      telId,
      country,
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
        country,
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

export const loginUser = async (body: { email: string; password: string }) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: { OR: [{ email: { equals: body.email, mode: "insensitive"} }, { username: { equals: body.email, mode: "insensitive"} }] },
      include: {
        subscriptions: {
          where: { status: "ACTIVE" },
        },
        country: {
          select: {
            id: true,
            name: true,
            iso2: true,
            iso3: true,
            emoji: true,
            continentId: true,
          },
        },
      },
    });
    console.log("dbUser ", dbUser)
    // check user
    if (!dbUser || !dbUser.password)
      return { data: "Wrong auth credentials provided", status: 401 };
    // check password
    const isMatch = await bcrypt.compare(body.password, dbUser.password);
    console.log("isMatch ", isMatch)
    if (!isMatch)
      return { data: "Wrong auth credentials provided", status: 401 };
    // check user status
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
      telId,
      country,
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
        country,
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

const getMessage = (user: PrismaUser) => {
  const arr = user.metadata[user.metadata.length - 1] as {
    reason: string;
    createdAt: string;
  };

  if (user.status === UserStatus.SUSPENDED) {
    // show possible number of days
    return `Your account has been temporarily suspended ${
      arr?.reason ? " for " + arr?.reason : ""
    }`;
  }
  return `Your account has been banned ${
    arr?.reason ? " for " + arr?.reason : ""
  }`;
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
        country: {
          select: {
            id: true,
            name: true,
            iso2: true,
            iso3: true,
            emoji: true,
            continentId: true,
          },
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
        include: {
          subscriptions: {
            where: {
              status: {
                in: [
                  SubStatusEnum.ACTIVE,
                  SubStatusEnum.TRIAL,
                  SubStatusEnum.PAYMENT_ERROR,
                ],
              },
            },
          },
          country: {
            select: {
              id: true,
              name: true,
              iso2: true,
              iso3: true,
              emoji: true,
              continentId: true,
            },
          },
        },
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
        telId,
        country,
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
          country,
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
      telId,
      country,
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
        country,
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
          where: {
            status: {
              in: [
                SubStatusEnum.ACTIVE,
                SubStatusEnum.TRIAL,
                SubStatusEnum.PAYMENT_ERROR,
              ],
            },
          },
        },
        country: {
          select: {
            id: true,
            name: true,
            iso2: true,
            iso3: true,
            emoji: true,
            continentId: true,
          },
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
      telId,
      country,
    } = user;
    const subscription = subscriptions[0];
    const statuses = [
      SubStatusEnum.ACTIVE,
      SubStatusEnum.TRIAL,
      SubStatusEnum.PAYMENT_ERROR,
    ] as string[];
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
        country,
        meta: {
          ...meta,
          isPro: !!subscription,
          isLegacy: accountVerified,
          isActive: statuses.includes(String(meta?.status)),
        },
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};
