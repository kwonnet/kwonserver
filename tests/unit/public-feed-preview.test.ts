import { beforeEach, expect, it, vi } from "vitest";
import { response } from "./fixtures";
const db = vi.hoisted(() => ({ post: { findMany: vi.fn() } }));
vi.mock("@/db", () => ({ default: db }));
import { publicPreviewQuery, getPublicPostPreview } from "@/services/v1/posts/public-preview";
import { getPublicPostPreviewController } from "@/controllers/v1/posts/public-preview";

beforeEach(() => { db.post.findMany.mockReset(); });

it("only reads published, unhidden, public root posts from active public accounts", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  expect(publicPreviewQuery(now).where).toEqual({
    status: "PUBLISHED", scope: "ANYONE", kind: "ROOT", type: "CONTENT",
    deletedAt: null, isHidden: false, parentId: null, rootId: null,
    createdAt: { gte: new Date("2026-10-01T00:00:00Z"), lte: now },
    OR: [{ scheduleAt: null }, { scheduleAt: { lte: now } }],
    user: { isPrivate: false, status: "ACTIVE", deletedAt: null, deactivatedAt: null },
  });
});

it("projects only preview fields, never credentials, relationships, transactions, metadata or quiz answers", () => {
  const query = publicPreviewQuery();
  expect(Object.keys(query.select).sort()).toEqual([
    "content", "createdAt", "id", "media", "totalBookmarks", "totalImpressions", "totalLikes", "totalQuotes", "totalReplies", "totalReposts", "totalShares", "totalTips", "totalViews", "user", "userId",
  ]);
  expect(query.select.user).toEqual({ select: { id: true, name: true, username: true, avatar: true } });
  expect(Object.keys(query.select.media.select).sort()).toEqual(["altText", "fileId", "fileType", "height", "id", "thumbnailUrl", "url", "width"]);
  expect(query.take).toBe(21);
  expect(query.select.media.take).toBe(4);
});

it("serializes large counters safely and returns no personalized feed state", async () => {
  db.post.findMany.mockResolvedValueOnce([{ id: "post", content: "Hello", user: { name: "Ada", username: "ada", avatar: null },
    media: [], totalLikes: 9007199254740993n, totalReplies: 1n, totalReposts: 0n, totalQuotes: 0n, totalShares: 0n, totalBookmarks: 0n, totalImpressions: 0n, totalTips: 0n, totalViews: 0n }]).mockResolvedValueOnce([]);
  const posts = await getPublicPostPreview();
  expect(posts[0].totalLikes).toBe("9007199254740993");
  expect(posts[0].author.username).toBe("ada");
  expect(posts[0]).not.toHaveProperty("user");
  expect(() => JSON.stringify(posts)).not.toThrow();
});

it("ignores arbitrary paging and user input, and does not need an authenticated user", async () => {
  db.post.findMany.mockResolvedValue([]);
  const res = response();
  await getPublicPostPreviewController({ query: { limit: "999999", page: "40", userId: "victim", scope: "FOLLOWED" } } as any, res);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual([]);
  expect(res.headers["Cache-Control"]).toBe("no-store");
  expect(db.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21, where: expect.objectContaining({ scope: "ANYONE" }) }));
});

it("does not expose database errors on the public endpoint", async () => {
  db.post.findMany.mockRejectedValue(new Error("database password and internal host"));
  const res = response();
  await getPublicPostPreviewController({} as any, res);
  expect(res.statusCode).toBe(503);
  expect(JSON.stringify(res.body)).not.toContain("password");
});

it("ranks the last 72 hours by engagement and uses disjoint older fallback only to fill the limit", async () => {
  const now = new Date("2026-10-04T12:00:00Z");
  expect(publicPreviewQuery(now).orderBy).toEqual([
    { totalLikes: "desc" }, { totalReplies: "desc" }, { totalReposts: "desc" }, { totalShares: "desc" }, { createdAt: "desc" }, { id: "desc" },
  ]);
  db.post.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await getPublicPostPreview(now);
  expect(db.post.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
    take: 21, where: expect.objectContaining({ createdAt: { lt: new Date("2026-10-01T12:00:00Z") }, scope: "ANYONE", isHidden: false }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }));
});
