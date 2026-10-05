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
import { OAuth2Client } from "google-auth-library";
import { getAuthUser } from "../utils";
const googleVerifier = new OAuth2Client();

export const createUser = async (
  body: {
    name: string;
    email: string;
    password?: string;
    refId?: string | null;
  },
  location?: LookupResult | null,
  googleIdentity?: { subject: string; avatar?: string }
) => {
  try {
    const dbUser = await prisma.user.findFirst({
      where: { email: { mode: "insensitive", equals: body.email } },
    });
    if (dbUser) return { status: 422, data: "User with email already exists" };
    // create new user

    if (!googleIdentity && !body.password) return {status: 400, data: "Password required"};
    const hash = googleIdentity ? null : await bcrypt.hash(body.password!, 10);

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
    const newUser = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          username,
          password: hash,
          ...(googleIdentity && { googleSubject: googleIdentity.subject, avatar: googleIdentity.avatar, isVerified: true }),
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
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: created.id } });
      await tx.transaction.create({ data: {
        userId: created.id, recipientId: created.id, walletId: wallet.id, amount,
        currency: 'COINS', source: 'BONUS', gateway: 'VIRTUAL', type: 'CREDIT', status: 'COMPLETED',
        category: 'COIN_RECEIVED', txnRef: randomUUID(), description: 'Registration bonus',
        metadata: { reason: 'REGISTRATION', bonus: amount },
      } });
      return created;
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
    const seconds = (Date.now() - time) / 1000;
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
      const result = await prisma.$transaction(async tx => {
        const referral = await tx.referral.create({ data: {
          referrerId: referrer.id, refereeId: params.refereeId, amount, isRewarded: true,
        } });
        const wallet = await tx.wallet.update({ where: { userId: referrer.id }, data: { bonus: { increment: amount } } });
        await tx.transaction.create({ data: {
          userId: referrer.id, recipientId: referrer.id, walletId: wallet.id, amount,
          currency: 'COINS', source: 'BONUS', gateway: 'VIRTUAL', type: 'CREDIT', status: 'COMPLETED',
          category: 'COIN_RECEIVED', txnRef: randomUUID(), description: 'Referral bonus',
          metadata: { referralId: referral.id, refereeId: params.refereeId },
        } });
        return referral;
      });
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



// Verify signed Google claims before resolving the stable provider identity.
export async function loginGoogleUser(idToken: string) {
  const audience = process.env.AUTH_GOOGLE_ID;
  if (!audience) return {status: 503, data: "Google sign-in is not configured"};
  let claims;
  try {
    const ticket = await googleVerifier.verifyIdToken({idToken, audience});
    claims = ticket.getPayload();
  } catch { return {status: 401, data: "Invalid Google sign-in token"}; }
  if (!claims?.sub || !claims.email || claims.email_verified !== true) {
    return {status: 401, data: "Google email verification is required"};
  }
  const email = claims.email.toLowerCase();
  try {
    let account = await prisma.user.findUnique({where: {googleSubject: claims.sub}});
    if (!account) {
      account = await prisma.user.findFirst({where: {email: {equals: email, mode: "insensitive"}}});
      if (account) {
        // Google is authoritative for Gmail/Workspace addresses. A third-party
        // email claim alone must never take over an existing password account.
        if (!email.endsWith("@gmail.com") && !claims.hd) {
          return {status: 409, data: "Please sign in to the existing account with its password"};
        }
        if (account.googleSubject && account.googleSubject !== claims.sub) {
          return {status: 409, data: "This account is linked to another Google identity"};
        }
        if (![UserStatus.ACTIVE, UserStatus.PRIVATE].some(status => status === account!.status) || account.deletedAt || account.deactivatedAt) return {status: 401, data: "Account unavailable"};
        if (!account.googleSubject) {
          const linked = await prisma.user.updateMany({where: {id: account.id, googleSubject: null}, data: {googleSubject: claims.sub, isVerified: true}});
          if (linked.count !== 1) {
            account = await prisma.user.findUnique({where: {googleSubject: claims.sub}});
            if (!account) return {status: 409, data: "Unable to link this Google identity"};
          }
        }
      } else {
        const created = await createUser({email, name: claims.name || email.split("@")[0]}, null, {subject: claims.sub, avatar: claims.picture});
        // Concurrent callbacks must not create duplicate wallets/registration bonuses.
        account = await prisma.user.findUnique({where: {googleSubject: claims.sub}});
        if (!account) return created;
      }
    }
    if (![UserStatus.ACTIVE, UserStatus.PRIVATE].some(status => status === account!.status) || account.deletedAt || account.deactivatedAt) return {status: 401, data: "Account unavailable"};
    return getAuthUser(account.id, {includeEmail: true});
  } catch { return {status: 500, data: "Unable to sign in with Google. Please try again"}; }
}
