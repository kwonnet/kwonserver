import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
vi.mock("@/utils/webpush", () => ({ default: {} }));
import { getPublicPostPreview } from "@/services/v1/posts";

const db = new PrismaClient();
const now = new Date("2040-01-04T12:00:00Z");
beforeAll(async () => {
  for (const [name, extra] of Object.entries({
    public: {}, private: { isPrivate: true }, suspended: { status: "SUSPENDED" },
    deleted: { deletedAt: new Date() }, deactivated: { deactivatedAt: new Date() },
  })) {
    await db.user.create({ data: { id: `preview-${name}`, name, username: `preview-${name}`, email: `${name}@preview.invalid`, ...extra } as any });
  }
  await db.post.create({ data: { id: "preview-allowed", userId: "preview-public", content: "Visible", type: "CONTENT", kind: "ROOT", createdAt: new Date("2040-01-02") } });
  const restricted = [
    { status: "DRAFT" }, { status: "SCHEDULED" }, { status: "REPORTED" }, { status: "DELETED" },
    { scope: "FOLLOWED" }, { scope: "VERIFIED" }, { scope: "COUNTRY" }, { scope: "MENTIONS" }, { scope: "CONTINENT" },
    { isHidden: true }, { deletedAt: new Date() }, { scheduleAt: new Date("2099-01-01") },
    { kind: "REPLY", parentId: "preview-allowed" }, { kind: "REPOST", parentId: "preview-allowed" },
    { kind: "QUOTE", parentId: "preview-allowed" }, { type: "QUIZ" }, { type: "POLL" },
    ...["private", "suspended", "deleted", "deactivated"].map(name => ({ userId: `preview-${name}` })),
  ];
  await db.post.createMany({ data: restricted.map((extra, i) => ({ id: `preview-restricted-${i}`, userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt: new Date("2040-01-02"), ...extra })) as any });
});
afterAll(async () => {
  await db.post.deleteMany({ where: { userId: { startsWith: "preview-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "preview-" } } });
  await db.$disconnect();
});

it("enforces guest visibility against PostgreSQL and immediately reflects privacy changes", async () => {
  const initial = await getPublicPostPreview(now);
  expect(initial.filter(post => post.id.startsWith("preview-")).map(post => post.id)).toEqual(["preview-allowed"]);
  expect(initial[0].author).not.toHaveProperty("email");
  await db.user.update({ where: { id: "preview-public" }, data: { isPrivate: true } });
  expect((await getPublicPostPreview(now)).filter(post => post.id.startsWith("preview-"))).toEqual([]);
  await db.user.update({ where: { id: "preview-public" }, data: { isPrivate: false } });
});

it("caps the preview and uses a deterministic order", async () => {
  const createdAt = new Date("2040-01-03");
  await db.post.createMany({ data: Array.from({ length: 25 }, (_, i) => ({
    id: `preview-page-${String(i).padStart(2, "0")}`, userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt,
  })) });
  const posts = await getPublicPostPreview(now);
  expect(posts).toHaveLength(21);
  expect(posts.map(post => post.id)).toEqual(Array.from({ length: 21 }, (_, i) => `preview-page-${String(24 - i).padStart(2, "0")}`));
});

it("prioritizes engaging recent posts over older viral posts and excludes future posts", async () => {
  await db.post.createMany({ data: [
    { id: "preview-popular", userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt: new Date("2040-01-02"), totalLikes: 50n },
    { id: "preview-fresh", userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt: now, totalLikes: 10n },
    { id: "preview-old-viral", userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt: new Date("2039-12-31"), totalLikes: 10000n },
    { id: "preview-future", userId: "preview-public", type: "CONTENT", kind: "ROOT", createdAt: new Date("2040-01-05"), totalLikes: 100000n },
  ] });
  const posts = await getPublicPostPreview(now);
  expect(posts.slice(0, 2).map(post => post.id)).toEqual(["preview-popular", "preview-fresh"]);
  expect(posts).toHaveLength(21);
  expect(posts.map(post => post.id)).not.toContain("preview-old-viral");
  expect(posts.map(post => post.id)).not.toContain("preview-future");
  await db.post.deleteMany({ where: { id: { startsWith: "preview-page-" } } });
  const fallback = await getPublicPostPreview(now);
  expect(fallback.map(post => post.id)).toContain("preview-old-viral");
  expect(fallback[0].id).toBe("preview-popular");
  expect(fallback.map(post => post.id)).not.toContain("preview-future");
});
