import prisma from "@/db";
import { prismaAnalytics } from "@/db/timescaleDb";
import { Prisma } from "@prisma/client";


// export async function getTrendingTopics(
//   countryCode: string | null = null,
//   limit: number = 20,
//   minLast24Posts: number = 8
// ) {
//   try {
//     let sql = `
//     WITH last_30_days AS (
//         SELECT
//             COALESCE(p.country_code, 'global') AS country_code,
//             LOWER(ng.ngram) AS trend_raw,
//             COUNT(DISTINCT p.id) AS total_posts_30d,
//             COUNT(DISTINCT p.author_id) AS unique_users_30d
//         FROM posts p
//         CROSS JOIN LATERAL (
//             SELECT unnest(content_unigrams) AS ngram WHERE content_unigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_bigrams) WHERE content_bigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_trigrams) WHERE content_trigrams IS NOT NULL
//         ) AS ng
//         WHERE p.created_at >= NOW() - INTERVAL '30 days'
//           AND ng.ngram IS NOT NULL
//           AND LENGTH(ng.ngram) >= 3
//         GROUP BY country_code, trend_raw
//     ),
//     last_24_hours AS (
//         SELECT
//             COALESCE(p.country_code, 'global') AS country_code,
//             LOWER(ng.ngram) AS trend_raw,
//             COUNT(DISTINCT p.id) AS posts_last_24h,
//             COUNT(DISTINCT p.author_id) AS users_last_24h
//         FROM posts p
//         CROSS JOIN LATERAL (
//             SELECT unnest(content_unigrams) AS ngram WHERE content_unigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_bigrams) WHERE content_bigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_trigrams) WHERE content_trigrams IS NOT NULL
//         ) AS ng
//         WHERE p.created_at >= NOW() - INTERVAL '24 hours'
//           AND ng.ngram IS NOT NULL
//           AND LENGTH(ng.ngram) >= 3
//         GROUP BY country_code, trend_raw
//     ),
//     previous_24_hours AS (
//         SELECT
//             COALESCE(p.country_code, 'global') AS country_code,
//             LOWER(ng.ngram) AS trend_raw,
//             COUNT(*) AS posts_prev_24h
//         FROM posts p
//         CROSS JOIN LATERAL (
//             SELECT unnest(content_unigrams) AS ngram WHERE content_unigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_bigrams) WHERE content_bigrams IS NOT NULL
//             UNION ALL
//             SELECT unnest(content_trigrams) WHERE content_trigrams IS NOT NULL
//         ) AS ng
//         WHERE p.created_at >= NOW() - INTERVAL '48 hours'
//           AND p.created_at < NOW() - INTERVAL '24 hours'
//           AND ng.ngram IS NOT NULL
//         GROUP BY country_code, trend_raw
//     ),
//     combined AS (
//         SELECT
//             COALESCE(l24.country_code, l30.country_code) AS country_code,
//             COALESCE(l24.trend_raw, l30.trend_raw) AS trend_raw,
//             COALESCE(l24.posts_last_24h, 0) AS last_24,
//             COALESCE(l24.users_last_24h, 0) AS users_last_24,
//             COALESCE(l30.total_posts_30d, 0) AS total_count,
//             COALESCE(l30.unique_users_30d, 0) AS total_users,
//             COALESCE(p.posts_prev_24h, 0) AS prev_24
//         FROM last_24_hours l24
//         FULL OUTER JOIN last_30_days l30 
//           ON l24.country_code = l30.country_code AND l24.trend_raw = l30.trend_raw
//         LEFT JOIN previous_24_hours p 
//           ON COALESCE(l24.trend_raw, l30.trend_raw) = p.trend_raw 
//          AND COALESCE(l24.country_code, l30.country_code) = p.country_code
//     )
//     SELECT
//         country_code,
//         INITCAP(trend_raw) AS trend,
//         total_count,
//         last_24,
//         users_last_24 AS users,
//         CASE 
//             WHEN prev_24 = 0 THEN 'New'
//             ELSE ROUND(((last_24::float / prev_24) - 1) * 100)::text || '%'
//         END AS growth
//     FROM combined
//     WHERE last_24 >= $1
//       AND (
//         trend_raw ~ ' [a-z]+'  -- multi-word
//         OR
//         (
//           trend_raw !~ ' ' 
//           AND LENGTH(trend_raw) >= 2  -- <-- allow "ye", "pop"
//           AND LOWER(trend_raw) NOT IN ('the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'just', 'what', 'when', 'why', 'how', 'you', 'are', 'was', 'is', 'in', 'of', 'to', 'on', 'at', 'by', 'an', 'a', 'it', 'i', 'my', 'your', 'his', 'her', 'they', 'we', 'he', 'she', 'me', 'us', 'him', 'be', 'do', 'no', 'so', 'up', 'out', 'if', 'or', 'as', 'but', 'not', 'all', 'can', 'get', 'one', 'now', 'see', 'know', 'go', 'say', 'think', 'back', 'year', 'day', 'time', 'like', 'new', 'good')
//         )
//       )
//       AND LOWER(trend_raw) NOT LIKE '% the %'
//       AND LOWER(trend_raw) NOT LIKE '% and %'
//   `;

