import type { Prisma } from "@prisma/client";
import prisma from "@/db";

export const PUBLIC_PREVIEW_LIMIT = 21;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Public, recent posts ordered by real engagement; never personalized relations. */
export function publicPreviewQuery(now = new Date(), older = false, take = PUBLIC_PREVIEW_LIMIT) {
  const cutoff = new Date(now.getTime() - THREE_DAYS_MS);
  return {
    take,
    relationLoadStrategy: "join",
    where: {
      status: "PUBLISHED", scope: "ANYONE", kind: "ROOT", type: "CONTENT",
      deletedAt: null, isHidden: false, parentId: null, rootId: null,
      createdAt: older ? { lt: cutoff } : { gte: cutoff, lte: now },
      OR: [{ scheduleAt: null }, { scheduleAt: { lte: now } }],
      user: { isPrivate: false, status: "ACTIVE", deletedAt: null, deactivatedAt: null },
    },
    orderBy: older
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : [{ totalLikes: "desc" }, { totalReplies: "desc" }, { totalReposts: "desc" }, { totalShares: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, content: true, createdAt: true, userId: true,
      totalLikes: true, totalReplies: true, totalReposts: true, totalQuotes: true,
      totalShares: true, totalBookmarks: true, totalImpressions: true, totalTips: true, totalViews: true,
      user: { select: { id: true, name: true, username: true, avatar: true } },
      media: {
        take: 4, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, fileId: true, url: true, thumbnailUrl: true, fileType: true, altText: true, width: true, height: true },
      },
    },
  } satisfies Prisma.PostFindManyArgs;
}

export async function getPublicPostPreview(now = new Date()) {
  const posts = await prisma.post.findMany(publicPreviewQuery(now));
  // Small/new communities should still have a full preview. Only fill from older
  // public posts after recent ones; the identical visibility filter applies.
  if (posts.length < PUBLIC_PREVIEW_LIMIT) {
    posts.push(...await prisma.post.findMany(publicPreviewQuery(now, true, PUBLIC_PREVIEW_LIMIT - posts.length)));
  }
  return posts.map(({ user, totalLikes, totalReplies, totalReposts, totalQuotes, totalShares,
    totalBookmarks, totalImpressions, totalTips, totalViews, ...post }) => ({
    ...post, author: user,
    totalLikes: totalLikes.toString(), totalReplies: totalReplies.toString(), totalReposts: totalReposts.toString(),
    totalQuotes: totalQuotes.toString(), totalShares: totalShares.toString(), totalBookmarks: totalBookmarks.toString(),
    totalImpressions: totalImpressions.toString(), totalTips: totalTips.toString(), totalViews: totalViews.toString(),
  }));
}
