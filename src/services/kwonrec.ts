import axios from "axios";
import logger from "@/logger";
import prisma from "@/db";
import { recommendationVisibility } from "./recommendation-visibility";
export { recommendationVisibility } from "./recommendation-visibility";

/** Private service client. Never expose KWONREC_API_KEY to a browser. */
export const kwonrecClient = axios.create({
  baseURL: process.env.KWONREC_API || "http://localhost:8001",
  timeout: 1500,
  maxContentLength: 1024 * 1024,
  headers: process.env.KWONREC_API_KEY
    ? { Authorization: `Bearer ${process.env.KWONREC_API_KEY}` }
    : {},
});

export async function getRecommendationResponse(userId: string, requestedLimit: unknown, requestedPage: unknown = 1) {
  const parsed = Number(requestedLimit ?? 21);
  const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : 21;
  const parsedPage = Number(requestedPage);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
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
    logger.warn('Recommendation service unavailable or invalid; using chronological fallback');
    // Bounded, authoritative chronological fallback on timeout or service failure.
    const posts = await prisma.post.findMany({
      where: recommendationVisibility(userId),
      select: { id: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, skip: (page - 1) * limit,
    });
    return { data: { recommendations: posts.map(post => ({ id: post.id, score: 0 })), degraded: true } };
  }
}