//   const params: any[] = [minLast24Posts, limit];

//   if (countryCode) {
//     sql += `\n      AND country_code = $${params.length + 1}`;
//     params.push(countryCode.toUpperCase());
//   }

//   sql += `
//     ORDER BY last_24 DESC, total_count DESC
//     LIMIT $2;
//   `;

//   const rawResults = await prismaAnalytics.$queryRawUnsafe(sql, ...params);

//   const result = (rawResults as any[]).map(row => ({
//     total_count: Number(row.total_count),
//     last_24: Number(row.last_24),
//     trend: row.trend,
//     growth: row.growth,
//     country: row.country_code === 'global' ? 'Global' : row.country_code === 'NG' ? 'Nigeria' : row.country_code,
//     users: Number(row.users)
//   }));
//   return { data: result, status: 200}
//   } catch (error) {
//     return { data: "Error occurred trying to get latest trends", status: 500}
//   }
// }

export async function getTrendingTopics(
  countryId: string | null = null,
  limit: number = 20,
  minLast24Posts: number = 0
) {
  try {
    // Build the country filter condition
    let countryWhereClause = "";
    const params: any[] = [minLast24Posts, limit];

    if (countryId) {
      countryWhereClause = `AND country_id = $${params.length + 1}`;
      params.push(countryId);
    }
    // If country is null, we include ALL (no filter on country_id)

    const query = `
      WITH last_30_days AS (
        SELECT
          "country",
          keyword AS trend_raw,
          SUM(mentions) AS mentions,
          SUM(unique_posts) AS posts,
          SUM(unique_users) AS users
        FROM trending_keywords_daily
        WHERE bucket >= NOW() - INTERVAL '30 days'
        GROUP BY "country", keyword
      ),
      last_24_hours AS (
        SELECT
          "country",
          keyword AS trend_raw,
          SUM(mentions) AS last_24_mentions,
          SUM(unique_posts) AS last_24_posts,
          SUM(unique_users) AS last_24_users
        FROM trending_keywords_hourly
        WHERE bucket >= NOW() - INTERVAL '24 hours'
        GROUP BY "country", keyword
      ),
      previous_24_hours AS (
        SELECT
          "country",
          keyword AS trend_raw,
          SUM(unique_posts) AS prev_24_posts
        FROM trending_keywords_hourly
        WHERE bucket >= NOW() - INTERVAL '48 hours'
          AND bucket < NOW() - INTERVAL '24 hours'
        GROUP BY "country", keyword
      ),
      combined AS (
        SELECT
          COALESCE(l24."country", l30."country") AS country_id,
          COALESCE(l24.trend_raw, l30.trend_raw) AS trend_raw,
          COALESCE(l24.last_24_mentions, 0) AS last_24_mentions,
          COALESCE(l24.last_24_posts, 0) AS last_24_posts,
          COALESCE(l24.last_24_users, 0) AS last_24_users,
          COALESCE(l30.mentions, 0) AS mentions,
          COALESCE(l30.posts, 0) AS posts,
          COALESCE(l30.users, 0) AS users,
          COALESCE(p.prev_24_posts, 0) AS prev_24_posts
        FROM last_24_hours l24
        FULL OUTER JOIN last_30_days l30
          ON l24."country" IS NOT DISTINCT FROM l30."country"
          AND l24.trend_raw = l30.trend_raw
        LEFT JOIN previous_24_hours p
          ON COALESCE(l24.trend_raw, l30.trend_raw) = p.trend_raw
          AND COALESCE(l24."country", l30."country") IS NOT DISTINCT FROM p."country"
      )
      SELECT
        last_24_mentions::bigint AS last_24_mentions,
        last_24_posts::bigint AS last_24_posts,
        last_24_users::bigint AS last_24_users,
        INITCAP(trend_raw) AS trend,
        CASE
          WHEN prev_24_posts = 0 THEN 'New'
          ELSE ROUND(((last_24_posts::float / prev_24_posts) - 1) * 100)::text || '%'
        END AS growth,
        country_id,
        users::bigint AS users,
        posts::bigint AS posts,
        mentions::bigint AS mentions
      FROM combined
      WHERE last_24_posts >= $1
        ${countryWhereClause}
      ORDER BY last_24_posts DESC
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
      country_id: string | null;
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

    const result = {
      trends,
      country: countryInfo,
      metadata: {
        generatedAt: new Date().toISOString(),
        limit,
        minLast24Posts,
        scope: countryId ? "country" : "global",
        totalReturned: trends.length,
      },
    };
    console.log(result)
    if(trends.length === 0){
      return { data: "Not found", status: 404}
    }
    return { data: trends, status: 200}
  } catch (error: any) {
    console.error("Error fetching trending topics:", error?.message ?? error);
    return { data: "Error occurred trying to get latest trends", status: 500}
  }
}










