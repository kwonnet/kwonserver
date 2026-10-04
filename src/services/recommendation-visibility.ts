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

