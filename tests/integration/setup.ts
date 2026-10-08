import { vi } from 'vitest';
// Refuse to run destructive fixture operations against any other database.
if (process.env.DATABASE_URL !== 'postgresql://test:test@127.0.0.1:15432/kwonserver_test') {
  throw new Error('Run integration tests through npm run test:integration; isolated database URL required');
}
vi.mock('@/config', () => ({ appName: 'test', jwtKey: 'integration-jwt', encrytionKey: 'integration-encryption' }));
vi.mock('@/utils/googleAi', () => ({ getGoogleAi: vi.fn() }));
vi.mock('@huggingface/transformers', () => ({ pipeline: () => { throw new Error('Models disabled in infrastructure tests'); } }));
vi.mock('@/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
// These optional analytics systems are outside this suite's boundary.
vi.mock('@/db/clickhouse', () => ({ clickHouseClient: {} }));
vi.mock('@/db/timescaleDb', () => ({ prismaAnalytics: {}, sequelizeAnalytics: {} }));

process.env.AUTH_EMAIL_TOKEN_SECRET = 'disposable-test-email-token-secret-32-characters';
process.env.WEB_APP_URL = 'https://kwonnet.test';

process.env.APP_LOGO = 'https://images.test.invalid/kwonnet-logo.png';
