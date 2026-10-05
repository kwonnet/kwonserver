import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
vi.mock('@/utils/webpush', () => ({default: {}}));
vi.mock('@/cron/utils', () => ({enqueuePostTopic: vi.fn().mockResolvedValue(undefined)}));
import {PostCreateSchema} from '@/schema/post';
import {createPost, createPostReply, publishDueScheduledPosts} from '@/services/v1/posts';
const db = new PrismaClient();
const prefix = 'schedule-fixture-';
let owner: string, other: string, parent: string;
beforeAll(async () => {
 owner = (await db.user.create({data: {name: 'Scheduler', username: prefix + 'owner', email: prefix + 'owner@test.invalid'}})).id;
 other = (await db.user.create({data: {name: 'Parent', username: prefix + 'parent', email: prefix + 'parent@test.invalid'}})).id;
 parent = (await db.post.create({data: {type: 'CONTENT', kind: 'ROOT', userId: other, content: 'Original post'}})).id;
});
afterAll(async () => {await db.pollOption.deleteMany({where: {poll: {post: {userId: owner}}}}); await db.poll.deleteMany({where: {post: {userId: owner}}}); await db.post.deleteMany({where: {userId: {in: [owner, other]}}}); await db.user.deleteMany({where: {id: {in: [owner, other]}}}); await db.$disconnect();});
it('publishes due posts once, leaves future/deleted/draft posts private, and applies reply effects atomically', async () => {
 const due = await db.post.create({data: {type: 'CONTENT', kind: 'ROOT', userId: owner, status: 'SCHEDULED', scheduleAt: new Date(Date.now()-60_000), content: 'Due post'}});
 const reply = await db.post.create({data: {type: 'CONTENT', userId: owner, kind: 'REPLY', parentId: parent, status: 'SCHEDULED', scheduledEffectsPending: true, scheduleAt: new Date(Date.now()-60_000), content: 'Due reply'}});
 const future = await db.post.create({data: {type: 'CONTENT', kind: 'ROOT', userId: owner, status: 'SCHEDULED', scheduleAt: new Date(Date.now()+3600_000)}});
 const draft = await db.post.create({data: {type: 'CONTENT', kind: 'ROOT', userId: owner, status: 'DRAFT', scheduleAt: new Date(0)}});
 const deleted = await db.post.create({data: {type: 'CONTENT', kind: 'ROOT', userId: owner, status: 'SCHEDULED', scheduleAt: new Date(0), deletedAt: new Date()}});
 await Promise.all([publishDueScheduledPosts(), publishDueScheduledPosts()]);
 expect(await db.post.findUnique({where: {id: due.id}})).toMatchObject({status: 'PUBLISHED'});
 expect(await db.post.findUnique({where: {id: reply.id}})).toMatchObject({status: 'PUBLISHED', scheduledEffectsPending: false});
 expect(await db.post.findUnique({where: {id: parent}})).toMatchObject({totalReplies: 1n});
 expect(await db.notification.count({where: {postId: reply.id}})).toBe(1);
 expect(await db.post.findUnique({where: {id: future.id}})).toMatchObject({status: 'SCHEDULED'});
 expect(await db.post.findUnique({where: {id: draft.id}})).toMatchObject({status: 'DRAFT'});
 expect(await db.post.findUnique({where: {id: deleted.id}})).toMatchObject({status: 'SCHEDULED'});
 await publishDueScheduledPosts(); expect(await db.post.findUnique({where: {id: parent}})).toMatchObject({totalReplies: 1n});
});

it('creates scheduled polls relative to publication time and keeps drafts unpublished', async () => {
 const scheduleAt = new Date(Date.now() + 24 * 3600_000).toISOString();
 const thread = {content: 'Scheduled poll', type: 'POLL', scope: 'ANYONE', media: [], poll: {scope: 'NONE', isMultiVote: false, continents: [], countries: [], duration: {days: 0, hours: 1, minutes: 0}, options: [{id: 'a', text: 'First'}, {id: 'b', text: 'Second'}]}};
 const payload = PostCreateSchema.parse({thread: [thread], isDraft: false, scheduleAt});
 const result = await createPost(payload, owner);
 expect(result.status).toBe(200);
 const post = await db.post.findFirstOrThrow({where: {userId: owner, content: 'Scheduled poll'}, include: {poll: true}});
 expect(post.status).toBe('SCHEDULED');
 expect(post.poll!.expireAt.getTime()).toBe(new Date(scheduleAt).getTime() + 3600_000);
 const draft = await createPost(PostCreateSchema.parse({thread: [{content: 'Draft content', type: 'CONTENT', scope: 'ANYONE', media: []}], isDraft: true}), owner);
 expect(draft.status).toBe(200);
 expect(await db.post.findFirst({where: {userId: owner, content: 'Draft content'}})).toMatchObject({status: 'DRAFT'});
});
