import { FeedPost } from "@/types";
import { UserPublic, AuthUser } from "@/types/user";
import prisma from "@/db";
import {
  Prisma,
  PostScopeEnum,
  PostTypeEnum,
  ScopeEnum,
  SubStatusEnum,
  User,
  UserStatus,
} from "@prisma/client";
import { AppError } from "@/utils/helpers";
import {logServiceError} from '@/logger/events';

export const getUserStatusMessage = (
  user: User,
  isPersonal: boolean = false
) => {
  const arr = user.metadata[user?.metadata?.length - 1] as {
    reason: string;
    createdAt: string;
  };
  if (user.status === UserStatus.SUSPENDED) {
    return `This account is temporarily suspended${
      arr?.reason
        ? ` for ${arr.reason}`
        : `${isPersonal ? ". You can appeal or contact support." : ""}`
    }`;
  }
  if (user.status === UserStatus.BANNED) {
    return `This account is banned permanently${
      arr?.reason
        ? ` for ${arr.reason}`
        : `${isPersonal ? ". You can appeal or contact support." : ""}`
    }`;
  }
  if (user.status === UserStatus.PRIVATE) {
    return `This account is private`;
  }
  if (user.status === UserStatus.DEACTIVATED) {
    return `This account is deactivated`;
  }
  return "";
};
export const composeAuthUser = (
  user: any,
  includeEmail: boolean = false
): AuthUser => {
  const subscription = user?.subscriptions[0];
  const statuses = [UserStatus.ACTIVE, UserStatus.PRIVATE] as string[];
  return {
    id: user.id,
    avatar: user.avatar,
    banner: user.banner,
    website: user.website,
    username: user.username,
    name: user.name,
    role: user.role,
    userType: user.userType,
    bio: user?.bio,
    createdAt: user.createdAt,
    country: user?.country,
    ...(includeEmail && { email: user?.email, emailVerifiedAt: user.emailVerifiedAt, identityVerifiedAt: user.identityVerifiedAt, accountVerifiedAt: user.accountVerifiedAt }),
    meta: {
      ...user.meta,
      isPro: !!subscription,
      isLegacy: !!user.accountVerifiedAt,
      isActive: statuses.includes(String(user?.status)),
      isPrivate: user?.status === UserStatus.PRIVATE,
      message: getUserStatusMessage(user),
      accountStatus: user?.status,
      tier: 1,
      level: 1,
    },
  };
};

export const composeUserConnection = (user: any): UserPublic => {
  const _user = composeAuthUser(user);
  return {
    ..._user,
    conn: {
      followerCount: user.followerCount || 0,
      followingCount: user.followingCount || 0,
      isFollowingUser: user.isFollowingUser,
      isFollowedByUser: user.isFollowedByUser,
      followingStatus: user.followingStatus,
      followedStatus: user.followerStatus,
      mutualCount: user.mutualCount || 0,
    },
    mutualFollowers: user.mutualFollowers || [],
  };
};

export const composePostAuthor = (user: any): UserPublic => {
  const _user = composeAuthUser(user);
  return {
    ..._user,
    conn: {
      // whether the current user follows the author
      isFollowedByUser: user?.followers?.length > 0,

      // whether the author is following the user
      isFollowingUser: user?.following?.length > 0,

      followerCount: user.followerCount || 0,

      followingCount: user.followingCount || 0,

      followingStatus: user?.following[0]?.status,

      followedStatus: user?.followers[0]?.status,

      mutualCount: 0,
    },
    mutualFollowers: [],
  };
};

export function serializeBigInts<T>(value: T): T {
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber() as T;
  if (typeof value === "bigint") {
    return Number(value) as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(v => serializeBigInts(v)) as T;
  }

  const result: any = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    result[key] = serializeBigInts((value as any)[key]);
  }

  return result as T;
}



// export function convertBigInts<T>(obj: T): T {
//   if (obj === null || typeof obj !== "object") return obj;

//   // We cast to any because we mutate the object, but return T
//   const result: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };

//   for (const key in result) {
//     const value = result[key];
//     if (typeof value === "bigint") {
//       result[key] = Number(value);
//     } else if (value !== null && typeof value === "object") {
//       result[key] = convertBigInts(value);
//     }
//   }

