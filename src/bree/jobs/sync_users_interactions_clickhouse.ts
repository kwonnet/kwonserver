// scripts/sync_interactions_to_clickhouse.ts
import "tsconfig-paths/register";
import {
  cleanTextContent,
  commentClassifier,
  generateEmbedding,
  retryExecution,
} from "@/utils/helpers";
import prisma from "@/db";
import logger from "@/logger";
import { clickHouseClient } from "@/db/clickhouse";
import { PostKindEnum } from "@prisma/client";

const BATCH_SIZE = 100; // reduced for debugging
const EMBED_BATCH_SIZE = 16;

interface InteractionRow {
  user_id: string;
  post_id: string;
  author_id: string;
  type: string;
  weight: number;
  label: number;
  timestamp: string;
  post_content: string;
  post_created_at: string;
  post_age_hours: number;
  post_created_hour: number;
  post_day_of_week: number;
  interaction_count: number;
  total_duration_seconds?: number;
}

async function fetchPaginated<T>(
  queryFn: (params: { skip: number; take: number }) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  while (true) {
    const batch = await queryFn({ skip, take: BATCH_SIZE });
    if (batch.length === 0) break;
    results.push(...batch);
    skip += batch.length;
    logger.info(`Fetched ${skip} rows from this source`);
  }
  return results;
}

