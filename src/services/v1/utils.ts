import { AuthUser, FeedPost } from "@/types";
import { UserConnection, UserPublic } from "@/types/user";
import { PostScopeEnum, PostTypeEnum, ScopeEnum, SubStatusEnum } from "@prisma/client";

// const composerUser = (user: Partial<PrismaUser>) => {
//       return {
//         id: user.id!,
//         username: user.username!,
//         name: user.name!,
//         bio: user.bio!,
//         avatar: user.avatar!,
//         role: user.role!,
//         userType: user.userType!,
//         meta: {
//           ...user.meta!,
//           isPro: !!subscription,
//           isLegacy: user.accountVerified!,
//           isActive: statuses.includes(String(user?.meta?.status)),
//         },
//       };
//     };
export const composePublicUser = (user: any): UserPublic => {
      const subscription = user?.subscriptions[0];
      const statuses = [
        SubStatusEnum.ACTIVE,
        SubStatusEnum.TRIAL,
        SubStatusEnum.PAYMENT_ERROR,
      ] as string[];
      return {
        id: user.id,
        avatar: user.avatar,
        username: user.username,
        name: user.name,
        role: user.role,
        userType: user.userType,
        bio: user?.bio,
        meta: {
          ...user.meta,
          isPro: !!subscription,
          isLegacy: user.accountVerified ||  user?.verified,
          isActive: statuses.includes(String(user.meta?.status)),
        },
      };
}

export function convertBigInts(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  for (const key in obj) {
    if (typeof obj[key] === "bigint") {
      obj[key] = Number(obj[key]);
    } else if (typeof obj[key] === "object") {
      obj[key] = convertBigInts(obj[key]);
    }
  }
  return obj;
}


export const composePostAuthor = (user: any) => {
  const subscription = user?.subscriptions[0];
  const statuses = [
    SubStatusEnum.ACTIVE,
    SubStatusEnum.TRIAL,
    SubStatusEnum.PAYMENT_ERROR,
  ] as string[];
  return {
    id: user.id,
    avatar: user.avatar,
    username: user.username,
    role: user.role,
    name: user.name,
    userType: user.userType,
    country: user.country,
    bio: user.bio,
    conn: {
      isFollowed: user?.followers?.length > 0, // whether the current user follows the author
      isFollowing: user?.following?.length > 0, // whether the author is following the user
    },
    meta: {
      ...user.meta,
      isPro: !!subscription,
      isLegacy: user.isVerified,
      isActive: statuses.includes(String(user.meta?.status)),
    },
  };
};


export const removeProperty = <T extends object, K extends keyof T>(
  obj: T,
  key: K
): Omit<T, K> => {
  const { [key]: _, ...rest } = obj;
  return rest as Omit<T, K>;
};

export function checkExpiryTime(targetDate: Date | string) {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const difference = target - now;

  return difference <= 0 ? true : false;
}


export function checkPollPermissions(post: FeedPost, user?: AuthUser): FeedPost {
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

export function checkQuizPermissions(post: FeedPost, user?: AuthUser): FeedPost {
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
  userCanReply: boolean,
  user?: AuthUser
): FeedPost {
  const checkCanReply = (_post: FeedPost): FeedPost => {
    const canHideReply = _post?.root ? _post.root?.userId === user?.id : _post.userId === user?.id
    const scope = _post?.root?.scope || _post.scope;
    let canReply = false;
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
          // canReply = _post?.author?.conn?.isFollowing
          canReply = userCanReply;
          break;
        case PostScopeEnum.MENTIONS:
          const isMentioned =
            _post.tagUsers?.some((u) => u.id === user?.id) ||
            _post.mentions?.some((u) => u.id === user?.id);
          canReply = !!isMentioned;
          break;
      }
    }

    return { ..._post, scope, actions: { ..._post.actions, canReply, canHideReply } };
  };

  return {
    ...checkCanReply(post),
    parent: post.parent ? checkCanReply(post.parent) : undefined,
    replies: post.replies?.map((reply) => checkCanReply(reply)) || [],
    thread: post.thread?.map((threadPost) => checkCanReply(threadPost)) || [],
  };
}

export const transformPost = (
  post: any,
  userCanReply: boolean,
  user?: AuthUser
): FeedPost => {
  const {
    likes = [],
    bookmarks = [],
    parentChain = [],
    thread = [],
    replies = [],
    reposts = [],
    user: postUser,
    ...rest
  } = post;

  // First transform the core post
  let transformed: FeedPost = {
    ...rest,
    parentChain,
    totalHiddenReplies: rest?._count?.replies ?? 0,
    author: composePostAuthor(postUser),
    actions: {
      hasReposted: reposts.length > 0,
      hasLiked: likes.length > 0,
      hasSaved: bookmarks.length > 0
    },
  };

  if (transformed?.parent) {
    transformed.parent = transformPost(transformed.parent, userCanReply, user);
  }
  // Then transform nested fields recursively
  if (parentChain.length > 0) {
    transformed.parentChain = parentChain.map((p: any) =>
      transformPost(p, userCanReply, user)
    );
  }

  if (thread.length > 0) {
    transformed.thread = thread.map((p: any) =>
      transformPost(p, userCanReply, user)
    );
  }

  if (replies.length > 0) {
    transformed.replies = replies.map((p: any) =>
      transformPost(p, userCanReply, user)
    );
  }

  // Apply permission checks to the whole transformed post
  transformed = checkPollPermissions(transformed, user);
  transformed = checkQuizPermissions(transformed, user);
  transformed = checkReplyPermissions(transformed, userCanReply, user);

  return transformed;
};

// export const transformManyPost = (
//   posts: any[],
//   userCanReply: boolean,
//   user?: AuthUser
// ): FeedPost => {
//   const {
//     likes = [],
//     bookmarks = [],
//     parentChain = [],
//     thread = [],
//     replies = [],
//     reposts = [],
//     user: postUser,
//     ...rest
//   } = post;

//   // First transform the core post
//   let transformed: FeedPost = {
//     ...rest,
//     parentChain,
//     author: composePostAuthor(postUser),
//     actions: {
//       hasReposted: reposts.length > 0,
//       hasLiked: likes.length > 0,
//       hasSaved: bookmarks.length > 0,
//     },
//   };

//   if (transformed?.parent) {
//     transformed.parent = transformPost(transformed.parent, userCanReply, user);
//   }
//   // Then transform nested fields recursively
//   if (parentChain.length > 0) {
//     transformed.parentChain = parentChain.map((p: any) =>
//       transformPost(p, userCanReply, user)
//     );
//   }

//   if (thread.length > 0) {
//     transformed.thread = thread.map((p: any) =>
//       transformPost(p, userCanReply, user)
//     );
//   }

//   if (replies.length > 0) {
//     transformed.replies = replies.map((p: any) =>
//       transformPost(p, userCanReply, user)
//     );
//   }

//   // Apply permission checks to the whole transformed post
//   transformed = checkPollPermissions(transformed, user);
//   transformed = checkQuizPermissions(transformed, user);
//   transformed = checkReplyPermissions(transformed, userCanReply, user);

//   return transformed;
// };