//   return result as T;
// }

// export function convertBigInts(obj: any) {
//   if (!obj || typeof obj !== "object") return obj;
//   for (const key in obj) {
//     if (typeof obj[key] === "bigint") {
//       obj[key] = Number(obj[key]);
//     } else if (typeof obj[key] === "object") {
//       obj[key] = convertBigInts(obj[key]);
//     }
//   }
//   return obj;
// }

export function checkExpiryTime(targetDate: Date | string) {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const difference = target - now;

  return difference <= 0 ? true : false;
}

export function checkPollPermissions(
  post: FeedPost,
  user?: AuthUser
): FeedPost {
  const isPoll = post.type === PostTypeEnum.POLL;

  const poll = post.poll;

  let updatedPost = { ...post };

  if (isPoll && poll) {
    const votes = (
      poll.options.flatMap((option) => option.voters || []) || []
    ).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const lastOption = votes[0];

    const tenSecondsPassed = lastOption
      ? (Date.now() - new Date(lastOption.createdAt).getTime()) / 1000 > 10
      : false;

    const isExpired = checkExpiryTime(poll.expireAt!);

    const hasVoted = !!(poll.isMultiVote
      ? tenSecondsPassed
      : poll.options.some((option) => option.voters?.length > 0));

    let canVote = true;
    if (poll.scope !== ScopeEnum.NONE) {
      const matchCountry = poll.countries?.some(
        (c) => c.countryId === user?.country?.id
      );
      const matchContinent = poll.continents?.some(
        (c) => c.continentId === user?.country?.continentId
      );
      canVote = !!(matchCountry || matchContinent);
    }

    updatedPost.poll = {
      ...poll,
      hasVoted,
      isExpired,
      canVote,
    };
  }

  // Recursively check nested posts
  return {
    ...updatedPost,
    parent: post.parent ? checkPollPermissions(post.parent, user) : undefined,
    replies:
      post.replies?.map((reply) => checkPollPermissions(reply, user)) || [],
    thread: post.thread?.map((tp) => checkPollPermissions(tp, user)) || [],
  };
}

export function checkQuizPermissions(
  post: FeedPost,
  user?: AuthUser
): FeedPost {
  const isQuiz = post.type === PostTypeEnum.QUIZ;
  const quiz = post.quiz;

  let updatedPost = { ...post };

  if (isQuiz && quiz) {
    const hasVoted = !!quiz.options?.some(
      (option) => option.participants?.length > 0
    );
    const isExpired = checkExpiryTime(quiz.expireAt!);

    let canVote = true;
    if (quiz.scope !== ScopeEnum.NONE) {
      const matchCountry = quiz.countries?.some(
        (c) => c.countryId === user?.country?.id
      );
      const matchContinent = quiz.continents?.some(
        (c) => c.continentId === user?.country?.continentId
      );
      canVote = !!(matchCountry || matchContinent);
    }

    updatedPost.quiz = {
      ...quiz,
      hasVoted,
      isExpired,
      canVote,
    };
  }

  // Recursively transform nested posts
  return {
    ...updatedPost,
    parent: post.parent ? checkQuizPermissions(post.parent, user) : undefined,
    replies:
      post.replies?.map((reply) => checkQuizPermissions(reply, user)) || [],
    thread: post.thread?.map((tp) => checkQuizPermissions(tp, user)) || [],
  };
}

/**
 * Check if the current user has the required permission to reply to this post
 * @param post current post
 * @param user current user
 * @returns post
 */
