import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  queue: { on: vi.fn(), setGlobalConcurrency: vi.fn(), close: vi.fn() },
  worker: { on: vi.fn(), run: vi.fn(), close: vi.fn() },
  connection: { on: vi.fn(), quit: vi.fn() },
  register: vi.fn(), Queue: vi.fn(), Worker: vi.fn(), Redis: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Queue: class { constructor(...args: unknown[]) { mocks.Queue(...args); return mocks.queue; } },
  Worker: class { constructor(...args: unknown[]) { mocks.Worker(...args); return mocks.worker; } },
}));
vi.mock('ioredis', () => ({ default: class { constructor(...args: unknown[]) { mocks.Redis(...args); return mocks.connection; } } }));
vi.mock('@/cron/recurring/registry', () => ({ registerRecurringJobs: mocks.register, processRecurringJob: vi.fn() }));
import { startRecurringJobs } from '@/cron/recurring';
beforeEach(() => {
  vi.stubEnv('REDIS_URL', 'redis://localhost:16379');
  mocks.register.mockReset();
  mocks.worker.run.mockReturnValue(new Promise(() => {}));
});
afterEach(() => { vi.unstubAllEnvs(); });
it('registers before consuming and returns without awaiting the worker lifetime', async () => {
  const service = await startRecurringJobs();
  expect(mocks.queue.setGlobalConcurrency).toHaveBeenCalledWith(1);
  expect(mocks.register).toHaveBeenCalledWith(mocks.queue);
  expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(mocks.worker.run.mock.invocationCallOrder[0]);
  expect(mocks.Worker).toHaveBeenCalledWith('kwonserverBackgroundJobs', expect.any(Function), expect.objectContaining({ autorun: false, concurrency: 1, maxStalledCount: 0 }));
  await service.close();
  expect(mocks.worker.close).toHaveBeenCalledOnce();
  expect(mocks.queue.close).toHaveBeenCalledOnce();
  expect(mocks.connection.quit).toHaveBeenCalledOnce();
});
it('closes its resources and reports registration failures', async () => {
  mocks.register.mockRejectedValue(new Error('scheduler failed'));
  await expect(startRecurringJobs()).rejects.toThrow('scheduler failed');
  expect(mocks.worker.run).not.toHaveBeenCalled();
  expect(mocks.connection.quit).toHaveBeenCalledOnce();
});
it('requires Redis configuration before constructing resources', async () => {
  vi.stubEnv('REDIS_URL', '');
  await expect(startRecurringJobs()).rejects.toThrow('REDIS_URL');
  expect(mocks.Redis).not.toHaveBeenCalled();
});
