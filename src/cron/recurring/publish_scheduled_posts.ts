import { publishDueScheduledPosts } from '@/services/v1/posts';
export async function run() { await publishDueScheduledPosts(); }