export function checkReplyPermissions(
  post: FeedPost,
  user?: AuthUser
): FeedPost {
  const checkCanReply = (_post: FeedPost): FeedPost => {
    const rootPost = _post?.root;

    const canHideReply = rootPost
      ? rootPost?.userId === user?.id
      : _post.userId === user?.id;

    const scope = rootPost?.scope || _post.scope;

    let canReply = false;

    const countries = (rootPost?.replyCountries || _post.replyCountries) ?? [];

    const continents =
      (rootPost?.replyContinents || _post.replyContinents) ?? [];

    if (_post.userId === user?.id) {
      canReply = true;
    } else {
      switch (scope) {
        case PostScopeEnum.ANYONE:
          canReply = true;
          break;

        case PostScopeEnum.VERIFIED:
          canReply = !!user?.meta?.isPro;
          break;

        case PostScopeEnum.FOLLOWED:
          // check this
          canReply = _post?.author?.conn?.isFollowingUser;
          break;

        case PostScopeEnum.MENTIONS:
          const isMentioned =
            _post.tagUsers?.some((u) => u.id === user?.id) ||
            _post.mentions?.some((u) => u.id === user?.id);
          canReply = !!isMentioned;
          break;

        case PostScopeEnum.COUNTRY:
          // console.log("countries ", countries);
          const matchCountry = countries?.some(
            (c) => c.countryId === user?.country?.id
          );
          canReply = matchCountry; //!!matchCountry;
          break;

        case PostScopeEnum.CONTINENT:
          const matchContinent = continents?.some(
            (c) => c.continentId === user?.country?.continentId
          );
          canReply = matchContinent; //!!matchContinent
          break;
      }
    }
    const actions = _post?.actions;

    if (
      actions?.hasBlockedByRootUser ||
      actions?.isRootBlockedByUser ||
      actions?.hasBlockedUser ||
      actions?.isBlockedByUser
    ) {
      canReply = false;
    }
    return {
      ..._post,
      scope,
      actions: { ..._post.actions, canReply, canHideReply },
    };
  };

  return {
    ...checkCanReply(post),
    parent: post.parent ? checkCanReply(post.parent) : undefined,
    replies: post.replies?.map((reply) => checkCanReply(reply)) || [],
    thread: post.thread?.map((threadPost) => checkCanReply(threadPost)) || [],
  };
}

export const transformPrismaTagMentions = (post: any) => {
  const {
    parentChain = [],
    thread = [],
    replies = [],
    reposts = [],
    tagUsers = [],
    mentions = [],
    ...rest
  } = post;

  // First transform the core post
  let transformed = {
    ...rest,
    reposts,
    tagUsers: tagUsers.map((u: any) => ({
      ...u.user,
      followerCount: u.user._count.followers,
      followingCount: u.user._count.following,
    })),
    mentions: mentions.map((m: any) => ({
      ...m.user,
      followerCount: m.user._count.followers,
      followingCount: m.user._count.following,
    })),
  };

  if (transformed?.parent) {
    transformed.parent = transformPrismaTagMentions(transformed.parent);
  }
  // Then transform nested fields recursively
  if (parentChain.length > 0) {
    transformed.parentChain = parentChain.map((p: any) =>
      transformPrismaTagMentions(p)
    );
  }

  if (thread.length > 0) {
    transformed.thread = thread.map((p: any) => transformPrismaTagMentions(p));
  }

  if (replies.length > 0) {
    transformed.replies = replies.map((p: any) =>
      transformPrismaTagMentions(p)
    );
  }
  return transformed;
};

export const transformPost = (post: any, user?: AuthUser): FeedPost => {
  const {
    likes = [],
    bookmarks = [],
    parentChain = [],
    thread = [],
    replies = [],
    reposts = [],
    tagUsers = [],
    mentions = [],
    pins = [],
    highlights = [],
    user: postUser,
    ...rest
  } = post;

  // First transform the core post
  let transformed: FeedPost = {
    ...rest,
    parentChain,
    totalHiddenReplies: rest?._count?.replies ?? 0,
    tagUsers: tagUsers.map(composePostAuthor),
    mentions: mentions.map(composePostAuthor),
    author: composePostAuthor(postUser),
    actions: {
      hasPinned: pins.length > 0,
      hasHighlighted: highlights.length > 0,
      hasReposted: reposts.length > 0,
      hasLiked: likes.length > 0,
      hasSaved: bookmarks.length > 0,
      hasBlockedUser: postUser?.blockedUsers?.length > 0,
      isBlockedByUser: postUser?.blockedBy?.length > 0,
      hasMutedUser: postUser?.mutedUsers?.length > 0,
      isMutedByUser: postUser?.mutedBy?.length > 0,
      hasBlockedByRootUser: rest?.root && rest?.root?.blockedUsers?.length > 0,
      isRootBlockedByUser: rest?.root && rest?.root?.blockedBy?.length > 0,
      hasMutedByRootUser: rest?.root && rest?.root?.mutedUsers?.length > 0,
      isRootMutedByUser: rest?.root && rest?.root?.mutedBy?.length > 0,
    },
  };

  if (transformed?.parent) {
    transformed.parent = transformPost(transformed.parent, user);
  }
  // Then transform nested fields recursively
  if (parentChain.length > 0) {
    transformed.parentChain = parentChain.map((p: any) =>
      transformPost(p, user)
    );
  }

  if (thread.length > 0) {
    transformed.thread = thread.map((p: any) => transformPost(p, user));
  }

  if (replies.length > 0) {
    transformed.replies = replies.map((p: any) => transformPost(p, user));
  }

  // Apply permission checks to the whole transformed post
  // transformed = checkPollPermissions(transformed, user);
  // transformed = checkQuizPermissions(transformed, user);
  // transformed = checkReplyPermissions(transformed, user);

  // return transformed;
  // return checkPollPermissions(checkQuizPermissions(transformed,user),user)
  return checkReplyPermissions(
    checkQuizPermissions(checkPollPermissions(transformed, user), user),
    user
  );
};

