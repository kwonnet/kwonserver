import {POST_TOPIC_MODEL_VERSION} from '../helpers';
import prisma from '@/db';
import { postTopicQueue } from '../jobs/queue';
import { enqueuePostTopic } from '../utils';
// Rotate through bounded pages so failures in older posts cannot starve new posts.
let afterId: string | undefined;
export async function run() {
  const counts = await postTopicQueue.getJobCounts('waiting', 'prioritized', 'active', 'delayed');
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) >= 500) return;
  const posts = await prisma.post.findMany({
    where: { OR: [{topic: null}, {topicModel: null}, {topicModel: {not: POST_TOPIC_MODEL_VERSION}}], deletedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED'] }, ...(afterId ? { id: { gt: afterId } } : {}) },
    select: { id: true, content: true }, orderBy: { id: 'asc' }, take: 50,
  });
  if (!posts.length) { afterId = undefined; return; }
  for (const post of posts) await enqueuePostTopic(post.id, post.content, 10);
  afterId = posts.at(-1)!.id;
}
