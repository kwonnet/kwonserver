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
  FollowStatus,
  PostStatus,
  PostKindEnum,
  UserRoleEnum,
} from "@prisma/client";
import { RewardQuery, User, UserFollowAction } from "@/types";
import prisma from "@/db";
import {
  analyticsPercentageChange,
  composeAuthUser,
  composeUserConnection,
  getAnalyticsDuration,
  getUserStatusMessage,
  transformPost,
  transformPrismaTagMentions,
} from "../utils";
import {
  SessionUser,
  ConnTypeEnum,
  UserPublic,
  UserProfileOverview,
  AuthUser,
} from "@/types/user";
import { ReportSchema } from "@/schema";
import { DetectResult } from "node-device-detector";
import { LookupResult } from "ip-location-api";
import { MessageModel } from "@/db/models";

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
      return { data: getUserStatusMessage(user), status: 400 };
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

export const getUserNotifications = async (
  user: SessionUser,
  { limit, page }: { limit: number; page: number }
) => {
  try {
    const result = await prisma.notification.findMany({
      where: {
        recipientId: user.id,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        post: {
          where: {
            status: PostStatus.PUBLISHED,
          },
          select: {
            id: true,
            content: true,
            kind: true,
            media: true,
            type: true,
            user: {
              select: {
                id: true,
                avatar: true,
                username: true,
                name: true,
              },
            },
            parent: {
              select: {
                id: true,
                content: true,
                kind: true,
                media: true,
                type: true,
                user: {
                  select: {
                    id: true,
                    avatar: true,
                    username: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (result.length === 0) {
      return { data: "Not found", status: 404 };
    }
    return {
      data: result,
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
      totalUnreadCount,
      totalUnseenCount,
    ] = await prisma.$transaction([
      // get total referral
      prisma.referral.count({ where: { referrerId: id } }),
      // get total referral reward amount
      prisma.referral.aggregate({
        _sum: { amount: true },
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

      // get total unread notifications
      prisma.notification.count({ where: { recipientId: id, isRead: false } }),
      prisma.notification.count({ where: { recipientId: id, isSeen: false } }),
    ]);

    // get message count from
    const result: { totalUnreadMsg: number; totalUnseenMsg: number }[] =
      await MessageModel.aggregate([
        {
          $match: {
            $or: [
              { "read.userId": { $ne: id } },
              { "seen.userId": { $ne: id } },
            ],
            toUserId: id,
          },
        },
        {
          $group: {
            _id: null,
            totalUnreadMsg: {
              $sum: {
                $cond: [{ $not: { $in: [id, "$read.userId"] } }, 1, 0],
              },
            },
            totalUnseenMsg: {
              $sum: {
                $cond: [{ $not: { $in: [id, "$seen.userId"] } }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalUnreadMsg: 1,
            totalUnseenMsg: 1,
          },
        },
      ]);

    // console.log("unread message count ", result)

    return {
      data: {
        totalAwards,
        totalTxns,
        totalInvites,
        totalEarned: earned._sum.amount ?? 0,
        totalTaskNotDone,
        totalTaskDone,
        totalUnreadCount,
        totalUnseenCount,
        ...result[0],
      },
      status: 200,
    };
  } catch (error) {
    console.log(error);
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const updateUserNotifications = async (args: {
  recipientId: string;
  isSeen?: boolean;
  isRead?: boolean;
}) => {
  try {
    await prisma.notification.updateMany({
      where: { recipientId: args.recipientId },
      data: { ...args },
    });
    return { data: null, status: 200 };
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
  params: { senderId: string; recipientId: string; action: UserFollowAction },
  user: SessionUser
) => {
  const { recipientId, senderId, action } = params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // get recipient details
      const recipient = await tx.user.findUniqueOrThrow({
        where: { id: recipientId },
      });
      const isPrivate = recipient.status === UserStatus.PRIVATE;
      const statuses = [UserStatus.ACTIVE, UserStatus.PRIVATE] as string[];

      let status: FollowStatus = FollowStatus.REJECTED;

      if (UserFollowAction.FOLLOW && !statuses.includes(recipient?.status)) {
        throw new Error(getUserStatusMessage(recipient));
      }
      if (
        action === UserFollowAction.CANCEL ||
        action === UserFollowAction.UNFOLLOW
      ) {
        await tx.follow.delete({
          where: {
            followerId_followingId: {
              followerId: senderId,
              followingId: recipientId,
            },
          },
        });
        if (UserFollowAction.UNFOLLOW) {
          // insert unfollow history
          await prisma.followHistory.create({
            data: {
              followerId: senderId,
              followingId: recipientId,
              action: FollowAction.UNFOLLOW,
            },
          });
        }
      } else if (action === UserFollowAction.REJECT) {
        await tx.follow.delete({
          where: {
            followerId_followingId: {
              followerId: recipientId,
              followingId: senderId,
            },
          },
        });
      } else if (action === UserFollowAction.ACCEPT) {
        await tx.follow.update({
          where: {
            followerId_followingId: {
              followerId: recipientId,
              followingId: senderId,
            },
          },
          data: { status: FollowStatus.ACCEPTED },
        });
        status = FollowStatus.ACCEPTED;
      } else {
        (status = isPrivate ? FollowStatus.PENDING : FollowStatus.ACCEPTED),
          // insert follow
          await tx.follow.create({
            data: {
              followerId: senderId,
              followingId: recipientId,
              status,
            },
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
              message: isPrivate
                ? `${user.name} rquested to connect with you`
                : `${user.name} followed you`,
              title: isPrivate ? `New connection request` : "New user follow",
            },
          });
        }
      }

      return { status };

      // return { ...result2, isFollow: isPrivate };
    });
    return { data: { ...result, ...params }, status: 200 };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const blockUser = async (blockedId: string, user: SessionUser) => {
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

export const muteUser = async (mutedId: string, user: SessionUser) => {
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

export const reportUser = async (body: ReportSchema, user: SessionUser) => {
  try {
    const report = await prisma.userReport.findFirst({
      where: { reportedId: body.id, reporterId: user.id },
      orderBy: [{ createdAt: "desc" }],
    });
    // check if the user has already reported the post with 24 hours
    if (
      report &&
      new Date(report.createdAt).getTime() >
        new Date(Date.now() - 1000 * 60 * 60 * 24).getTime()
    ) {
      return {
        data: "You have already reported this user, wait till after 24hrs to report again",
        status: 400,
      };
    }
    // check if the user exists
    const reported = await prisma.user.findUniqueOrThrow({
      where: { id: body.id },
    });
    // report the post
    await prisma.userReport.create({
      data: {
        reportedId: body.id,
        reporterId: user.id,
        reason: body.code,
        meta: body.meta,
        message: body.message,
      },
    });
    return { data: { id: reported.id, userId: user.id }, status: 200 };
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export const updateAccountStatus = async (
  body: { userId: string; status: UserStatus },
  user: SessionUser
) => {
  try {
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: body.userId },
    });

    const isOwner = body.userId === user.id;

    const adminEnabledStatuses = [
      UserStatus.BANNED,
      UserStatus.SUSPENDED,
    ] as string[];

    if (
      isOwner &&
      user.role === UserRoleEnum.USER &&
      adminEnabledStatuses.includes(account?.status)
    ) {
      return {
        data: "You're not authorised to perform this action, please contact support",
        status: 403,
      };
    }

    await prisma.user.update({
      where: { id: body.userId },
      data: {
        status: body.status,
      },
    });

    return { data: body, status: 200 };
  } catch (error) {
    return { data: "Error ocurred, please try again", status: 500 };
  }
};

export const profileVisit = async (
  args: {
    device: DetectResult;
    meta: LookupResult | null;
    userId: string;
    sessionId: string;
    postId?: string;
    referer?: string | null;
  },
  user: SessionUser
) => {
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
            message: `${user.name} viewed your profile`,
            title: "New profile view",
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
  try {
    if (args.type === ConnTypeEnum.POPULAR_CREATORS) {
      return await getPopularCreatorsSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.MUTUAL_FOLLOWS) {
      return await getMutualFollowsSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.NEAR_YOU) {
      return await getNearYouSuggestions(userId, args.limit);
    }
    if (args.type === ConnTypeEnum.INTEREST) {
      return await getEngagementAndInterestSuggestions(userId, args.limit);
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
    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      WITH user_following AS (
        SELECT "followingId" FROM "Follow" WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS targetId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      base_verified AS (
        SELECT u.*, 'VERIFIED' AS "connectionType"
        FROM "User" u
        WHERE u."accountVerified" = true
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
        LIMIT 50
      ),

      base_new_users AS (
        SELECT u.*, 'NEW_USER' AS "connectionType"
        FROM "User" u
        WHERE u."createdAt" > NOW() - INTERVAL '3 days'
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
        LIMIT 50
      ),

      base_trending AS (
        SELECT u.*, 'TRENDING' AS "connectionType"
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        WHERE p."createdAt" > NOW() - INTERVAL '7 days'
          AND u.id != $1
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
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.bio,
        u.email,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u."connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.targetId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.targetId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM combined u
      ORDER BY u.id, RANDOM()
      LIMIT $2;
    `,
      userId,
      limit
    );

    const suggestions: UserPublic[] = result.map((user) =>
      composeUserConnection(user)
    );
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
 * @returns UserPublic[]
 */
export async function getMutualFollowsSuggestions(
  userId: string,
  limit = 20,
  offset = 0
) {
  try {
    const result: any[] = await prisma.$queryRawUnsafe(
      `
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS targetId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      combined_suggestions AS (
        SELECT u.*, 'MUTUAL_FOLLOWS' AS "connectionType"
        FROM "User" u
        JOIN "Follow" f ON u.id = f."followingId"
        WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)

        UNION ALL

        SELECT u.*, 'SECOND_DEGREE' AS "connectionType"
        FROM "User" u
        JOIN "Follow" f ON u.id = f."followingId"
        WHERE f."followerId" IN (SELECT "followingId" FROM user_following)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
      )

      SELECT DISTINCT ON (u.id)
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.email,
        u.bio,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u."connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.targetId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.targetId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM combined_suggestions u
      ORDER BY u.id, u."connectionType"  -- Ensures consistent prioritization
      LIMIT $2;
      `,
      userId,
      limit
    );

    const suggestions: UserPublic[] = result.map((user) =>
      composeUserConnection(user)
    );

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
 * Retrieve popular creators
 * @param userId string
 * @param limit number
 * @param offset number
 * @returns UserPublic[]
 */
export async function getPopularCreatorsSuggestions(
  userId: string,
  limit = 20,
  offset = 0
) {
  try {
    const result: any[] = await prisma.$queryRawUnsafe(
      `
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS creatorId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      )

      SELECT 
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.email,
        u.bio,
        u.meta,
        u.status,
        u.metadata,
        u.role,
        u."userType",
        u."createdAt",
        u."accountVerified" AS "isVerified",

        COUNT(f."followerId")::INT AS "followerCount",

        (
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        )::INT AS "followingCount",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        (
          SELECT COUNT(*) FROM mutuals m
          WHERE m.creatorId = u.id
        )::INT AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              )::INT,
              'followingCount', (
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              )::INT
            )
          ) ORDER BY mu."accountVerified" DESC,
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.creatorId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM "User" u
      LEFT JOIN "Follow" f ON u.id = f."followingId"
      WHERE u.id != $1
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
      GROUP BY u.id
      ORDER BY "followerCount" DESC
      LIMIT $2;
    `,
      userId,
      limit
    );

    const suggestions: UserPublic[] = result.map((user) =>
      composeUserConnection(user)
    );
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
 * @returns UserPublic[]
 */
export async function getEngagementAndInterestSuggestions(
  userId: string,
  limit = 20
) {
  try {
    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      WITH user_following AS (
        SELECT "followingId" FROM "Follow"
        WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      engagements AS (
        SELECT DISTINCT "postId" FROM "LikedPost" WHERE "userId" = $1
        UNION
        SELECT DISTINCT "postId" FROM "Bookmark" WHERE "userId" = $1
        UNION
        SELECT DISTINCT id AS "postId" FROM "Post" WHERE "userId" = $1 AND kind = 'REPLY'
      ),

      mutuals AS (
        SELECT DISTINCT f1."followingId" AS suggestedUserId, f1."followerId" AS mutualId
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followerId" = f2."followerId"
        WHERE f1."followingId" != f2."followingId"
          AND f1.status = 'ACCEPTED'
          AND f2.status = 'ACCEPTED'
          AND f2."followingId" = $1
      ),

      all_suggestions AS (
        SELECT DISTINCT u.*
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        WHERE p.id IN (SELECT "postId" FROM engagements)
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)

        UNION

        SELECT DISTINCT u.*
        FROM "User" u
        JOIN "Post" p ON p."userId" = u.id
        JOIN "PostHashTag" ph ON ph."postId" = p.id
        WHERE ph."tagId" IN (
          SELECT DISTINCT ph2."tagId"
          FROM engagements e
          JOIN "PostHashTag" ph2 ON ph2."postId" = e."postId"
        )
          AND u.id != $1
          AND u.id NOT IN (SELECT "followingId" FROM user_following)
      )

      SELECT
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.bio,
        u.email,
        u.meta,
        u.status,
        u.role,
        u."userType",
        u.metadata,
        u."createdAt",
        u."accountVerified" AS "isVerified",
        'SUGGESTED' AS "connectionType",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followerCount",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followingCount",

        CAST((
          SELECT COUNT(*) FROM mutuals m
          WHERE m.suggestedUserId = u.id
        ) AS INTEGER) AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mu.id,
            'name', mu.name,
            'avatar', mu.avatar,
            'username', mu.username,
            'conn', jsonb_build_object(
              'followerCount', CAST((
                SELECT COUNT(*) FROM "Follow"
                WHERE "followingId" = mu.id AND status = 'ACCEPTED'
              ) AS INTEGER),
              'followingCount', CAST((
                SELECT COUNT(*) FROM "Follow"
                WHERE "followerId" = mu.id AND status = 'ACCEPTED'
              ) AS INTEGER)
            )
          ) ORDER BY mu."accountVerified" DESC, 
                    (SELECT COUNT(*) FROM "Follow" WHERE "followingId" = mu.id AND status = 'ACCEPTED') DESC)
          FROM mutuals m
          JOIN "User" mu ON mu.id = m.mutualId
          WHERE m.suggestedUserId = u.id
          LIMIT 5
        ), '[]'::jsonb) AS "mutualFollowers",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country

      FROM all_suggestions u
      LIMIT $2;
    `,
      userId,
      limit
    );

    console.log(result[1]);

    const suggestions: UserPublic[] = result.map((user) =>
      composeUserConnection(user)
    );
    const notFound = suggestions.length === 0;
    return {
      data: notFound ? "not found" : suggestions,
      status: notFound ? 404 : 200,
    };
  } catch (error: any) {
    console.log(error);
    throw error;
  }
}

export async function getNearYouSuggestions(
  userId: string,
  limit = 20,
  radiusInKm = 50
) {
  try {
    const result: any[] = await prisma.$queryRawUnsafe<any[]>(
      `
      WITH user_following AS (
        SELECT "followingId" FROM "Follow" WHERE "followerId" = $1 AND status = 'ACCEPTED'
      ),

      current_user_location AS (
        SELECT latitude, longitude FROM "UserLocation" WHERE "userId" = $1
      ),

      mutuals AS (
        SELECT
          f1."followingId" AS "mutualId",
          f2."followingId" AS "suggestedUserId"
        FROM "Follow" f1
        JOIN "Follow" f2 ON f1."followingId" = f2."followingId"
        WHERE f1."followerId" = $1 AND f2."followerId" != $1
          AND f1.status = 'ACCEPTED' AND f2.status = 'ACCEPTED'
      )

      SELECT
        u.id,
        u.name,
        u.username,
        u.avatar,
        u.meta,
        u.status,
        u.metadata,
        u."createdAt",
        u."accountVerified" AS "isVerified",
        u.role,
        u."userType",
        u.bio,
        u.email,
        'NEAR_YOU' AS "connectionType",

        (
          6371 * acos(
            cos(radians(cul.latitude)) * cos(radians(ul2.latitude)) *
            cos(radians(ul2.longitude) - radians(cul.longitude)) +
            sin(radians(cul.latitude)) * sin(radians(ul2.latitude))
          )
        ) AS distance_km,

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = u.id AND f."followingId" = $1
          LIMIT 1
        ) AS "followingStatus",

        (
          SELECT f.status FROM "Follow" f
          WHERE f."followerId" = $1 AND f."followingId" = u.id
          LIMIT 1
        ) AS "followerStatus",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = u.id AND "followingId" = $1
        ) AS "isFollowingUser",

        EXISTS (
          SELECT 1 FROM "Follow"
          WHERE "followerId" = $1 AND "followingId" = u.id
        ) AS "isFollowedByUser",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followingId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followerCount",

        CAST((
          SELECT COUNT(*) FROM "Follow"
          WHERE "followerId" = u.id AND status = 'ACCEPTED'
        ) AS INTEGER) AS "followingCount",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(s))
          FROM "Subscription" s
          WHERE s."userId" = u.id
            AND s.status IN ('ACTIVE', 'TRIAL', 'PAYMENT_ERROR')
        ), '[]'::jsonb) AS subscriptions,

        (
          SELECT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'iso2', c.iso2,
            'iso3', c.iso3,
            'emoji', c.emoji,
            'continentId', c."continentId"
          )
          FROM "Country" c
          WHERE c.id = u."countryId"
        ) AS country,

        CAST((
          SELECT COUNT(*) FROM mutuals
          WHERE mutuals."suggestedUserId" = u.id
        ) AS INTEGER) AS "mutualCount",

        COALESCE((
          SELECT jsonb_agg(to_jsonb(sub) ORDER BY sub."isVerified" DESC, sub."conn"->>'followerCount' DESC)
          FROM (
            SELECT
              mu.id,
              mu.username,
              mu.name,
              mu.avatar,
              mu."accountVerified" AS "isVerified",
              jsonb_build_object(
                'followerCount', CAST((
                  SELECT COUNT(*) FROM "Follow"
                  WHERE "followingId" = mu.id AND status = 'ACCEPTED'
                ) AS INTEGER),
                'followingCount', CAST((
                  SELECT COUNT(*) FROM "Follow"
                  WHERE "followerId" = mu.id AND status = 'ACCEPTED'
                ) AS INTEGER)
              ) AS conn
            FROM mutuals m
            JOIN "User" mu ON mu.id = m."mutualId"
            WHERE m."suggestedUserId" = u.id
            LIMIT 5
          ) sub
        ), '[]'::jsonb) AS "mutualFollowers"

      FROM "User" u
      JOIN "UserLocation" ul2 ON ul2."userId" = u.id
      CROSS JOIN current_user_location cul
      WHERE u.id != $1
        AND u."status" = 'ACTIVE'
        AND u.id NOT IN (SELECT "followingId" FROM user_following)
        AND ul2.latitude IS NOT NULL
        AND ul2.longitude IS NOT NULL

      ORDER BY distance_km ASC
      LIMIT $2;
    `,
      userId,
      limit
    );

    const suggestions: UserPublic[] = result.map((user) =>
      composeUserConnection(user)
    );
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
 * @param targetUserId string  - username or ID
 * @param currentUserId string - userId
 * @returns object
 */
export async function getUserProfileOverview(
  targetUserId: string,
  currentUserId: string
) {
  try {
    // Get the target user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: { equals: targetUserId, mode: "insensitive" } },
          { username: { equals: targetUserId, mode: "insensitive" } },
        ],
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
        createdAt: true,
        metadata: true,
        status: true,
        _count: {
          select: {
            followers: {
              where: { status: FollowStatus.ACCEPTED },
            },
            following: {
              where: { status: FollowStatus.ACCEPTED },
            },
            bookmarks: true,
            highlightPosts: true,
            likedPosts: true,
            posts: {
              where: {
                OR: [
                  { status: PostStatus.PUBLISHED },
                  { status: PostStatus.SCHEDULED },
                ],
              },
            },
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
        // 1. is this target user following current user?
        following: {
          where: { followingId: currentUserId },
          select: { id: true, status: true },
        },
        // 2. is current user following the target user?
        followers: {
          where: { followerId: currentUserId },
          select: { id: true, status: true },
        },
        // 1. if this target user blocked the current user
        blockedUsers: {
          where: { blockedId: currentUserId },
        },
        // 2. if current user blocked the target user
        blockedBy: {
          where: { blockerId: currentUserId },
        },
        // 1. if this target user blocked the current user
        mutedUsers: {
          where: { mutedId: currentUserId },
        },
        // 2. if current user blocked the target user
        mutedBy: {
          where: { muterId: currentUserId },
        },
      },
    });
    if (!user) return { data: "User account not found", status: 404 };
    // Find the current user's followings who are also following the target user
    const result =
      user.id === currentUserId
        ? { count: 0, followers: [] }
        : await getMutualFollowings(user.id, currentUserId);

    // get post stats
    // console.log("Profile details post targetUserId ", targetUserId)
    // console.log("Profile details post currentUserId ", currentUserId)
    const [totalReplies, totalMediaPosts, totalScheduled] = await Promise.all([
      prisma.post.count({
        where: {
          userId: user.id,
          status: PostStatus.PUBLISHED,
          kind: PostKindEnum.REPLY,
        },
      }),
      prisma.post.count({
        where: {
          userId: user.id,
          status: PostStatus.PUBLISHED,
          media: { some: {} },
        },
      }),
      prisma.post.count({
        where: {
          userId: user.id,
          status: PostStatus.SCHEDULED,
        },
      }),
    ]);
    // compose result
    const data: UserProfileOverview = {
      ...composeAuthUser(user),
      stats: {
        totalReplies,
        totalMediaPosts,
        totalScheduled,
        totalPosts: user._count.posts,
        totalBookmarks: user._count.bookmarks,
        totalHighlights: user._count.highlightPosts,
        totalLikes: user._count.likedPosts,
      },
      actions: {
        hasBlockedUser: user.blockedUsers.length > 0,
        isBlockedByUser: user.blockedBy.length > 0,
        hasMutedUser: user.mutedUsers.length > 0,
        isMutedByUser: user.mutedBy.length > 0,
      },
      conn: {
        followerCount: user._count.followers,
        followingCount: user._count.following,
        mutualCount: result.count,
        isFollowingUser: user.following.length > 0,
        isFollowedByUser: user.followers.length > 0,
        followingStatus: user?.following[0]?.status,
        followedStatus: user?.followers[0]?.status,
      },
      mutualFollowers: result.followers.map((f) => ({
        ...composeAuthUser(f),
        conn: {
          followerCount: f._count.followers,
          followingCount: f._count.following,
        },
      })),
    };
    return { data, status: 200 };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
}

export const getMutualFollowings = async (
  targetUserId: string,
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
              followingId: targetUserId,
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
          createdAt: true,
          metadata: true,
          status: true,
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
              followingId: targetUserId,
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

export const getUserFollowers = async ({
  targetUserId,
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.follow.findMany({
      where: {
        followingId: targetUserId,
      },
      include: {
        follower: {
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
            createdAt: true,
            metadata: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((r) => ({
      ...composeAuthUser(r.follower),
      conn: {
        followerCount: r.follower._count.followers,
        followingCount: r.follower._count.following,
        isFollowingUser: r.follower.following.length > 0,
        isFollowedByUser: r.follower.followers.length > 0,
        followingStatus: r.follower?.following[0]?.status,
        followedStatus: r.follower?.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserFollowing = async ({
  targetUserId,
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.follow.findMany({
      where: {
        followerId: targetUserId,
      },
      include: {
        following: {
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
            metadata: true,
            createdAt: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((r) => ({
      ...composeAuthUser(r.following),
      conn: {
        followerCount: r.following._count.followers,
        followingCount: r.following._count.following,
        isFollowingUser: r.following.following.length > 0,
        isFollowedByUser: r.following.followers.length > 0,
        followingStatus: r.following?.following[0]?.status,
        followedStatus: r.following?.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserFriends = async ({
  targetUserId,
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;

  try {
    const result = await prisma.user.findMany({
      where: {
        AND: [
          {
            followers: {
              some: { followerId: targetUserId, status: FollowStatus.ACCEPTED },
            },
          },
          {
            following: {
              some: {
                followingId: targetUserId,
                status: FollowStatus.ACCEPTED,
              },
            },
          },
        ],
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
        createdAt: true,
        metadata: true,
        status: true,
        _count: {
          select: {
            followers: {
              where: { status: FollowStatus.ACCEPTED },
            },
            following: {
              where: { status: FollowStatus.ACCEPTED },
            },
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

        // 1. is follower following current user?
        following: {
          where: { followingId: currentUserId },
          select: { id: true, status: true },
        },
        // 2. is current user following follower?
        followers: {
          where: { followerId: currentUserId },
          select: { id: true, status: true },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((r) => ({
      ...composeAuthUser(r),
      conn: {
        followerCount: r._count.followers,
        followingCount: r._count.following,
        isFollowingUser: r.following.length > 0,
        isFollowedByUser: r.followers.length > 0,
        followingStatus: r?.following[0]?.status,
        followedStatus: r?.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error: any) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserVerifiedFollowers = async ({
  targetUserId,
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.follow.findMany({
      where: {
        followingId: targetUserId,
        follower: {
          OR: [
            {
              accountVerified: true,
            },
            {
              subscriptions: {
                some: {
                  status: {
                    in: [
                      SubStatusEnum.ACTIVE,
                      SubStatusEnum.TRIAL,
                      SubStatusEnum.PAYMENT_ERROR,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      include: {
        follower: {
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
            createdAt: true,
            metadata: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((r) => ({
      ...composeAuthUser(r.follower),
      conn: {
        followerCount: r.follower._count.followers,
        followingCount: r.follower._count.following,
        isFollowingUser: r.follower.following.length > 0,
        isFollowedByUser: r.follower.followers.length > 0,
        followingStatus: r?.follower.following[0]?.status,
        followedStatus: r?.follower.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserFollowRequests = async ({
  targetUserId,
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.follow.findMany({
      where: {
        followingId: targetUserId,
        status: FollowStatus.PENDING,
      },
      include: {
        follower: {
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
            createdAt: true,
            metadata: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((r) => ({
      ...composeAuthUser(r.follower),
      conn: {
        followerCount: r.follower._count.followers,
        followingCount: r.follower._count.following,
        isFollowingUser: r.follower.following.length > 0,
        isFollowedByUser: r.follower.followers.length > 0,
        followingStatus: r?.follower.following[0]?.status,
        followedStatus: r?.follower.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserBlockedUsers = async ({
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.blockUser.findMany({
      where: {
        blockerId: currentUserId,
      },
      include: {
        blocked: {
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
            createdAt: true,
            metadata: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((b) => ({
      ...composeAuthUser(b.blocked),
      conn: {
        followerCount: b.blocked._count.followers,
        followingCount: b.blocked._count.following,
        isFollowingUser: b.blocked.following.length > 0,
        isFollowedByUser: b.blocked.followers.length > 0,
        followingStatus: b.blocked.following[0]?.status,
        followedStatus: b.blocked.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserMutedUsers = async ({
  currentUserId,
  limit = 50,
  page = 1,
}: {
  targetUserId: string;
  currentUserId?: string;
  limit?: number;
  page?: number;
}) => {
  const skip = (page - 1) * limit;
  try {
    const result = await prisma.muteUser.findMany({
      where: {
        muterId: currentUserId,
      },
      include: {
        muted: {
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
            createdAt: true,
            metadata: true,
            status: true,
            _count: {
              select: {
                followers: {
                  where: { status: FollowStatus.ACCEPTED },
                },
                following: {
                  where: { status: FollowStatus.ACCEPTED },
                },
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

            // 1. is follower following current user?
            following: {
              where: { followingId: currentUserId },
              select: { id: true, status: true },
            },
            // 2. is current user following follower?
            followers: {
              where: { followerId: currentUserId },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    });

    if (result.length === 0) {
      return { status: 404, data: "not found" };
    }
    // compose result
    const data = result.map((m) => ({
      ...composeAuthUser(m.muted),
      conn: {
        followerCount: m.muted._count.followers,
        followingCount: m.muted._count.following,
        isFollowingUser: m.muted.following.length > 0,
        isFollowedByUser: m.muted.followers.length > 0,
        followingStatus: m.muted.following[0]?.status,
        followedStatus: m.muted.followers[0]?.status,
      },
    }));
    return { status: 200, data };
  } catch (error) {
    return { data: "Error occurred, please try again", status: 500 };
  }
};

export const getUserPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const feedPosts = await prisma.post.findMany({
      where: {
        OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
        status: PostStatus.PUBLISHED,
        userId,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ pins: { _count: "desc" } }, { createdAt: "desc" }],
      include: {
        thread: false,
        media: true,
        replyContinents: true,
        replyCountries: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
            replyContinents: true,
            replyCountries: true,
            user: {
              select: {
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
                },
              },
            },
          },
        },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
            role: true,
            userType: true,
            meta: true,
            isVerified: true,
            metadata: true,
            createdAt: true,
            status: true,
            followers: {
              where: {
                followerId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            following: {
              where: {
                followingId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            // 1. if this target user blocked the current user
            blockedUsers: {
              where: { blockedId: user.id },
            },
            // 2. if current user blocked the target user
            blockedBy: {
              where: { blockerId: user.id },
            },
            // 1. if this target user blocked the current user
            mutedUsers: {
              where: { mutedId: user.id },
            },
            // 2. if current user blocked the target user
            mutedBy: {
              where: { muterId: user.id },
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
                continent: true,
              },
            },
          },
        },
        tagUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        poll: {
          include: {
            options: {
              include: {
                voters: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        quiz: {
          include: {
            options: {
              include: {
                participants: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        parent: {
          include: {
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
    });
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });
    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
      // Check if this post was reposted by the user
    }));

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    console.log(error);
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserScheduledPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const feedPosts = await prisma.post.findMany({
      where: {
        // OR: [{ kind: "ROOT" }, { kind: "REPOST" }, { kind: "QUOTE" }],
        // kind: PostKindEnum.ROOT,
        status: PostStatus.SCHEDULED,
        userId,
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        thread: false,
        media: true,
        replyContinents: true,
        replyCountries: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
            replyContinents: true,
            replyCountries: true,
            user: {
              select: {
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
                },
              },
            },
          },
        },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
            role: true,
            userType: true,
            meta: true,
            isVerified: true,
            metadata: true,
            createdAt: true,
            status: true,
            followers: {
              where: {
                followerId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            following: {
              where: {
                followingId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            // 1. if this target user blocked the current user
            blockedUsers: {
              where: { blockedId: user.id },
            },
            // 2. if current user blocked the target user
            blockedBy: {
              where: { blockerId: user.id },
            },
            // 1. if this target user blocked the current user
            mutedUsers: {
              where: { mutedId: user.id },
            },
            // 2. if current user blocked the target user
            mutedBy: {
              where: { muterId: user.id },
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
                continent: true,
              },
            },
          },
        },
        tagUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        poll: {
          include: {
            options: {
              include: {
                voters: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        quiz: {
          include: {
            options: {
              include: {
                participants: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        parent: {
          include: {
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });
    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
      // Check if this post was reposted by the user
    }));

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    console.log(error);
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserReplies = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const feedPosts = await prisma.post.findMany({
      where: {
        // OR: [{ kind: "REPLY" }, { kind: "REPOST" }, { kind: "QUOTE" }],
        kind: PostKindEnum.REPLY,
        status: PostStatus.PUBLISHED,
        userId,
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        thread: false,
        media: true,
        replyContinents: true,
        replyCountries: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
            replyContinents: true,
            replyCountries: true,
            user: {
              select: {
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
                },
              },
            },
          },
        },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
            role: true,
            userType: true,
            meta: true,
            isVerified: true,
            metadata: true,
            createdAt: true,
            status: true,
            followers: {
              where: {
                followerId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            following: {
              where: {
                followingId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            // 1. if this target user blocked the current user
            blockedUsers: {
              where: { blockedId: user.id },
            },
            // 2. if current user blocked the target user
            blockedBy: {
              where: { blockerId: user.id },
            },
            // 1. if this target user blocked the current user
            mutedUsers: {
              where: { mutedId: user.id },
            },
            // 2. if current user blocked the target user
            mutedBy: {
              where: { muterId: user.id },
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
                continent: true,
              },
            },
          },
        },
        tagUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        poll: {
          include: {
            options: {
              include: {
                voters: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        quiz: {
          include: {
            options: {
              include: {
                participants: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        parent: {
          include: {
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });

    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
    }));

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserLikedPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const result = await prisma.likedPost.findMany({
      where: {
        userId,
        post: {
          status: PostStatus.PUBLISHED,
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        post: {
          include: {
            thread: false,
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                parent: {
                  include: {
                    media: true,
                    replyContinents: true,
                    replyCountries: true,
                    root: {
                      select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                        replyContinents: true,
                        replyCountries: true,
                        user: {
                          select: {
                            followers: {
                              where: {
                                followerId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            // 1. if this target user blocked the current user
                            blockedUsers: {
                              where: { blockedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            blockedBy: {
                              where: { blockerId: user.id },
                            },
                            // 1. if this target user blocked the current user
                            mutedUsers: {
                              where: { mutedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            mutedBy: {
                              where: { muterId: user.id },
                            },
                          },
                        },
                      },
                    },
                    pins: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    highlights: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
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
                            continent: true,
                          },
                        },
                      },
                    },
                    tagUsers: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    mentions: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    quiz: {
                      include: {
                        options: {
                          include: {
                            participants: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    poll: {
                      include: {
                        options: {
                          include: {
                            voters: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    likes: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                    bookmarks: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                  },
                },
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const feedPosts = result.map((r) => r.post);
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });

    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
    }));
    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserBookmarkPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const result = await prisma.bookmark.findMany({
      where: {
        userId,
        post: {
          status: PostStatus.PUBLISHED,
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        post: {
          include: {
            thread: false,
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                parent: {
                  include: {
                    media: true,
                    replyContinents: true,
                    replyCountries: true,
                    root: {
                      select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                        replyContinents: true,
                        replyCountries: true,
                        user: {
                          select: {
                            followers: {
                              where: {
                                followerId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            // 1. if this target user blocked the current user
                            blockedUsers: {
                              where: { blockedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            blockedBy: {
                              where: { blockerId: user.id },
                            },
                            // 1. if this target user blocked the current user
                            mutedUsers: {
                              where: { mutedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            mutedBy: {
                              where: { muterId: user.id },
                            },
                          },
                        },
                      },
                    },
                    pins: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    highlights: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
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
                            continent: true,
                          },
                        },
                      },
                    },
                    tagUsers: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    mentions: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    quiz: {
                      include: {
                        options: {
                          include: {
                            participants: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    poll: {
                      include: {
                        options: {
                          include: {
                            voters: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    likes: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                    bookmarks: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                  },
                },
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const feedPosts = result.map((r) => r.post);
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });

    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
    }));
    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserHighlightPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const result = await prisma.postHighlight.findMany({
      where: {
        userId,
        post: {
          status: PostStatus.PUBLISHED,
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        post: {
          include: {
            thread: false,
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                parent: {
                  include: {
                    media: true,
                    replyContinents: true,
                    replyCountries: true,
                    root: {
                      select: {
                        id: true,
                        scope: true,
                        userId: true,
                        rootId: true,
                        replyContinents: true,
                        replyCountries: true,
                        user: {
                          select: {
                            followers: {
                              where: {
                                followerId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: user.id,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            // 1. if this target user blocked the current user
                            blockedUsers: {
                              where: { blockedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            blockedBy: {
                              where: { blockerId: user.id },
                            },
                            // 1. if this target user blocked the current user
                            mutedUsers: {
                              where: { mutedId: user.id },
                            },
                            // 2. if current user blocked the target user
                            mutedBy: {
                              where: { muterId: user.id },
                            },
                          },
                        },
                      },
                    },
                    pins: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    highlights: {
                      where: { userId },
                      select: { id: true, userId: true },
                    },
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
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
                            continent: true,
                          },
                        },
                      },
                    },
                    tagUsers: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    mentions: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            name: true,
                            username: true,
                            avatar: true,
                            bio: true,
                            role: true,
                            userType: true,
                            meta: true,
                            isVerified: true,
                            metadata: true,
                            createdAt: true,
                            status: true,
                            _count: {
                              select: {
                                followers: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                                following: {
                                  where: { status: FollowStatus.ACCEPTED },
                                },
                              },
                            },
                            followers: {
                              where: {
                                followerId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
                              },
                            },
                            following: {
                              where: {
                                followingId: userId,
                              },
                              select: {
                                id: true,
                                followerId: true,
                                followingId: true,
                                status: true,
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
                                continent: true,
                              },
                            },
                          },
                        },
                      },
                    },
                    quiz: {
                      include: {
                        options: {
                          include: {
                            participants: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    poll: {
                      include: {
                        options: {
                          include: {
                            voters: {
                              where: {
                                userId: user.id,
                              },
                            },
                          },
                        },
                        continents: true,
                        countries: true,
                      },
                    },
                    likes: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                    bookmarks: {
                      where: {
                        userId: user.id, // Check if the current user has liked the post
                      },
                      select: {
                        id: true, // Fetch only the like ID (or boolean flag)
                        userId: true,
                      },
                    },
                  },
                },
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const feedPosts = result.map((r) => r.post);
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });

    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
    }));
    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserMediaPosts = async (
  args: { userId: string; limit?: number; page?: number },
  user: AuthUser
) => {
  try {
    const { userId, limit = 21, page = 1 } = args;
    const feedPosts = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        userId,
        media: { some: {} },
        OR: [{}],
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        thread: false,
        media: true,
        replyContinents: true,
        replyCountries: true,
        root: {
          select: {
            id: true,
            scope: true,
            userId: true,
            rootId: true,
            replyContinents: true,
            replyCountries: true,
            user: {
              select: {
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
                },
              },
            },
          },
        },
        pins: { where: { userId }, select: { id: true, userId: true } },
        highlights: { where: { userId }, select: { id: true, userId: true } },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            bio: true,
            role: true,
            userType: true,
            meta: true,
            isVerified: true,
            metadata: true,
            createdAt: true,
            status: true,
            followers: {
              where: {
                followerId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            following: {
              where: {
                followingId: user.id,
              },
              select: {
                id: true,
                followerId: true,
                followingId: true,
                status: true,
              },
            },
            // 1. if this target user blocked the current user
            blockedUsers: {
              where: { blockedId: user.id },
            },
            // 2. if current user blocked the target user
            blockedBy: {
              where: { blockerId: user.id },
            },
            // 1. if this target user blocked the current user
            mutedUsers: {
              where: { mutedId: user.id },
            },
            // 2. if current user blocked the target user
            mutedBy: {
              where: { muterId: user.id },
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
                continent: true,
              },
            },
          },
        },
        tagUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                _count: {
                  select: {
                    followers: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                    following: {
                      where: { status: FollowStatus.ACCEPTED },
                    },
                  },
                },
                followers: {
                  where: {
                    followerId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: userId,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
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
                    continent: true,
                  },
                },
              },
            },
          },
        },
        poll: {
          include: {
            options: {
              include: {
                voters: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        quiz: {
          include: {
            options: {
              include: {
                participants: {
                  where: {
                    userId: user.id,
                  },
                },
              },
            },
            continents: true,
            countries: true,
          },
        },
        parent: {
          include: {
            media: true,
            replyContinents: true,
            replyCountries: true,
            root: {
              select: {
                id: true,
                scope: true,
                userId: true,
                rootId: true,
                replyContinents: true,
                replyCountries: true,
                user: {
                  select: {
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
                    },
                  },
                },
              },
            },
            pins: { where: { userId }, select: { id: true, userId: true } },
            highlights: {
              where: { userId },
              select: { id: true, userId: true },
            },
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                bio: true,
                role: true,
                userType: true,
                meta: true,
                isVerified: true,
                metadata: true,
                createdAt: true,
                status: true,
                followers: {
                  where: {
                    followerId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                following: {
                  where: {
                    followingId: user.id,
                  },
                  select: {
                    id: true,
                    followerId: true,
                    followingId: true,
                    status: true,
                  },
                },
                // 1. if this target user blocked the current user
                blockedUsers: {
                  where: { blockedId: user.id },
                },
                // 2. if current user blocked the target user
                blockedBy: {
                  where: { blockerId: user.id },
                },
                // 1. if this target user blocked the current user
                mutedUsers: {
                  where: { mutedId: user.id },
                },
                // 2. if current user blocked the target user
                mutedBy: {
                  where: { muterId: user.id },
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
                    continent: true,
                  },
                },
              },
            },
            tagUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    metadata: true,
                    createdAt: true,
                    status: true,
                    _count: {
                      select: {
                        followers: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                        following: {
                          where: { status: FollowStatus.ACCEPTED },
                        },
                      },
                    },
                    followers: {
                      where: {
                        followerId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: userId,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
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
                        continent: true,
                      },
                    },
                  },
                },
              },
            },
            quiz: {
              include: {
                options: {
                  include: {
                    participants: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            poll: {
              include: {
                options: {
                  include: {
                    voters: {
                      where: {
                        userId: user.id,
                      },
                    },
                  },
                },
                continents: true,
                countries: true,
              },
            },
            likes: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            bookmarks: {
              where: {
                userId: user.id, // Check if the current user has liked the post
              },
              select: {
                id: true, // Fetch only the like ID (or boolean flag)
                userId: true,
              },
            },
            parent: {
              include: {
                media: true,
                replyContinents: true,
                replyCountries: true,
                root: {
                  select: {
                    id: true,
                    scope: true,
                    userId: true,
                    rootId: true,
                    replyContinents: true,
                    replyCountries: true,
                    user: {
                      select: {
                        followers: {
                          where: {
                            followerId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: user.id,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        // 1. if this target user blocked the current user
                        blockedUsers: {
                          where: { blockedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        blockedBy: {
                          where: { blockerId: user.id },
                        },
                        // 1. if this target user blocked the current user
                        mutedUsers: {
                          where: { mutedId: user.id },
                        },
                        // 2. if current user blocked the target user
                        mutedBy: {
                          where: { muterId: user.id },
                        },
                      },
                    },
                  },
                },
                pins: { where: { userId }, select: { id: true, userId: true } },
                highlights: {
                  where: { userId },
                  select: { id: true, userId: true },
                },

                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    avatar: true,
                    bio: true,
                    role: true,
                    userType: true,
                    meta: true,
                    isVerified: true,
                    followers: {
                      where: {
                        followerId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    following: {
                      where: {
                        followingId: user.id,
                      },
                      select: {
                        id: true,
                        followerId: true,
                        followingId: true,
                        status: true,
                      },
                    },
                    // 1. if this target user blocked the current user
                    blockedUsers: {
                      where: { blockedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    blockedBy: {
                      where: { blockerId: user.id },
                    },
                    // 1. if this target user blocked the current user
                    mutedUsers: {
                      where: { mutedId: user.id },
                    },
                    // 2. if current user blocked the target user
                    mutedBy: {
                      where: { muterId: user.id },
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
                        continent: true,
                      },
                    },
                  },
                },
                tagUsers: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                mentions: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true,
                        bio: true,
                        role: true,
                        userType: true,
                        meta: true,
                        isVerified: true,
                        metadata: true,
                        createdAt: true,
                        status: true,
                        _count: {
                          select: {
                            followers: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                            following: {
                              where: { status: FollowStatus.ACCEPTED },
                            },
                          },
                        },
                        followers: {
                          where: {
                            followerId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
                          },
                        },
                        following: {
                          where: {
                            followingId: userId,
                          },
                          select: {
                            id: true,
                            followerId: true,
                            followingId: true,
                            status: true,
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
                            continent: true,
                          },
                        },
                      },
                    },
                  },
                },
                quiz: {
                  include: {
                    options: {
                      include: {
                        participants: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                poll: {
                  include: {
                    options: {
                      include: {
                        voters: {
                          where: {
                            userId: user.id,
                          },
                        },
                      },
                    },
                    continents: true,
                    countries: true,
                  },
                },
                likes: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
                bookmarks: {
                  where: {
                    userId: user.id, // Check if the current user has liked the post
                  },
                  select: {
                    id: true, // Fetch only the like ID (or boolean flag)
                    userId: true,
                  },
                },
              },
            },
          },
        },
        likes: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
        bookmarks: {
          where: {
            userId: user.id, // Check if the current user has liked the post
          },
          select: {
            id: true, // Fetch only the like ID (or boolean flag)
            userId: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    // Step 2: Fetch all reposts by the current user for these posts
    const postIds = feedPosts.map((post) => post.id); // Collect all post IDs

    const userReposts = await prisma.post.findMany({
      where: {
        userId: user.id, // Current user's posts
        kind: PostKindEnum.REPOST, // Only reposts
        OR: [
          { parentId: { in: postIds } }, // User reposted the post itself
          { id: { in: postIds } }, // The post itself is the user's repost (child repost)
        ],
      },
      select: {
        id: true, // User's repost (child repost)
        parentId: true, // Get only parent post IDs (original posts the user reposted)
      },
    });
    // Step 3: Attach repost status to feed posts
    const data = feedPosts.map((post) => ({
      ...post,
      reposts: userReposts.filter((repost) => repost.parentId === post.id),
      parent: post.parent
        ? {
            ...post.parent,
            reposts: userReposts.filter(
              (repost) => repost.parentId === post?.parentId
            ),
          }
        : post.parent,
      // Check if this post was reposted by the user
    }));

    const _posts = data
      ?.map(transformPrismaTagMentions)
      .map((p) => transformPost(p, user));

    return {
      data: _posts.length > 0 ? _posts : "Not found",
      status: _posts.length > 0 ? 200 : 404,
    };
  } catch (error: any) {
    return {
      data: "Error occurred trying to get feed, please try again",
      status: 500,
    };
  }
};

export const getUserAccountAnalytics = async (
  userId: string,
  args: { duration: string }
) => {
  try {
    const startDate = getAnalyticsDuration(args.duration);
    const rangeLengthMs = Date.now() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - rangeLengthMs);

    const [
      currentVisits,
      previousVisits,

      // currentUniqueVisits,
      // previousUniqueVisits,

      currentPostStats,
      prevPostStats,

      currentFollowers,
      prevFollowers,

      currentFollow,
      prevFollow,

      currentUnfollow,
      prevUnfollow,

      currentPostUserMentions,
      prevPostUserMentions,

      currentPostUserTag,
      prevPostUserTag,

      currentReferral,
      prevReferral,

      currentBlockers,
      prevBlockers,

      currentMuters,
      prevMuters,

      currentReporters,
      prevReporters,

      currentUserPostClicks,
      prevUserPostClicks,

      currentUserPostMediaClicks,
      prevUserPostMediaClicks,

      currentUserPostMediaStats,
      prevUserPostMediaStats,
    ] = await Promise.all([
      // profile visits
      prisma.profileVisit.count({
        where: { userId, createdAt: { gte: startDate } },
      }),
      prisma.profileVisit.count({
        where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      }),
      // unnique profile visits
      // prisma.profileVisit.groupBy({
      //   by: ["visitorId"],
      //   where: { userId, createdAt: { gte: startDate } },
      //   _count: {
      //     visitorId: true,
      //   },
      // }),

      // prisma.profileVisit.groupBy({
      //   by: ["visitorId"],
      //   where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      //   _count: {
      //     visitorId: true,
      //   },
      // }),

      // current post stats
      prisma.post.aggregate({
        _sum: {
          totalImpressions: true,
          totalLikes: true,
          totalQuotes: true,
          totalReplies: true,
          totalReposts: true,
          totalViews: true,
          totalShares: true,
          totalBookmarks: true,
          totalTips: true,
        },
        where: {
          createdAt: { gte: startDate },
          status: PostStatus.PUBLISHED,
          OR: [{ userId }, { parent: { userId } }, { root: { userId } }],
        },
      }),

      // prev post stats
      prisma.post.aggregate({
        _sum: {
          totalImpressions: true,
          totalLikes: true,
          totalQuotes: true,
          totalReplies: true,
          totalReposts: true,
          totalViews: true,
          totalShares: true,
          totalBookmarks: true,
          totalTips: true,
        },
        where: {
          createdAt: { gte: prevStartDate, lt: startDate },
          status: PostStatus.PUBLISHED,
          OR: [{ userId }, { parent: { userId } }, { root: { userId } }],
        },
      }),

      // current followers
      prisma.follow.aggregate({
        where: {
          status: FollowStatus.ACCEPTED,
          followingId: userId,
          createdAt: { gte: startDate },
        },
        _count: { followerId: true },
      }),
      // prev followers
      prisma.follow.aggregate({
        where: {
          status: FollowStatus.ACCEPTED,
          followingId: userId,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { followerId: true },
      }),

      // current follow
      prisma.followHistory.aggregate({
        where: {
          followingId: userId,
          action: FollowAction.FOLLOW,
          createdAt: { gte: startDate },
        },
        _count: { followerId: true },
      }),
      // prev follow
      prisma.followHistory.aggregate({
        where: {
          followingId: userId,
          action: FollowAction.FOLLOW,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { followerId: true },
      }),

      // current unfollow
      prisma.followHistory.aggregate({
        where: {
          followingId: userId,
          action: FollowAction.UNFOLLOW,
          createdAt: { gte: startDate },
        },
        _count: { followerId: true },
      }),
      // prev unfollow
      prisma.followHistory.aggregate({
        where: {
          followingId: userId,
          action: FollowAction.UNFOLLOW,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { followerId: true },
      }),

      // current post mentions
      prisma.postMention.aggregate({
        where: { userId, createdAt: { gte: startDate } },
        _count: { userId: true },
      }),
      // prev post mentions
      prisma.postMention.aggregate({
        where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
        _count: { userId: true },
      }),

      // current post user tag
      prisma.postUserTag.aggregate({
        where: { userId, createdAt: { gte: startDate } },
        _count: { userId: true },
      }),
      // prev post user tag
      prisma.postUserTag.aggregate({
        where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
        _count: { userId: true },
      }),

      // current referral
      prisma.referral.aggregate({
        where: { referrerId: userId, createdAt: { gte: startDate } },
        _count: { refereeId: true },
      }),
      // prev referral
      prisma.referral.aggregate({
        where: {
          referrerId: userId,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { refereeId: true },
      }),

      // current account that blocked user
      prisma.blockUser.aggregate({
        where: { blockedId: userId, createdAt: { gte: startDate } },
        _count: { blockerId: true },
      }),
      // prev account that blocked user
      prisma.blockUser.aggregate({
        where: {
          blockedId: userId,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { blockerId: true },
      }),

      // current account that muted user
      prisma.muteUser.aggregate({
        where: { mutedId: userId, createdAt: { gte: startDate } },
        _count: { muterId: true },
      }),
      // prev account that muted user
      prisma.muteUser.aggregate({
        where: {
          mutedId: userId,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { muterId: true },
      }),

      // current account that reported user
      prisma.userReport.aggregate({
        where: { reportedId: userId, createdAt: { gte: startDate } },
        _count: { reporterId: true },
      }),
      // prev account that reported user
      prisma.userReport.aggregate({
        where: {
          reportedId: userId,
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { reporterId: true },
      }),

      // current user post clicks
      prisma.postClick.aggregate({
        where: {
          post: { userId, OR: [{ parent: { userId } }, { root: { userId } }] },
          createdAt: { gte: startDate },
        },
        _count: { userId: true },
      }),
      // prev user post clicks
      prisma.postClick.aggregate({
        where: {
          post: { userId, OR: [{ parent: { userId } }, { root: { userId } }] },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { userId: true },
      }),

      // current user media post clicks
      prisma.postMediaLog.aggregate({
        where: {
          post: { userId, OR: [{ parent: { userId } }, { root: { userId } }] },
          createdAt: { gte: startDate },
        },
        _count: { userId: true },
      }),
      // prev user media post clicks
      prisma.postMediaLog.aggregate({
        where: {
          post: { userId, OR: [{ parent: { userId } }, { root: { userId } }] },
          createdAt: { gte: prevStartDate, lt: startDate },
        },
        _count: { userId: true },
      }),

      // current user post media stats
      prisma.postMedia.aggregate({
        _sum: {
          totalDownloads: true,
          totalViews: true,
        },
        where: {
          createdAt: { gte: startDate },
          post: {
            status: PostStatus.PUBLISHED,
            OR: [{ userId }, { parent: { userId } }, { root: { userId } }],
          },
        },
      }),

      // prev user post media stats
      prisma.postMedia.aggregate({
        _sum: {
          totalDownloads: true,
          totalViews: true,
        },
        where: {
          createdAt: { gte: prevStartDate, lt: startDate },
          post: {
            status: PostStatus.PUBLISHED,
            OR: [{ userId }, { parent: { userId } }, { root: { userId } }],
          },
        },
      }),
    ]);

    const getPostAggregateStats = () => {
      const currStats = currentPostStats._sum;
      const prevStats = prevPostStats._sum;
      return Object.entries(currStats).map(([key, value]) => {
        const currValue = Number(value ?? 0);
        // @ts-ignore
        const prevValue = Number(prevStats[key as any] ?? 0);
        return {
          title: key.replace("total", ""),
          value: currValue,
          change: analyticsPercentageChange(currValue, prevValue),
        };
      });
    };

    // calculate engagement on post level
    const calcEngagement = () => {
      // current
      const currStats = currentPostStats._sum;
      const currSum =
        Number(currStats.totalBookmarks) +
        Number(currStats.totalLikes) +
        Number(currStats.totalQuotes) +
        Number(currStats.totalReposts) +
        Number(currStats.totalShares) +
        Number(currStats.totalReplies) +
        Number(currStats.totalViews) +
        Number(currStats.totalTips);
      // engagement rate on post level
      const currImpressions = Number(currStats.totalImpressions);
      const currRate =
        currSum > 0 && currImpressions > 0
          ? Number(((currSum / currImpressions) * 100).toFixed(2))
          : 0;
      // previous
      const prevStats = prevPostStats._sum;
      const prevSum =
        Number(prevStats.totalBookmarks) +
        Number(prevStats.totalLikes) +
        Number(prevStats.totalQuotes) +
        Number(prevStats.totalReposts) +
        Number(prevStats.totalShares) +
        Number(prevStats.totalReplies) +
        Number(prevStats.totalViews) +
        Number(prevStats.totalTips);
      // engagement rate on post level
      const prevImpressions = Number(prevStats.totalImpressions);
      const prevRate =
        prevSum > 0 && prevImpressions > 0
          ? Number(((prevSum / prevImpressions) * 100).toFixed(2))
          : 0;

      return { currRate, prevRate };
    };

    const engageStats = calcEngagement();

    const analytics = [
      {
        title: "Engagement Rate",
        value: engageStats.currRate,
        change: analyticsPercentageChange(
          engageStats.currRate,
          engageStats.prevRate
        ),
      },
      ...getPostAggregateStats(),
      {
        title: "Post Clicks",
        value: currentUserPostClicks._count.userId,
        change: analyticsPercentageChange(
          currentUserPostClicks._count.userId,
          prevUserPostClicks._count.userId
        ),
      },
      {
        title: "Media Clicks",
        value: currentUserPostMediaClicks._count.userId,
        change: analyticsPercentageChange(
          currentUserPostMediaClicks._count.userId,
          prevUserPostMediaClicks._count.userId
        ),
      },

      {
        title: "Media Views",
        value: Number(currentUserPostMediaStats._sum.totalViews),
        change: analyticsPercentageChange(
          Number(currentUserPostMediaStats._sum.totalViews),
          Number(prevUserPostMediaStats._sum.totalViews)
        ),
      },

      {
        title: "Media Downloads",
        value: Number(currentUserPostMediaStats._sum.totalDownloads),
        change: analyticsPercentageChange(
          Number(currentUserPostMediaStats._sum.totalDownloads),
          Number(prevUserPostMediaStats._sum.totalDownloads)
        ),
      },

      {
        title: "Profile Visits",
        value: currentVisits,
        change: analyticsPercentageChange(currentVisits, previousVisits),
      },
      // {
      //   title: "Unique Profile Visits",
      //   value: currentUniqueVisits.length,
      //   change: analyticsPercentageChange(
      //     currentUniqueVisits.length,
      //     previousUniqueVisits.length
      //   ),
      // },
      {
        title: "Followers",
        value: currentFollowers._count.followerId,
        change: analyticsPercentageChange(
          currentFollowers._count.followerId,
          prevFollowers._count.followerId
        ),
      },

      {
        title: "Follows",
        value: currentFollow._count.followerId,
        change: analyticsPercentageChange(
          currentFollow._count.followerId,
          prevFollow._count.followerId
        ),
      },

      {
        title: "Unfollows",
        value: currentUnfollow._count.followerId,
        change: analyticsPercentageChange(
          currentUnfollow._count.followerId,
          prevUnfollow._count.followerId
        ),
      },

      {
        title: "Blockers",
        value: currentBlockers._count.blockerId,
        change: analyticsPercentageChange(
          currentBlockers._count.blockerId,
          prevBlockers._count.blockerId
        ),
      },

      {
        title: "Muters",
        value: currentMuters._count.muterId,
        change: analyticsPercentageChange(
          currentMuters._count.muterId,
          prevMuters._count.muterId
        ),
      },

      {
        title: "Reporters",
        value: currentReporters._count.reporterId,
        change: analyticsPercentageChange(
          currentReporters._count.reporterId,
          prevReporters._count.reporterId
        ),
      },

      {
        title: "Mentions",
        value: currentPostUserMentions._count.userId,
        change: analyticsPercentageChange(
          currentPostUserMentions._count.userId,
          prevPostUserMentions._count.userId
        ),
      },

      {
        title: "Tagging",
        value: currentPostUserTag._count.userId,
        change: analyticsPercentageChange(
          currentPostUserTag._count.userId,
          prevPostUserTag._count.userId
        ),
      },

      {
        title: "Referral",
        value: currentReferral._count.refereeId,
        change: analyticsPercentageChange(
          currentReferral._count.refereeId,
          prevReferral._count.refereeId
        ),
      },
    ];
    return {
      data: analytics,
      status: 200,
    };
  } catch (error) {
    console.log(error);
    return { data: "Error occurred, please try again", status: 500 };
  }
};
