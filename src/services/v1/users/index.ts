import {
  UserStatus,
  User as PrismaUser,
  GameAchievement,
  Prisma,
  NotifTypeEnum,
  SubStatusEnum,
  FollowAction,
  BlockAction,
  MuteAction,
} from "@prisma/client";
import { AuthUser, RewardQuery, User } from "@/types";
import prisma from "@/db";
import { composePublicUser } from "../utils";
import { ConnTypeEnum, UserConnection, UserMiniProfile } from "@/types/user";
import { ReportSchema } from "@/schema";
import { DetectResult } from "node-device-detector";
import { LookupResult } from "ip-location-api";

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

export const handleReferral = async (
  telRef: { referrerId: string; refereeId: string },
  dbRefereeId: string
) => {
  try {
    console.log(
      "handleReferral",
      telRef,
      "referrerId",
      "db refereeId",
      dbRefereeId
    );
    // Check if the user has a record in the Referral model
    const [referee, userReferrer] = await prisma.$transaction([
      prisma.referral.findFirst({
        where: { referee: { telId: telRef.refereeId } },
      }),
      prisma.user.findFirst({
        where: { telId: telRef.referrerId },
      }),
    ]);
    // check if the person has been referred already
    if (referee || !userReferrer) return null;
    // create referral object
    const rewardAmount = 50;
    const result = await prisma.referral.create({
      data: {
        referrerId: userReferrer?.id,
        refereeId: dbRefereeId,
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
    const { id, ...rest } = user;
    const dbUser = await prisma.user.findFirst({
      where: { telId: user.telId },
    });
    if (!dbUser) {
      console.log("Currently About to create new user ", user);
      console.log("Ref User ", referrerId);
      const newUser = await prisma.user.create({
        data: { ...rest, email: `${user.telId}@me.com` },
      });
      if (referrerId && referrerId !== user.telId) {
        // the new user is the referee
        // handleReferral({referrerId, refereeId: newUser.telId}, newUser.id)
      }
      return { data: { ...rest, id: newUser.id }, status: 200 };
    }
    if (dbUser.status !== UserStatus.ACTIVE) {
      return { data: getMessage(dbUser), status: 401 };
    }
    return { data: { ...rest, id: dbUser.id }, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const searchUser = async (query: string) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: { endsWith: query, mode: "insensitive" } },
          { username: { equals: query, mode: "insensitive" } },
          { email: { equals: query, mode: "insensitive" } },
        ],
      },
    });
    if (!user) {
      return { data: "User not found", status: 404 };
    }
    if (user.status !== UserStatus.ACTIVE) {
      return { data: getMessage(user), status: 400 };
    }
    return {
      data: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        name: user.name,
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const searchUsers = async ({
  query,
  limit,
  page,
}: {
  query: string;
  limit: number;
  page: number;
}) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { search: query, mode: "insensitive" } },
          { name: { search: query, mode: "insensitive" } },
        ],
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    if (users.length === 0) {
      return { data: "Not found", status: 404 };
    }
    return {
      data: users.map((user) => ({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        name: user.name,
      })),
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserAchievements = async (query: RewardQuery) => {
  try {
    const { catId, userId, year, page, limit } = query;

    const skip = (page - 1) * limit;

    const whereClause: Prisma.GameAchievementWhereInput = {
      AND: [
        { playerId: userId }, // Always include `userId` since it's required
        ...(catId ? [{ catId }] : []), // Add `catId` condition only if it's not null
        ...(year
          ? [
              {
                createdAt: {
                  gte: new Date(`${year}-01-01T00:00:00.000Z`),
                  lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
                },
              },
            ]
          : []), // Add `year` condition only if it's not null
      ],
    };

    const result = await prisma.gameAchievement.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
    });
    if (result.length === 0) {
      return { data: "Not found", status: 404 };
    }
    return { data: result, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserStats = async (id: string) => {
  try {
    const [
      totalInvites,
      earned,
      totalAwards,
      totalTxns,
      totalTaskNotDone,
      totalTaskDone,
    ] = await prisma.$transaction([
      // get total referral
      prisma.referral.count({ where: { referrerId: id } }),
      // get total referral reward amount
      prisma.referral.aggregate({
        _sum: { rewardAmount: true },
        where: { referrerId: id },
      }),
      // get total game achievements
      prisma.gameAchievement.count({ where: { playerId: id } }),
      // get total txns
      prisma.transaction.count({ where: { userId: id } }),
      // get total unperformed tasks
      prisma.task.count({
        where: {
          performedBy: {
            none: {
              userId: id,
            },
          },
        },
      }),
      // get total performed tasks
      prisma.userTask.count({ where: { userId: id } }),
    ]);

    return {
      data: {
        totalAwards,
        totalTxns,
        totalInvites,
        totalEarned: earned._sum.rewardAmount ?? 0,
        totalTaskNotDone,
        totalTaskDone,
      },
      status: 200,
    };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserActiveSubscription = async (userId: string) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId, isPrimary: true },
      include: {
        plan: {
          select: {
            accountType: true,
            id: true,
            createdAt: true,
            features: true,
            discount: true,
            name: true,
            price: true,
            tier: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!sub) {
      return { data: "Not found", status: 404 };
    }
    return { data: sub, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserTaskSettings = async (userId: string) => {
  try {
    const settings = await prisma.userTaskSettings.findFirst({
      where: { userId },
    });
    if (!settings) {
      return { data: "Not found", status: 404 };
    }
    return { data: settings, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const followUser = async (
  { recipientId, senderId }: { senderId: string; recipientId: string },
  user: AuthUser
) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      // check user already followed and unfollow else follow
      const result = await tx.follow.findFirst({
        where: { followerId: senderId, followingId: recipientId },
      });
      if (result) {
        await tx.follow.delete({ where: { id: result.id } });
        // insert history
        await prisma.followHistory.create({
          data: {
            followerId: senderId,
            followingId: recipientId,
            action: FollowAction.UNFOLLOW,
          },
        });
        return { ...result, isFollow: false };
      }
      // insert follow
      const result2 = await tx.follow.create({
        data: { followerId: senderId, followingId: recipientId },
      });
      // insert history
      await prisma.followHistory.create({
        data: {
          followerId: senderId,
          followingId: recipientId,
          action: FollowAction.FOLLOW,
        },
      });
      // check if there is similar notif
      const check = await tx.notification.findFirst({
        where: {
          senderId,
          recipientId,
          type: NotifTypeEnum.USER,
        },
      });
      if (!check) {
        // insert notification
        await tx.notification.create({
          data: {
            senderId,
            recipientId,
            type: NotifTypeEnum.USER,
            message: `${user.name} followed you`,
            title: "New user follow",
          },
        });
      }

      return { ...result2, isFollow: true };
    });
    return { data: data, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const blockUser = async (blockedId: string, user: AuthUser) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      // check user already blocked else block
      const result = await tx.blockUser.findFirst({
        where: { blockerId: user.id, blockedId },
      });
      if (result) {
        await tx.blockUser.delete({ where: { id: result.id } });
        // insert history
        await prisma.blockHistory.create({
          data: {
            blockerId: user.id,
            blockedId,
            action: BlockAction.UNBLOCK,
          },
        });
        return { ...result, isBlocked: false };
      }
      // insert blocK
      const result2 = await tx.blockUser.create({
        data: { blockerId: user.id, blockedId },
      });
      // insert history
      await prisma.blockHistory.create({
        data: {
          blockerId: user.id,
          blockedId,
          action: BlockAction.BLOCK,
        },
      });
      // check if current user follows the blocked and unfollow
      const result3 = await tx.follow.findFirst({
        where: { followerId: user.id, followingId: blockedId },
      });
      if (result3) {
        await tx.follow.delete({ where: { id: result3.id } });
        // insert history
        await prisma.followHistory.create({
          data: {
            followerId: user.id,
            followingId: blockedId,
            action: FollowAction.UNFOLLOW,
          },
        });
      }
      return { ...result2, isBlocked: true };
    });
    return { data: data, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const muteUser = async (mutedId: string, user: AuthUser) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      // check user already muted and else mute
      const result = await tx.muteUser.findFirst({
        where: { muterId: user.id, mutedId },
      });
      if (result) {
        await tx.muteUser.delete({ where: { id: result.id } });
        // insert history
        await prisma.muteHistory.create({
          data: {
            muterId: user.id,
            mutedId,
            action: MuteAction.UNMUTE,
          },
        });
        return { ...result, isMuted: false };
      }
      // insert mute
      const result2 = await tx.muteUser.create({
        data: { muterId: user.id, mutedId },
      });
      // insert history
      await prisma.muteHistory.create({
        data: {
          muterId: user.id,
          mutedId,
          action: MuteAction.MUTE,
        },
      });

      return { ...result2, isMuted: true };
    });
    return { data: data, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};


export const reportUser = async(body: ReportSchema,
  user: AuthUser,) => {
  try {
    const report = await prisma.userReport.findFirst({where: { reportedId: body.id, reporterId: user.id}, orderBy: [{ createdAt: "desc" }]})
    // check if the user has already reported the post with 24 hours
    if(report && new Date(report.createdAt).getTime() > new Date(Date.now() - 1000 * 60 * 60 * 24).getTime()){
      return { data: "You have already reported this user, wait till after 24hrs to report again", status: 400}
    }
    // check if the user exists
    const reported = await prisma.user.findUniqueOrThrow({where: { id: body.id}})
    // report the post
    await prisma.userReport.create({
      data: {
        reportedId: body.id,
        reporterId: user.id,
        reason: body.code,
        meta: body.meta,
        message: body.message,
      }
    })
    return { data: { id: reported.id, userId: user.id }, status: 200}
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500}
  }
}

export const profileVisit = async (args: { device: DetectResult, meta: LookupResult | null, userId: string, sessionId: string; postId?: string; referer?: string | null }, user: AuthUser) => {
  try {
    await prisma.$transaction(async (tx) => {
      // check user already muted and else mute
      const result = await tx.profileVisit.findFirst({
        where: { userId: args.userId, visitorId: user.id },
      });
      // create visit data
      await tx.profileVisit.create({
        data: {
          ...args,
          visitorId: user.id,
        },
      });
      // check if already exists or create new notification
      if (!result) {
        // may be send notification?
        await tx.notification.create({
          data: {
            senderId: user.id,
            recipientId: args.userId,
            type: NotifTypeEnum.USER,
            message: `${user.name} visited your profile`,
            title: "New profile visit",
          },
        });
      }
    });
    return { data: args, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const logUserLocation = async (
  userId: string,
  args: { latitude: number; longitude: number }
) => {
  try {
    const result = await prisma.userLocation.upsert({
      where: { userId: userId },
      update: args,
      create: {
        userId: userId,
        ...args,
      },
    });
    return { data: result, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getConnections = async (
  userId: string,
  args: { limit: number; page: number; type?: string }
) => {
  console.log(args);
  try {
    if (args.type === ConnTypeEnum.POPULAR_CREATORS) {
      return await getPopularCreatorsSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.MUTUAL_FOLLOWS) {
      return await getMutualFollowsSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.INTEREST) {
      return await getEngagementAndInterestSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.NEAR_YOU) {
      return await getNearYouSuggestions(userId, args.limit);
    }

    return getSuggestedConnections(userId, args.limit);
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getSuggestedConnections = async (
  userId: string,
  limit: number
) => {
  try {
    const result = await prisma.$queryRaw<any[]>`
    WITH user_following AS (
      SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId}
    ),
  
    base_verified AS (
      SELECT u.id, u.name, u.username, u.avatar, u.meta, u."accountVerified",
             'VERIFIED' AS "connectionType"
      FROM "User" u
      WHERE u."accountVerified" = true
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
      LIMIT 50
    ),
  
    base_new_users AS (
      SELECT u.id, u.name, u.username, u.avatar, u.meta, u."accountVerified",
             'NEW_USER' AS "connectionType"
      FROM "User" u
      WHERE u."createdAt" > NOW() - INTERVAL '3 days'
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
      LIMIT 50
    ),
  
    base_trending AS (
      SELECT u.id, u.name, u.username, u.avatar, u.meta, u."accountVerified",
             'TRENDING' AS "connectionType"
      FROM "User" u
      JOIN "Post" p ON p."userId" = u.id
      WHERE p."createdAt" > NOW() - INTERVAL '7 days'
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
      GROUP BY u.id
      ORDER BY COUNT(p.id) DESC
      LIMIT 50
    ),
  
    combined AS (
      SELECT * FROM base_verified
      UNION ALL
      SELECT * FROM base_new_users
      UNION ALL
      SELECT * FROM base_trending
    )
  
    SELECT DISTINCT ON (u.id)
      u.id, u.name, u.username, u.avatar, u.meta, u."accountVerified", u."connectionType",
  
      -- Subscription info
      COALESCE((
        SELECT jsonb_agg(to_jsonb(s))
        FROM "Subscription" s
        WHERE s."userId" = u.id
          AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
      ), '[]'::jsonb) AS subscriptions,
  
      -- Whether the suggested user follows the current user
      COALESCE((
        SELECT jsonb_agg(to_jsonb(f))
        FROM "Follow" f
        WHERE f."followerId" = u.id
          AND f."followingId" = ${userId}
      ), '[]'::jsonb) AS following
  
    FROM combined u
    ORDER BY u.id, RANDOM()
    LIMIT ${limit};
  `;
    const suggestions: UserConnection[] = result.map((user) => {
      const _user = composePublicUser(user);
      return {
        ..._user,
        hasFollowed: false,
        followBack: user.following.length > 0,
        followerCount: 0,
        followingCount: 0,
      };
    });
    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get mutual follows and friends of friends
 * @param userId string
 * @param limit number
 * @param offset  number
 * @returns UserConnection[]
 */
export async function getMutualFollowsSuggestions(
  userId: string,
  limit = 20,
  offset = 0
) {
  try {
    const result: any[] = await prisma.$queryRaw`
    WITH user_following AS (
      SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId}
    ),
  
    mutual_follows AS (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'MUTUAL_FOLLOWS' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "Follow" f ON u.id = f."followingId"
      WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)  -- 🔥 This line added
    ),
  
    second_degree AS (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'SECOND_DEGREE' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "Follow" f ON u.id = f."followingId"
      WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
        AND u.id != ${userId}
    )
  
    SELECT DISTINCT ON (id) * FROM (
      SELECT * FROM mutual_follows
      UNION ALL
      SELECT * FROM second_degree
    ) AS combined
    LIMIT ${limit};
  `;

    const suggestions: UserConnection[] = result.map((user) => {
      const _user = composePublicUser(user);
      return {
        ..._user,
        hasFollowed: false,
        followBack: user.following.length > 0,
        followerCount: 0,
        followingCount: 0,
      };
    });

    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error: any) {
    console.log(error?.message);
    throw error;
  }
}
/**
 * Retrieve popular creators
 * @param userId string
 * @param limit number
 * @param offset number
 * @returns UserConnection[]
 */
export async function getPopularCreatorsSuggestions(
  userId: string,
  limit = 20,
  offset = 0
) {
  try {
    const result: any[] = await prisma.$queryRaw`
    SELECT 
      u.id,
      u.name,
      u.username,
      u.avatar,
      u.meta,
      u."accountVerified",
      COUNT(f."followerId")::INT AS "followerCount",
  
      -- All subscription fields as JSON array
      COALESCE(
        json_agg(
          DISTINCT to_jsonb(s)
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS subscriptions,
  
      -- Check if these creators are following the current user (for "follow back" UI)
      COALESCE(
        json_agg(
          DISTINCT to_jsonb(f2)
        ) FILTER (WHERE f2.id IS NOT NULL), '[]'
      ) AS following
  
    FROM "User" u
    LEFT JOIN "Follow" f ON u.id = f."followingId"
  
    -- Subscriptions info
    LEFT JOIN "Subscription" s ON s."userId" = u.id
      AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
  
    -- f2: if this user follows back the current user
    LEFT JOIN "Follow" f2 ON f2."followerId" = u.id AND f2."followingId" = ${userId}
  
    -- Exclude current user
    WHERE u.id != ${userId}
  
      -- Exclude users the current user is already following
      AND u.id NOT IN (
        SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId}
      )
  
    GROUP BY u.id
    ORDER BY "followerCount" DESC
    LIMIT ${limit};
  `;

    const suggestions: UserConnection[] = result.map((user) => {
      const _user = composePublicUser(user);
      return {
        ..._user,
        hasFollowed: false,
        followBack: user.following.length > 0,
        followerCount: 0,
        followingCount: 0,
      };
    });
    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error: any) {
    throw error;
  }
}
/**
 * Retrieves suggested users based engaged posts and hash tags
 * @param userId string
 * @param limit number
 * @returns UserConnection[]
 */
export async function getEngagementAndInterestSuggestions(
  userId: string,
  limit = 20
) {
  try {
    const result = await prisma.$queryRaw<any[]>`
    WITH user_following AS (
      SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId}
    ),
  
    engagements AS (
      SELECT DISTINCT "postId" FROM "LikedPost" WHERE "userId" = ${userId}
      UNION
      SELECT DISTINCT "postId" FROM "Bookmark" WHERE "userId" = ${userId}
      UNION
      SELECT DISTINCT id as "postId" FROM "Post" WHERE "userId" = ${userId} AND kind = 'REPLY'
    ),
  
    engagement_overlap AS (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'ENGAGEMENT_OVERLAP' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "LikedPost" lp ON lp."userId" = u.id
      WHERE lp."postId" IN (SELECT "postId" FROM engagements)
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
  
      UNION
  
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'ENGAGEMENT_OVERLAP' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "Bookmark" b ON b."userId" = u.id
      WHERE b."postId" IN (SELECT "postId" FROM engagements)
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
  
      UNION
  
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'ENGAGEMENT_OVERLAP' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "Post" p ON p."userId" = u.id AND p.kind = 'REPLY'
      WHERE p.id IN (SELECT "postId" FROM engagements)
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
    ),
  
    interest_based AS (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'INTEREST' AS "connectionType",
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,
  
        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following
  
      FROM "User" u
      JOIN "Post" p ON p."userId" = u.id
      JOIN "PostHashTag" ph ON ph."postId" = p.id
      WHERE ph."tagId" IN (
        SELECT DISTINCT ph2."tagId"
        FROM engagements e
        JOIN "PostHashTag" ph2 ON ph2."postId" = e."postId"
      )
        AND u.id != ${userId}
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
    )
  
    SELECT DISTINCT ON (id) * FROM (
      SELECT * FROM engagement_overlap
      UNION ALL
      SELECT * FROM interest_based
    ) AS combined
    LIMIT ${limit};
  `;

    const suggestions: UserConnection[] = result.map((user) => {
      const _user = composePublicUser(user);
      return {
        ..._user,
        hasFollowed: false,
        followBack: user.following.length > 0,
        followerCount: Number(user.followerCount),
        followingCount: 0,
      };
    });
    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error: any) {
    throw error;
  }
}

export async function getNearYouSuggestions(
  userId: string,
  limit = 20,
  radiusInKm = 50
) {
  try {
    const result: any[] = await prisma.$queryRaw<any[]>`
    WITH user_following AS (
      SELECT "followingId" FROM "Follow" WHERE "followerId" = ${userId}
    ),

    current_user_location AS (
      SELECT latitude, longitude FROM "UserLocation" WHERE "userId" = ${userId}
    ),

    near_users AS (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u."accountVerified",
        'NEAR_YOU' AS "connectionType",

        -- Compute distance in km using Haversine
        (
          6371 * acos(
            cos(radians(cul.latitude)) * cos(radians(ul2.latitude)) *
            cos(radians(ul2.longitude) - radians(cul.longitude)) +
            sin(radians(cul.latitude)) * sin(radians(ul2.latitude))
          )
        ) AS distance_km,

        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(s))
            FROM "Subscription" s
            WHERE s."userId" = u.id
              AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
          ), '[]'::jsonb
        ) AS subscriptions,

        COALESCE(
          (
            SELECT jsonb_agg(to_jsonb(f2))
            FROM "Follow" f2
            WHERE f2."followerId" = u.id
              AND f2."followingId" = ${userId}
          ), '[]'::jsonb
        ) AS following

      FROM "User" u
      JOIN "UserLocation" ul2 ON ul2."userId" = u.id
      CROSS JOIN current_user_location cul
      WHERE u.id != ${userId}
        AND u."status" = 'ACTIVE'
        -- AND u."isVerified" = true
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
        AND ul2.latitude IS NOT NULL
        AND ul2.longitude IS NOT NULL
    )

    SELECT * FROM near_users
    ORDER BY distance_km ASC
    LIMIT ${limit};
  `;
    const suggestions: UserConnection[] = result.map((user) => {
      const _user = composePublicUser(user);
      return {
        ..._user,
        hasFollowed: false,
        followBack: user.following.length > 0,
        followerCount: 0,
        followingCount: 0,
      };
    });
    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Get targeted user mini profile including current user top followings following the targeted user
 * @param identifier string  - username or ID
 * @param currentUserId string - userId
 * @returns object
 */
export async function getUserProfileOverview(
  identifier: string,
  currentUserId: string
) {
  try {
    // Get the target user
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { username: identifier }],
      },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatar: true,
        meta: true,
        role: true,
        userType: true,
        accountVerified: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
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
    if (!user) return { data: "not found", status: 200 };
    // Find the current user's followings who are also following the target user
    const result =
      identifier === currentUserId
        ? { count: 0, followers: [] }
        : await getMutualFollowings(identifier, currentUserId);
    // compose result
    const data: UserMiniProfile = {
      ...composePublicUser(user),
      followerCount: user._count.followers,
      followingCount: user._count.following,
      mutualCount: result.count,
      followers: result.followers.map((f) => ({
        ...composePublicUser(f),
        followerCount: f._count.followers,
        followingCount: f._count.following,
      })),
    };
    return { data, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
}

export const getMutualFollowings = async (
  identifier: string,
  currentUserId: string,
  limit = 5
) => {
  try {
    const [followers, count] = await prisma.$transaction([
      prisma.user.findMany({
        where: {
          // You follow them
          followers: {
            some: {
              followerId: currentUserId, // <- YOU are the follower
            },
          },
          // And they follow the target user
          following: {
            some: {
              followingId: identifier,
            },
          },
        },
        select: {
          id: true,
          username: true,
          name: true,
          avatar: true,
          bio: true,
          meta: true,
          role: true,
          userType: true,
          accountVerified: true,
          _count: {
            select: {
              followers: true,
              following: true,
            },
          },
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
        orderBy: [{ followers: { _count: "desc" } }],
        take: limit,
      }),
      prisma.user.count({
        where: {
          // You follow them
          followers: {
            some: {
              followerId: currentUserId, // <- YOU are the follower
            },
          },
          // And they follow the target user
          following: {
            some: {
              followingId: identifier,
            },
          },
        },
      }),
    ]);

    return { followers, count };
  } catch (error) {
    throw error;
  }
};
