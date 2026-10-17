import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { 'wordlist-english': fileURLToPath(new URL('./node_modules/wordlist-english/index.js', import.meta.url)), '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node', include: ['tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'], fileParallelism: false, maxWorkers: 1,
    testTimeout: 15000, hookTimeout: 30000, restoreMocks: true,
    env: { NODE_ENV: 'test', TZ: 'UTC' },
  },
});
