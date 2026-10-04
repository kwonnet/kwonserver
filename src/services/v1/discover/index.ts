import prisma from "@/db";

export async function getTrendingTopics(
  countryId: string | null = null,
  limit: number = 20,
  minLast24Posts: number = 0
) {
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(minLast24Posts) || minLast24Posts < 0) {
      return { data: "Invalid trending limits", status: 400 };
    }
    const params: any[] = [minLast24Posts, limit];

    if (countryId) {
      params.push(countryId);
    }

    // Exact rolling windows and live visibility checks. Summing hourly distinct
    // user counts overcounts repeat authors and can retain newly private content.
    const query = `
      WITH counts AS (
        SELECT e.keyword AS trend_raw,
          COUNT(*) AS mentions,
          COUNT(DISTINCT e."postId") AS posts,
          COUNT(DISTINCT e."authorId") AS users,
          COUNT(*) FILTER (WHERE e."createdAt" >= NOW() - INTERVAL '24 hours') AS last_24_mentions,
          COUNT(DISTINCT e."postId") FILTER (WHERE e."createdAt" >= NOW() - INTERVAL '24 hours') AS last_24_posts,
          COUNT(DISTINCT e."authorId") FILTER (WHERE e."createdAt" >= NOW() - INTERVAL '24 hours') AS last_24_users,
          COUNT(DISTINCT e."postId") FILTER (WHERE e."createdAt" >= NOW() - INTERVAL '48 hours'
            AND e."createdAt" < NOW() - INTERVAL '24 hours') AS prev_24_posts
        FROM "PostTrendingEvent" e
        JOIN "Post" p ON p.id = e."postId"
        JOIN "User" u ON u.id = p."userId"
        WHERE e."createdAt" >= NOW() - INTERVAL '30 days' AND e."createdAt" <= NOW()
          AND p.status = 'PUBLISHED' AND p."deletedAt" IS NULL AND NOT p."isHidden"
          AND p.scope = 'ANYONE' AND p.kind = 'ROOT' AND p."parentId" IS NULL AND p."rootId" IS NULL
          AND (p."scheduleAt" IS NULL OR p."scheduleAt" <= NOW() AT TIME ZONE 'UTC')
          AND u.status = 'ACTIVE' AND NOT u."isPrivate" AND u."deletedAt" IS NULL AND u."deactivatedAt" IS NULL
          ${countryId ? 'AND e."countryId" = $3' : ''}
        GROUP BY e.keyword
      )
      SELECT last_24_mentions::bigint, last_24_posts::bigint, last_24_users::bigint,
        INITCAP(trend_raw) AS trend,
        CASE WHEN prev_24_posts = 0 THEN 'New'
          ELSE ROUND(((last_24_posts::numeric / prev_24_posts) - 1) * 100)::text || '%' END AS growth,
        users::bigint, posts::bigint, mentions::bigint
      FROM counts
      WHERE last_24_posts > 0 AND last_24_posts >= $1
      ORDER BY last_24_mentions DESC, last_24_posts DESC, trend_raw ASC
      LIMIT $2;
    `;

    const rawResults = await prisma.$queryRawUnsafe(query, ...params);

    // Type the results
    type TrendRow = {
      last_24_mentions: bigint;
      last_24_posts: bigint;
      last_24_users: bigint;
      trend: string;
      growth: string;
      users: bigint;
      posts: bigint;
      mentions: bigint;
    };

    const typedResults = rawResults as TrendRow[];

    // Fetch country name if specific country requested
    let countryInfo = { name: "Global", emoji: "🌍" };
    if (countryId) {
      const country = await prisma.country.findUnique({
        where: { id: countryId },
        select: { name: true, emoji: true },
      });
      if (country) {
        countryInfo = { name: country.name, emoji: country.emoji };
      } else {
        countryInfo = { name: "Unknown", emoji: "❓" };
      }
    }

    const trends = typedResults.map((row) => ({
      last_24_mentions: Number(row.last_24_mentions),
      last_24_posts: Number(row.last_24_posts),
      last_24_users: Number(row.last_24_users),
      trend: row.trend.trim(),
      growth: row.growth,
      country: countryInfo.name,
      users: Number(row.users),
      posts: Number(row.posts),
      mentions: Number(row.mentions),
    })).sort((a,b) => b.last_24_mentions - a.last_24_mentions);

    if(trends.length === 0){
      return { data: "Not found", status: 404}
    }
    return { data: trends, status: 200}
  } catch (error: any) {
    console.error("Error fetching trending topics:", error?.message ?? error);
    return { data: "Error occurred trying to get latest trends", status: 500}
  }
}
