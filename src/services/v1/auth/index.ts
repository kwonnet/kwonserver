import {
  UserStatus,
  User as PrismaUser,
  SubStatusEnum,
  Country,
} from "@prisma/client";
import prisma from "@/db";
import { getRandomNumber } from "@/utils";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { LookupResult } from "ip-location-api";
import { composeAuthUser, getUserStatusMessage } from "../utils";
import logger from "@/logger";

export const createUser = async (
  body: {
    name: string;
    email: string;
    password: string;
    refId?: string | null;
  },
  location?: LookupResult | null
) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: { email: { mode: "insensitive", equals: body.email } },
    });
    if (dbUser) return { status: 422, data: "User with email already exists" };
    // create new user

    const hash = await bcrypt.hash(body.password, 10);

    let userCountry: Country | null = null;

    if (location && location?.country) {
      userCountry = await prisma.country.findFirst({
        where: {
          OR: [
            { iso2: { mode: "insensitive", equals: location?.country } },
            { iso3: { mode: "insensitive", equals: location?.country } },
            { name: { mode: "insensitive", equals: location?.country } },
          ],
        },
      });
    }
    // check if user name is already taken
    let username = body.email.split("@")[0]
    const checkUsername = await prisma.user.findFirst({
      where: { username: { mode: "insensitive", equals: username } },
    });
    if(checkUsername){
      username = `${username}${randomUUID().slice(-5)}`
    }
    const amount = getRandomNumber(10, 15, true);
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        username,
        password: hash,
        wallet: { create: { bonus: amount } },
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

    if (body.refId && !newUser.id.endsWith(body.refId)) {
      // the new user is the referee
      handleReferral({ referrerId: body.refId, refereeId: newUser.id });
    }
    const user = composeAuthUser(newUser, true)
    
    return {
      data: user,
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const loginUser = async (body: { email: string; password: string }) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: body.email, mode: "insensitive" } },
          { username: { equals: body.email, mode: "insensitive" } },
        ],
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
    // console.log("dbUser ", dbUser)
    // check user
    if (!dbUser || !dbUser.password){
      return { data: "Wrong auth credentials provided", status: 401 };
    }
    // check password
    const isMatch = await bcrypt.compare(body.password, dbUser.password);
    // console.log("isMatch ", isMatch)
    if (!isMatch){
      return { data: "Wrong auth credentials provided", status: 401 };
    }
    // check account status
    const statuses = [UserStatus.BANNED, UserStatus.SUSPENDED] as string[]
    if (statuses.includes(dbUser.status)) {
      return { data: getUserStatusMessage(dbUser, true), status: 401 };
    }
    // compose user
    const user = composeAuthUser(dbUser, true)

    return {
      data: user,
      status: 200,
    };
  } catch (error: any) {
    console.log(error?.message)
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const handleReferral = async (params: {
  referrerId: string;
  refereeId: string;
}) => {
  try {
    // console.log("handle referral params", params);
    // Check if the user has a record in the Referral model
    const [referee, referrer] = await prisma.$transaction([
      prisma.referral.findFirst({
        where: { referee: { id: params.refereeId } },
      }),
      prisma.user.findFirst({
        where: { id: { endsWith: params.referrerId } },
        include: {
          _count: {
            select: {
              likedPosts: true,
              posts: true,
            },
          },
        },
      }),
    ]);
    // check if the person has been referred already
    if (referee || !referrer){
      return referee ? "User is already referred" : "Referrer not found";
    }
    // check if account is active
    const statuses = [UserStatus.BANNED, UserStatus.SUSPENDED] as string[]
    if (statuses.includes(referrer.status)){
      return getUserStatusMessage(referrer);
    }
    // check if the referrer account is old enough for instant reward(at least 10 days old)
    const time = new Date(referrer.createdAt).getTime();
    const seconds = Math.round(time / 1000);
    const isOldEnough = seconds >= 10 * 24 * 60 * 60; // at least 10 days old
    logger.info(
      { isOldEnough, ...referrer._count },
      "Check account reward status"
    );
    // check for instant reward
    const isInstantReward =
      isOldEnough ||
      referrer._count.likedPosts >= 5 ||
      referrer._count.posts >= 5;
    // calc reward amount
    const amount = getRandomNumber(10, 15, true);
    logger.info({ isInstantReward, amount }, "Check account instant reward");
    // reward user if account is qualified for instant reward
    if (isInstantReward) {
      const [result] = await prisma.$transaction([
        prisma.referral.create({
          data: {
            referrerId: referrer?.id,
            refereeId: params?.refereeId,
            amount,
            isRewarded: true,
          },
        }),
        prisma.wallet.update({
          where: { userId: referrer.id },
          data: { bonus: { increment: amount } },
        }),
      ]);
      logger.info(result, `${referrer.name} is rewarded ${amount}`);
      return result;
    } else {
      const result = await prisma.referral.create({
        data: {
          referrerId: referrer?.id,
          refereeId: params?.refereeId,
          amount,
        },
      });
      logger.info(result, `Referrer reward is deffered`);
      return result;
    }
  } catch (error: any) {
    logger.error(`Referrer reward error - ${error?.message}`);
    return "Sorry an error ocurred, try again";
  }
};


