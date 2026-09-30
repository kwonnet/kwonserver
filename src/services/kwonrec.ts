import axios from "axios";
import prisma from "@/db";
import { Prisma } from "@prisma/client";

/** Private service client. Never expose KWONREC_API_KEY to a browser. */
export const kwonrecClient = axios.create({
  baseURL: process.env.KWONREC_API || "http://localhost:8001",
  timeout: 1500,
  maxContentLength: 1024 * 1024,
  headers: process.env.KWONREC_API_KEY
    ? { Authorization: `Bearer ${process.env.KWONREC_API_KEY}` }
    : {},
});

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

export async function getRecommendationResponse(userId: string, requestedLimit: unknown) {
  const parsed = Number(requestedLimit ?? 21);
  const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : 21;
  try {
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true }, take: 100, orderBy: { updatedAt: "desc" },
    });
    const response = await kwonrecClient.post("/v1/recommendations", {
      user_id: userId, limit,
      following_author_ids: following.map(item => item.followingId),
    });
    if (!Array.isArray(response.data?.recommendations) ||
        response.data.recommendations.some((item: unknown) =>
          !item || typeof (item as { id?: unknown }).id !== "string")) {
      throw new Error("Invalid recommendation response");
    }
    return response;
  } catch {
    // Bounded, authoritative chronological fallback on timeout or service failure.
    const posts = await prisma.post.findMany({
      where: recommendationVisibility(userId),
      select: { id: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit,
    });
    return { data: { recommendations: posts.map(post => ({ id: post.id, score: 0 })), degraded: true } };
  }
}
