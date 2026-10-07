import { Prisma } from "@prisma/client";

/** Always apply against PostgreSQL when hydrating IDs; an index is not authorization. */
export function recommendationVisibility(userId: string): Prisma.PostWhereInput {
  const publicPost: Prisma.PostWhereInput = {
    status: "PUBLISHED", scope: "ANYONE", isHidden: false, deletedAt: null,
    disinterest: { none: { userId } },
    reports: { none: { userId } },
    user: {
      isPrivate: false, status: "ACTIVE", deletedAt: null, deactivatedAt: null,
      NOT: [
        { blockedUsers: { some: { blockedId: userId } } },
        { blockedBy: { some: { blockerId: userId } } },
        { mutedBy: { some: { muterId: userId } } },
      ],
    },
  };
  return {
    ...publicPost,
    kind: { in: ["ROOT", "REPOST", "QUOTE"] },
    AND: [
      { OR: [{ parentId: null }, { parent: { is: publicPost } }] },
      { OR: [{ rootId: null }, { root: { is: publicPost } }] },
    ],
  };
}

/** Notification opt-in does not grant access to an author's restricted posts. */
export function postNotificationVisibility(userId: string): Prisma.PostWhereInput {
  const follows = { some: { followerId: userId, status: 'ACCEPTED' as const } };
  const readable: Prisma.PostWhereInput = {
    status: 'PUBLISHED', deletedAt: null, isHidden: false,
    createdAt: { lte: new Date() },
    disinterest: { none: { userId } }, reports: { none: { userId } },
    AND: [
      { OR: [{ scheduleAt: null }, { scheduleAt: { lte: new Date() } }] },
      { OR: [{ scope: 'ANYONE' }, { scope: 'FOLLOWED', user: { followers: follows } }] },
    ],
    user: {
      status: { in: ['ACTIVE', 'PRIVATE'] }, deletedAt: null, deactivatedAt: null,
      OR: [{ status: 'ACTIVE', isPrivate: false }, { followers: follows }],
      NOT: [
        { blockedUsers: { some: { blockedId: userId } } },
        { blockedBy: { some: { blockerId: userId } } },
        { mutedBy: { some: { muterId: userId } } },
      ],
    },
  };
  return { AND: [readable,
    { OR: [{ parentId: null }, { parent: { is: readable } }] },
    { OR: [{ rootId: null }, { root: { is: readable } }] },
  ] };
}
