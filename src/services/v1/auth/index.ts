import {
  UserStatus,
  User as PrismaUser,
  SubStatusEnum,
  Country,
  Prisma,
} from "@prisma/client";
import prisma from "@/db";
import { getRandomNumber } from "@/utils";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { LookupResult } from "ip-location-api";
import { composeAuthUser, getUserStatusMessage } from "../utils";
import logger from "@/logger";
import {enqueueEmailMessage} from '@/services/email';
import {disconnectAuthSession} from "@/utils/auth-session-sockets";
import { OAuth2Client } from "google-auth-library";
import { getAuthUser } from "../utils";
import {logServiceError} from '@/logger/events';
const googleVerifier = new OAuth2Client();

export const createUser = async (
  body: {
    name: string;
    email: string;
    password?: string;
    refId?: string | null;
  },
  location?: Partial<LookupResult> | null,
  googleIdentity?: { subject: string; avatar?: string }
) => {
  try {
    let welcomeMessageId: string | undefined;
    const dbUser = await prisma.user.findFirst({
      where: { email: { mode: "insensitive", equals: body.email } },
    });
    if (dbUser) return { status: 422, data: "User with email already exists" };
    // create new user

    if (!googleIdentity && !body.password) return {status: 400, data: "Password required"};
    const hash = googleIdentity ? null : await bcrypt.hash(body.password!, 10);

    let userCountry: Country | null = null;

    const inferredCountry = location?.country?.trim();
    const inferredCountryName = location?.country_name?.trim();
    if (inferredCountry || inferredCountryName) {
      const identifiers = [...new Set([inferredCountry, inferredCountryName].filter((value): value is string => !!value))];
      userCountry = await prisma.country.findFirst({
        where: {OR: identifiers.flatMap(value => [
          {iso2: {mode: "insensitive" as const, equals: value}},
          {iso3: {mode: "insensitive" as const, equals: value}},
          {name: {mode: "insensitive" as const, equals: value}},
        ])},
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
      const welcome = await tx.emailMessage.create({data: {eventKey: `welcome:${created.id}`, userId: created.id}});
      welcomeMessageId = welcome.id;
      return created;
    });

    logger.info({event:'account_registered',userId:newUser.id,emailMessageId:welcomeMessageId,provider:googleIdentity?'GOOGLE':'PASSWORD'},'New account and welcome email outbox committed');
    if(welcomeMessageId) {
      try {await enqueueEmailMessage(welcomeMessageId);}
      catch(err) {logger.error({event:'welcome_email_enqueue_deferred',userId:newUser.id,emailMessageId:welcomeMessageId,err},'Welcome email remains in outbox; recovery will enqueue it');}
    }

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
    logServiceError("v1/auth/index", "createUser", error);

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
    logServiceError("v1/auth/index", "loginUser", error);


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
    logServiceError("v1/auth/index", "handleReferral", error);


    return "Sorry an error ocurred, try again";
  }
};



// Verify signed Google claims before resolving the stable provider identity.
export async function loginGoogleUser(idToken: string, registrationLocation?: Partial<LookupResult> | null) {
  const audience = process.env.AUTH_GOOGLE_ID;
  if (!audience) return {status: 503, data: "Google sign-in is not configured"};
  let claims;
  try {
    const ticket = await googleVerifier.verifyIdToken({idToken, audience});
    claims = ticket.getPayload();
  } catch (serviceError) {
    logServiceError("v1/auth/index", "loginGoogleUser", serviceError);
 return {status: 401, data: "Invalid Google sign-in token"}; }
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
        const created = await createUser({email, name: claims.name || email.split("@")[0]}, registrationLocation ?? null, {subject: claims.sub, avatar: claims.picture});
        // Concurrent callbacks must not create duplicate wallets/registration bonuses.
        account = await prisma.user.findUnique({where: {googleSubject: claims.sub}});
        if (!account) return created;
      }
    }
    if (![UserStatus.ACTIVE, UserStatus.PRIVATE].some(status => status === account!.status) || account.deletedAt || account.deactivatedAt) return {status: 401, data: "Account unavailable"};
    return getAuthUser(account.id, {includeEmail: true});
  } catch (serviceError) {
    logServiceError("v1/auth/index", "loginGoogleUser", serviceError);
 return {status: 500, data: "Unable to sign in with Google. Please try again"}; }
}


