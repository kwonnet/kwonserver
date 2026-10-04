import type { Prisma } from "@prisma/client";
import prisma from "@/db";

/** A bounded guest preview, never the personalized feed or an unrestricted Post include. */
export function publicPreviewQuery(now = new Date()) {
  return {
    take: 12,
    relationLoadStrategy: "join",
    where: {
      status: "PUBLISHED", scope: "ANYONE", kind: "ROOT", type: "CONTENT",
      deletedAt: null, isHidden: false, parentId: null, rootId: null,
      OR: [{ scheduleAt: null }, { scheduleAt: { lte: now } }],
      user: { isPrivate: false, status: "ACTIVE", deletedAt: null, deactivatedAt: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, content: true, createdAt: true, userId: true,
      totalLikes: true, totalReplies: true, totalReposts: true,
      user: { select: { name: true, username: true, avatar: true } },
      media: {
        take: 4, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, fileId: true, url: true, thumbnailUrl: true, fileType: true, altText: true },
      },
    },
  } satisfies Prisma.PostFindManyArgs;
}

export async function getPublicPostPreview() {
  const posts = await prisma.post.findMany(publicPreviewQuery());
  return posts.map(({ user, totalLikes, totalReplies, totalReposts, ...post }) => ({
    ...post, author: user,
    totalLikes: totalLikes.toString(), totalReplies: totalReplies.toString(),
    totalReposts: totalReposts.toString(),
  }));
}