async function getLastSyncTime(): Promise<Date> {
  try {
    const result = await clickHouseClient.query({
      query: `SELECT * FROM sync_timestamp WHERE kind = 'interactions'`,
      format: "JSONEachRow",
    });
    const rows = await result.json<{ sync_at: string }>();
    const ts = rows[0]?.sync_at;
    if (ts && ts !== "1970-01-01T00:00:00.000Z") {
      return new Date(ts);
    }
  } catch (err) {
    logger.warn(
      "sync_timestamp table missing or empty — starting from 7 days ago"
    );
  }
  // TEMP: Force recent data for testing
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function upsertSyncTimestamp(kind: string) {
  const exists = await clickHouseClient
    .query({
      query: `SELECT 1 FROM sync_timestamp WHERE kind = {kind: String} LIMIT 1`,
      query_params: { kind },
    })
    .then((res) => res.json())
    .then((data) => data.data.length > 0);

  if (exists) {
    await clickHouseClient.command({
      query: `ALTER TABLE sync_timestamp UPDATE sync_at = now64(3) WHERE kind = {kind: String}`,
      query_params: { kind },
    });
  } else {
    await clickHouseClient.command({
      query: `INSERT INTO sync_timestamp (kind, sync_at) VALUES ({kind: String}, now64(3))`,
      query_params: { kind },
    });
  }
}

async function syncUsersInteractionsToClickHouse() {
  try {
    logger.info("=== STARTING INTERACTIONS SYNC ===");

    const LAST_SYNC = await getLastSyncTime();
    logger.info(`Looking for interactions since: ${LAST_SYNC.toISOString()}`);

    const allInteractions: InteractionRow[] = [];

    // Helper — clean and safe
    const addInteraction = (
      userId: string,
      postId: string,
      authorId: string,
      type: string,
      weight: number,
      timestamp: Date,
      postContent: string,
      postCreatedAt: Date
    ) => {
      allInteractions.push({
        user_id: userId,
        post_id: postId,
        author_id: authorId,
        type,
        weight,
        label: weight >= 0.5 ? 1 : 0,
        timestamp: timestamp.toISOString(),
        post_content: cleanTextContent(postContent),
        post_created_at: postCreatedAt.toISOString(),
        post_age_hours: Number(((Date.now() - postCreatedAt.getTime()) / 3600000).toFixed(2)),
        post_created_hour: postCreatedAt.getHours(),
        post_day_of_week: postCreatedAt.getDay(),
        interaction_count: 0,
      });
    };

    // === 1. Strong positives (money & virality first) ===
    logger.info("1. Fetching money & viral signals...");

    // Tips — money = king
    const tips = await fetchPaginated(({ skip, take }) => prisma.postTip.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { senderId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const t of tips) if (t.post?.content) addInteraction(t.senderId, t.postId!, t.post.userId!, "tip", 13.5, t.createdAt, t.post.content, t.post.createdAt);

    // Shares
    const shares = await fetchPaginated(({ skip, take }) => prisma.postShare.findMany({
      where: { createdAt: { gte: LAST_SYNC }, userId: { not: null } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const s of shares) if (s.post?.content) addInteraction(s.userId!, s.postId!, s.post.userId!, "share", 6.5, s.createdAt, s.post.content, s.post.createdAt);

    // Bookmarks
    const bookmarks = await fetchPaginated(({ skip, take }) => prisma.bookmark.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true } } },
    }));
    for (const b of bookmarks) if (b.post?.content) addInteraction(b.userId, b.postId, b.post.userId!, "bookmark", 7.0, b.createdAt, b.post.content, b.post.createdAt);

    // Likes
    const likes = await fetchPaginated(({ skip, take }) => prisma.likedPost.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const l of likes) if (l.post?.content) addInteraction(l.userId, l.postId, l.post.userId!, "like", 5.5, l.createdAt, l.post.content, l.post.createdAt);

    // Clicks
    const clicks = await fetchPaginated(({ skip, take }) => prisma.postClick.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const c of clicks) if (c.post?.content) addInteraction(c.userId!, c.postId!, c.post.userId!, "click", 2.3, c.createdAt, c.post.content, c.post.createdAt);

    // === 2. Replies + Quotes + Reposts (with toxicity-aware reply boost) ===
    logger.info("2. Fetching replies, reposts, quotes + toxicity analysis...");
    const childPosts = await fetchPaginated(({ skip, take }) => prisma.post.findMany({
      where: {
        createdAt: { gte: LAST_SYNC },
        parentId: { not: null },
        kind: { in: [PostKindEnum.REPLY, PostKindEnum.REPOST, PostKindEnum.QUOTE] },
      },
      skip, take,
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        parentId: true,
        kind: true,
        content: true,
        createdAt: true,
        parent: { select: { content: true, createdAt: true, userId: true} },
      },
    }));

    logger.info(`→ Found ${childPosts.length} child posts`);

    for (const post of childPosts) {
      if (!post.parent?.content) continue;

      let type: string;
      let weight = 0;

      switch (post.kind) {
        case PostKindEnum.QUOTE:
          type = "quote";
          weight = 9.5;
          break;

        case PostKindEnum.REPOST:
          type = "repost";
          weight = 7.6;
          break;

        case PostKindEnum.REPLY:
          type = "reply";
          weight = 8.5; // base

          const text = cleanTextContent(post.content || "");
          if (text.length >= 5) {
            let toxicityScore = 0.5;
            try {
              const result = await commentClassifier(text);
              toxicityScore = result.score; // 0.0 = clean, 1.0 = very toxic
            } catch (err) {
              logger.warn("Toxicity classifier failed", err);
            }

            const cleanliness = 1.0 - toxicityScore;
            const lengthBonus = Math.min(text.length / 120, 1.0) * 4.0; // max +4.0
            const cleanBonus = cleanliness * 4.0;                     // max +4.0

            weight = 4.0 + lengthBonus + cleanBonus;

            // Strong toxicity → penalty
            if (toxicityScore > 0.7) {
              weight -= (toxicityScore - 0.7) * 30; // max -9.0
            }

            weight = Math.max(-10.0, Math.min(12.0, weight)); // sane caps
          } else {
            weight = 1.5; // "k", "lol"
          }
          break;

        default:
          continue;
      }

      addInteraction(post.userId, post.parentId!, post.parent.userId!, type, weight, post.createdAt, post.parent.content, post.parent.createdAt);
    }

    // Long views
    const longViews = await fetchPaginated(({ skip, take }) => prisma.postView.findMany({
      where: { timestamp: { gte: LAST_SYNC }, duration: { gt: 30 } },
      skip, take,
      select: { userId: true, postId: true, duration: true, timestamp: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const v of longViews) {
      if (!v.post?.content) continue;
      const dwellBonus = Math.min(v.duration / 120, 1) * 2.0;
      addInteraction(v.userId!, v.postId, v.post.userId!, "view", 1.5 + dwellBonus, v.timestamp, v.post.content, v.post.createdAt);
    }

    // === 3. Hard negatives ===
    logger.info("3. Fetching hard negatives...");

    const reports = await fetchPaginated(({ skip, take }) => prisma.postReport.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const r of reports) if (r.post?.content) addInteraction(r.userId, r.postId!, r.post.userId!, "report", -15.0, r.createdAt, r.post.content, r.post.createdAt);

    const dislikes = await fetchPaginated(({ skip, take }) => prisma.postDisinterest.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));
    for (const d of dislikes) if (d.post?.content) addInteraction(d.userId!, d.postId!, d.post.userId!, "dislike", -8.0, d.createdAt, d.post.content, d.post.createdAt);

    // === 4. Impressions (weak positive) ===
    logger.info("4. Adding impressions...");
    const positiveIds = new Set(allInteractions.map(i => i.post_id));

    const impressions = await fetchPaginated(({ skip, take }) => prisma.postImpression.findMany({
      where: { createdAt: { gte: LAST_SYNC } },
      skip, take,
      select: { userId: true, postId: true, createdAt: true, post: { select: { content: true, createdAt: true, userId: true} } },
    }));

    let impCount = 0;
    for (const i of impressions) {
      if (positiveIds.has(i.postId)) continue;
      if (!i.post?.content) continue;
      addInteraction(i.userId!, i.postId, i.post.userId!, "impression", 0.1, i.createdAt, i.post.content, i.post.createdAt);
      if (++impCount >= allInteractions.length * 4) break;
    }

    logger.info(`Total raw interactions: ${allInteractions.length}`);

    // === 5. Smart Aggregation (final fix) ===
    const aggregated = new Map<string, InteractionRow>();

    for (const row of allInteractions) {
      const key = `${row.user_id}-${row.post_id}`;
      let e = aggregated.get(key);

      if (!e) {
        e = { ...row, weight: 0, interaction_count: 0 };
        aggregated.set(key, e);
      }

      const w = {
        tip: 13.5, quote: 9.5, repost: 7.6, share: 6.5, bookmark: 7.0,
        reply: row.weight, // already computed with toxicity
        like: 5.5, click: 2.3, view: 3.5, impression: 0.1,
        report: -15, dislike: -8,
      }[row.type] ?? row.weight;

      // --- NEW LOGIC: Negative Weight Precedence ---
      const negativeSignals = ["report", "dislike"];

      if (negativeSignals.includes(row.type)) {
        // If the current interaction is a negative signal,
        // it immediately becomes the new aggregated weight if it's lower (more negative).
        // This takes precedence over all other logic.
        if (w < e.weight) {
             e.weight = w;
        }
      } 
      // --- END NEW LOGIC ---

      // --- ORIGINAL LOGIC (for non-negative signals) ---
      else if (["quote", "repost", "bookmark", "like", "reply", "tip", "share"].includes(row.type)) {
        // One-time/High-value signals: strongest wins
        // This logic is now only applied to positive/neutral one-time signals
        if (w > e.weight) e.weight = w;
      }
      else { 
        // Repeatable/Low-value signals: small boost (view, click, impression)
        // Note: For repeatable signals like 'view', you might want straight summation instead of this min/max logic.
        if (w > e.weight) e.weight = w;
        else e.weight = Math.min(e.weight + w * 0.2, w * 1.5);
      }
      // --- END ORIGINAL LOGIC ---

      e.interaction_count++;
      if (row.timestamp > e.timestamp) e.timestamp = row.timestamp;
    }

    const finalInteractions = Array.from(aggregated.values());
    logger.info(`After aggregation: ${finalInteractions.length} unique user-post pairs`);

    if (finalInteractions.length === 0) {
      await upsertSyncTimestamp("interactions");
      return;
    }

    // === 6. Embedding + Insert (unchanged, but safe) ===
    const rowsForInsert = [];
    for (let i = 0; i < finalInteractions.length; i += EMBED_BATCH_SIZE) {
      const batch = finalInteractions.slice(i, i + EMBED_BATCH_SIZE);
      const embedded = await Promise.all(
        batch.map(async (row) => {
          try {
            const embedding = await generateEmbedding(row.post_content);
            const { post_content, ...rest } = row;
            return { ...rest, embedding, timestamp: new Date(rest.timestamp), post_created_at: new Date(rest.post_created_at) };
          } catch (e) {
            logger.error(`Embedding failed for post ${row.post_id}`, e);
            return null;
          }
        })
      );
      rowsForInsert.push(...embedded.filter(Boolean));
    }

    if (rowsForInsert.length > 0) {
      for (let i = 0; i < rowsForInsert.length; i += 5) {
        await clickHouseClient.insert({
          table: "interactions",
          values: rowsForInsert.slice(i, i + 5),
          format: "JSONEachRow",
        });
      }
      await upsertSyncTimestamp("interactions");
      logger.info(`SUCCESS: Synced ${rowsForInsert.length} interactions`);
    }
  } catch (error: any) {
    logger.error("Sync failed", error?.message);
    throw error;
  }
}

// Run
(async () => {
  try {
    await syncUsersInteractionsToClickHouse();
    logger.info("Sync finished");
    process.exit(0);
  } catch (err: any) {
    logger.error(`FATAL: ${err?.message}`);
    process.exit(0);
  }
})();