// Authentication identity fields remain in User for backward compatibility.
export async function startAuthSession(userId: string, provider: import('@prisma/client').AuthProvider, metadata: Awaited<ReturnType<typeof import('@/utils/auth-security').authRequestMetadata>>, kind = 'SIGN_IN', id = randomUUID()) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86400000);
  const retainUntil = new Date(now.getTime() + 90 * 86400000);
  return prisma.$transaction(async tx => {
    let identityId: string | undefined;
    if (provider !== 'LEGACY') {
      const user = await tx.user.findUniqueOrThrow({where: {id: userId}, select: {googleSubject: true}});
      const providerAccountId = provider === 'GOOGLE' ? user.googleSubject : userId;
      if (!providerAccountId) throw new Error('Authentication identity unavailable');
      const identity = await tx.authIdentity.upsert({where: {userId_provider: {userId, provider}},
        create: {userId, provider, providerAccountId, lastUsedAt: now}, update: {lastUsedAt: now}});
      if (identity.providerAccountId !== providerAccountId) throw new Error('Authentication identity mismatch');
      identityId = identity.id;
    }
    const {location, ...fields} = metadata;
    const safeMetadata = {...fields, location: location ?? Prisma.DbNull};
    const session = await tx.userSession.create({data: {id, userId, identityId, provider, ...safeMetadata, expiresAt, retainUntil}});
    await tx.loginEvent.create({data: {userId, sessionId: session.id, provider, kind, ...safeMetadata, retainUntil}});
    return session.id;
  });
}
export async function validateAuthSession(user: {id: string; sessionId?: string}) {
  // Pre-migration signed API tokens retain their existing expiry; their next refresh
  // upgrades them to a LEGACY-attributed, revocable session without inventing a provider.
  if (!user.sessionId) {
    const account = await prisma.user.findUnique({where: {id: user.id}, select: {passwordChangedAt: true}});
    return !!account && !account.passwordChangedAt;
  }
  const session = await prisma.userSession.findFirst({where: {id: user.sessionId, userId: user.id, revokedAt: null, expiresAt: {gt: new Date()}, user: {status: {in: ['ACTIVE', 'PRIVATE']}, deletedAt: null, deactivatedAt: null}}, select: {id: true}});
  return !!session;
}
export async function touchAuthSession(user: {id: string; sessionId?: string}) {
  if (!user.sessionId) return;
  const now = new Date();
  await prisma.userSession.updateMany({where: {id: user.sessionId, userId: user.id, revokedAt: null, expiresAt: {gt: now}, lastActiveAt: {lt: new Date(now.getTime() - 60_000)}}, data: {lastActiveAt: now}});
}
export async function listAuthSessions(userId: string, currentId?: string, page = 1) {
  const where = {userId, revokedAt: null, expiresAt: {gt: new Date()}};
  const [sessions, count] = await prisma.$transaction([
    prisma.userSession.findMany({where, orderBy: [{lastActiveAt: 'desc'}, {id: 'desc'}], take: 21, skip: (page - 1) * 21,
      select: {id: true, provider: true, device: true, location: true, ipAddress: true, metadataSource: true, createdAt: true, lastActiveAt: true, expiresAt: true}}),
    prisma.userSession.count({where}),
  ]);
  return {sessions: sessions.map(session => ({...session, current: session.id === currentId})), page, hasMore: page * 21 < count};
}
export async function listLoginEvents(userId: string, page = 1) {
  const [events, count] = await prisma.$transaction([
    prisma.loginEvent.findMany({where: {userId, retainUntil: {gt: new Date()}}, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], take: 21, skip: (page - 1) * 21,
      select: {id: true, provider: true, kind: true, device: true, location: true, ipAddress: true, metadataSource: true, createdAt: true}}),
    prisma.loginEvent.count({where: {userId, retainUntil: {gt: new Date()}}}),
  ]);
  return {events, page, hasMore: page * 21 < count};
}
export async function revokeAuthSession(userId: string, sessionId: string, reason = 'USER_REVOKED') {
  const result = await prisma.userSession.updateMany({where: {id: sessionId, userId, revokedAt: null}, data: {revokedAt: new Date(), revokedReason: reason}});
  if (result.count) disconnectAuthSession(sessionId);
  return result.count > 0;
}
export async function cleanupAuthHistory() {
  const now = new Date();
  const events = await prisma.loginEvent.deleteMany({where: {retainUntil: {lt: now}}});
  const sessions = await prisma.userSession.deleteMany({where: {retainUntil: {lt: now}, OR: [{revokedAt: {not: null}}, {expiresAt: {lt: now}}]}});
  return {events: events.count, sessions: sessions.count};
}