/**
 *
 * @param userId the user Id to find
 * @param params
 * @returns
 */
export const getAuthUser = async (
  userId?: string,
  params?: { includeEmail?: boolean; includeAny?: boolean }
) => {
  const { includeAny, includeEmail } = params || {};
  try {
    const user = await prisma.user.findFirst({
      relationLoadStrategy: "join",
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
    if (!user) return { data: "User not found", status: 404 };
    // check account status
    if (!includeAny) {
      const statuses = [UserStatus.BANNED, UserStatus.SUSPENDED] as string[];
      if (statuses.includes(user.status)) {
        return { data: getUserStatusMessage(user), status: 401 };
      }
    }
    // response
    return {
      data: composeAuthUser(user, includeEmail),
      status: 200,
    };
  } catch (error) {
    logServiceError("v1/utils", "getAuthUser", error);

    return { data: "Error occurred, please try again", status: 500 };
  }
};

/**
 *
 * @param userId the user Id to find
 * @param params
 * @returns
 */
export const getPublicUser = async (
  userId?: string,
  params?: { includeEmail?: boolean }
) => {
  const { includeEmail } = params || {};
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
    if (!user) throw new AppError("User not found", 404);
    // response
    return composeAuthUser(user, includeEmail);
  } catch (error) {
    logServiceError("v1/utils", "getPublicUser", error);

    throw error;
  }
};

export const getAnalyticsDuration = (duration?: string) => {
  const date = new Date();
  if (duration === "3h") {
    return new Date(date.getTime() - 3 * 60 * 60 * 1000);
  }
  if (duration === "6h") {
    return new Date(date.getTime() - 6 * 60 * 60 * 1000);
  }
  if (duration === "12h") {
    return new Date(date.getTime() - 12 * 60 * 60 * 1000);
  }
  if (duration === "24h" || duration === "1d") {
    return new Date(date.getTime() - 24 * 60 * 60 * 1000);
  }
  if (duration === "3d") {
    return new Date(date.getTime() - 3 * 24 * 60 * 60 * 1000);
  }
  if (duration === "7d") {
    return new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (duration === "14d") {
    return new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000);
  }

  if (duration === "21d") {
    return new Date(date.getTime() - 21 * 24 * 60 * 60 * 1000);
  }

  if (duration === "30d" || duration === "1M") {
    return new Date(date.setMonth(date.getMonth() - 1));
  }

  if (duration === "3M") {
    return new Date(date.setMonth(date.getMonth() - 3));
  }

  if (duration === "6M") {
    return new Date(date.setMonth(date.getMonth() - 6));
  }

  if (duration === "9M") {
    return new Date(date.setMonth(date.getMonth() - 9));
  }

  if (duration === "12M" || duration === "1y") {
    return new Date(date.setFullYear(date.getFullYear() - 1));
  }

  if (duration === "2y") {
    return new Date(date.setFullYear(date.getFullYear() - 2));
  }
  return date;
};

export function analyticsPercentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}
