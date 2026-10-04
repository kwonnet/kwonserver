import { beforeEach, vi } from 'vitest';
import { Socket } from 'node:net';

// Never load dotenv or production configuration in a unit test.
vi.mock('@/config', () => ({
  appName: 'Kwonnet test', jwtKey: 'unit-test-jwt-secret',
  encrytionKey: 'unit-test-encryption-secret',
  allowedOrigins: ['https://kwonnet.test'],
  flutterwaveApiUrl: 'https://payments.invalid', flutterwaveSecretKey: 'unit-test-only',
}));
vi.mock('@/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('@/db', () => ({ default: new Proxy({}, {
  get(_target, key) { throw new Error(`Unit test must mock Prisma dependency: ${String(key)}`); },
}) }));
vi.mock('@/redis', () => ({ default: new Proxy({}, {
  get(_target, key) { throw new Error(`Unit test must mock Redis dependency: ${String(key)}`); },
}) }));
vi.mock('@/utils/genkitAi', () => ({ default: {} }));
vi.mock('@huggingface/transformers', () => ({ pipeline: vi.fn(() => { throw new Error('Mock the model pipeline'); }) }));

beforeEach(() => {
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('Network access is forbidden in unit tests; mock the dependency');
  });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Mock fetch in unit tests'); }));
});
