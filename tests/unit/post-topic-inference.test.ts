import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const deps = vi.hoisted(() => ({ post: { findFirst: vi.fn(), updateMany: vi.fn() }, classifier: vi.fn() }));
vi.mock('@/db', () => ({ default: { post: deps.post } }));
vi.mock('@/utils/helpers', () => ({ AppError: class extends Error {}, topicClassifier: deps.classifier }));
vi.mock('@/utils/webpush', () => ({ default: {} }));
vi.mock('@/db/clickhouse', () => ({ clickHouseClient: {} }));
vi.mock('@/db/timescaleDb', () => ({ prismaAnalytics: {}, sequelizeAnalytics: {} }));
import { inferPostTopic } from '@/services/v1/posts';
beforeEach(() => {
  vi.clearAllMocks();
  deps.post.findFirst.mockResolvedValue({ id: 'post', content: 'Champions league match tonight' });
  deps.classifier.mockResolvedValue({ labels: ['sports'], scores: [0.8] });
});
it('classifies in the background and guards against stale edits/deletions when saving', async () => {
  await inferPostTopic('post');
  expect(deps.classifier).toHaveBeenCalledWith('Champions league match tonight');
  expect(deps.post.updateMany).toHaveBeenCalledWith({ where: { id: 'post', content: 'Champions league match tonight', deletedAt: null, status: { in: ['PUBLISHED', 'SCHEDULED'] } }, data: { topic: 'sports' } });
});
it('extracts visible Draft.js text without metadata or mentions', async () => {
  deps.post.findFirst.mockResolvedValue({ id: 'post', content: JSON.stringify({ blocks: [{ text: 'Champions league match @someone https://private.test/' }], entityMap: { 0: { data: { secret: 'not visible' } } } }) });
  await inferPostTopic('post');
  expect(deps.classifier).toHaveBeenCalledWith('Champions league match');
});
it('ignores deleted or obsolete queued versions', async () => {
  await inferPostTopic('post', createHash('sha256').update('old content').digest('hex'));
  deps.post.findFirst.mockResolvedValue(null); await inferPostTopic('post');
  expect(deps.classifier).not.toHaveBeenCalled(); expect(deps.post.updateMany).not.toHaveBeenCalled();
});
it.each([{ labels: ['sports'], scores: [0.1] }, { labels: ['sports'], scores: [0.49] }, { labels: ['invented'], scores: [0.9] }])('keeps uncertain or unknown labels generic', async result => {
  deps.classifier.mockResolvedValue(result); await inferPostTopic('post');
  expect(deps.post.updateMany.mock.calls[0][0].data.topic).toBe('generic');
});
it('does not download a model for empty or tiny content', async () => {
  deps.post.findFirst.mockResolvedValue({ id: 'post', content: 'Hi' }); await inferPostTopic('post');
  expect(deps.classifier).not.toHaveBeenCalled(); expect(deps.post.updateMany.mock.calls[0][0].data.topic).toBe('generic');
});
it('leaves failed inference pending for retry rather than storing a fake topic', async () => {
  deps.classifier.mockRejectedValue(new Error('Model unavailable'));
  await expect(inferPostTopic('post')).rejects.toThrow('Model unavailable');
  expect(deps.post.updateMany).not.toHaveBeenCalled();
});

it('selects the strongest independently relevant category even when several categories apply', async () => {
  deps.classifier.mockResolvedValue({ labels: ['sports', 'news', 'community'], scores: [0.65, 0.61, 0.56] });
  await inferPostTopic('post');
  expect(deps.post.updateMany.mock.calls[0][0].data.topic).toBe('sports');
});
it.each([NaN, -0.1, 1.1])('retries malformed model scores rather than saving generic: %s', async score => {
  deps.classifier.mockResolvedValue({ labels: ['sports'], scores: [score] });
  await expect(inferPostTopic('post')).rejects.toThrow('Invalid topic inference response');
  expect(deps.post.updateMany).not.toHaveBeenCalled();
});