export async function sessionProvider(userId: string, id: string) {
  const session = await prisma.userSession.findFirst({where: {id, userId, revokedAt: null, expiresAt: {gt: new Date()}}, select: {provider: true}});
  if (!session) throw new Error('Session revoked or expired');
  return session.provider;
}

export async function getAccountSettings(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({where: {id: userId}, select: {username: true, password: true}});
  return {username: user.username, hasPassword: !!user.password};
}
export async function updateAccountPassword(userId: string, sessionId: string | undefined, input: {currentPassword?: string; newPassword: string}) {
  const user = await prisma.user.findUnique({where: {id: userId}, select: {password: true, googleSubject: true}});
  if (!user) return {status: 404, data: 'Account not found'};
  if (user.password) {
    if (!input.currentPassword || !await bcrypt.compare(input.currentPassword, user.password)) return {status: 403, data: 'Current password is incorrect'};
    if (await bcrypt.compare(input.newPassword, user.password)) return {status: 400, data: 'Choose a different password'};
  } else {
    const recent = sessionId && user.googleSubject && await prisma.userSession.findFirst({where: {id: sessionId, userId, provider: 'GOOGLE', revokedAt: null, expiresAt: {gt: new Date()}, createdAt: {gte: new Date(Date.now() - 5 * 60_000)}, events: {some: {provider: 'GOOGLE', kind: 'SIGN_IN'}}}, select: {id: true}});
    if (!recent) return {status: 403, data: 'Sign in with Google again before setting your first password'};
  }
  const password = await bcrypt.hash(input.newPassword, 10);
  const revoked = await prisma.$transaction(async tx => {
    // Serialize credential changes and reject a stale concurrent password check.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({where: {id: userId}, select: {password: true}});
    if (current.password !== user.password) return null;
    await tx.user.update({where: {id: userId}, data: {password, passwordChangedAt: new Date()}});
    await tx.pushNotification.deleteMany({where: {userId, sessionId: null}});
    await tx.authIdentity.upsert({where: {userId_provider: {userId, provider: 'PASSWORD'}}, create: {userId, provider: 'PASSWORD', providerAccountId: userId}, update: {}});
    const sessions = await tx.userSession.findMany({where: {userId, revokedAt: null, ...(sessionId ? {id: {not: sessionId}} : {})}, select: {id: true}});
    await tx.userSession.updateMany({where: {id: {in: sessions.map(session => session.id)}}, data: {revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGED'}});
    return sessions;
  });
  if (!revoked) return {status: 409, data: 'Password changed during this request. Please try again'};
  for (const session of revoked) disconnectAuthSession(session.id);
  return {status: 200, data: {updated: true, reloginRequired: !sessionId}};
}
