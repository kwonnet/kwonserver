import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test', TZ: 'UTC' },
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    maxWorkers: 2,
    testTimeout: 5000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**', 'src/dts/**'],
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage/unit',
      thresholds: {
        // Whole-repository baseline, including modules not tested yet.
        statements: 34, lines: 34, functions: 31, branches: 39,
        'src/services/v1/conversations/index.ts': { statements: 95, lines: 95, functions: 90, branches: 95 },
        'src/controllers/v1/conversations/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/services/v1/discover/index.ts': { statements: 100, lines: 100, functions: 100, branches: 90 },
        'src/controllers/v1/discover/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/services/v1/coins/index.ts': { statements: 100, lines: 100, functions: 100, branches: 85 },
        'src/services/v1/subscriptions/index.ts': { statements: 100, lines: 100, functions: 100, branches: 95 },
        'src/services/v1/wallets/index.ts': { statements: 100, lines: 100, functions: 100, branches: 95 },
        'src/controllers/v1/coins/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/controllers/v1/subscriptions/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/controllers/v1/wallets/index.ts': { statements: 95, lines: 100, functions: 100, branches: 95 },
        'src/cron/utils/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/services/kwonrec.ts': { statements: 100, lines: 100, functions: 100, branches: 90 },
        'src/middleware/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/services/v1/tasks/index.ts': { statements: 100, lines: 100, functions: 100, branches: 100 },
        'src/services/v1/auth/index.ts': { statements: 95, lines: 95, functions: 100, branches: 90 },
        'src/controllers/v1/auth/index.ts': { statements: 95, lines: 95, functions: 100, branches: 95 },
        'src/services/v1/payments/index.ts': { statements: 95, lines: 95, functions: 100, branches: 85 },
        'src/services/v1/utils.ts': { statements: 95, lines: 95, functions: 95, branches: 90 },
        'src/services/helper.ts': { statements: 95, lines: 95, functions: 100, branches: 90 },
        'src/utils/index.ts': { statements: 95, lines: 95, functions: 100, branches: 80 },
      },
    },
  },
});
