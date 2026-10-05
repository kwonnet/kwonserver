import { beforeEach, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ findMany: vi.fn(), enqueue: vi.fn(), counts: vi.fn() }));
vi.mock('@/db', () => ({ default: { post: { findMany: deps.findMany } } }));
vi.mock('@/cron/utils', () => ({ enqueuePostTopic: deps.enqueue }));
vi.mock('@/cron/jobs/queue', () => ({ postTopicQueue: { getJobCounts: deps.counts } }));
import { run } from '@/cron/recurring/infer_pending_post_topics';
beforeEach(() => { vi.clearAllMocks(); deps.counts.mockResolvedValue({ waiting: 0, active: 1 }); deps.enqueue.mockResolvedValue(undefined); });
it('rotates bounded pending pages, recovers missed enqueue, and resets after reaching the end', async () => {
  deps.findMany.mockResolvedValueOnce([{ id: 'a', content: 'content' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  await run(); await run(); await run();
  expect(deps.enqueue).toHaveBeenCalledWith('a', 'content', 10);
  expect(deps.findMany.mock.calls[0][0]).toMatchObject({ take: 50, where: { topic: null, deletedAt: null } });
  expect(deps.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'a' });
  expect(deps.findMany.mock.calls[2][0].where.id).toBeUndefined();
});
it('applies backlog pressure instead of growing Redis indefinitely', async () => {
  deps.counts.mockResolvedValue({ waiting: 500, active: 1 }); await run();
  expect(deps.findMany).not.toHaveBeenCalled(); expect(deps.enqueue).not.toHaveBeenCalled();
});
