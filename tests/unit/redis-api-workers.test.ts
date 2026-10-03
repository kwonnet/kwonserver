import { expect, it, vi } from 'vitest';
const loaded = vi.hoisted(() => vi.fn());
vi.mock('@/cron/jobs/workers', () => { loaded(); return {}; });
vi.mock('@/cron/jobs/queue', () => ({}));
vi.mock('@/cron/recurring', () => ({ startRecurringJobs: vi.fn() }));
vi.mock('@/cron/quizGeneration', () => ({ startQuizGeneration: vi.fn() }));
vi.mock('@/services/questionInventory/runtime', () => ({ closeQuestionInventory: vi.fn() }));
vi.mock('@/store', () => ({ closeCacheStore: vi.fn() }));
it('does not construct any job workers in an API-only process', async () => {
    vi.stubEnv('RUN_BACKGROUND_JOBS', 'false');
    const { startCronJobs } = await import('@/cron');
    await startCronJobs();
    expect(loaded).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
});
