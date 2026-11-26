import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Audit events are asserted in their own tests; elsewhere they must not add output or Redis calls.
    env: { AUDIT_LOG_STDOUT: 'false', AUDIT_LOG_REDIS: 'false' },
    include: ['tests/**/*.test.ts'],
    // Integration tests need a disposable Redis (TEST_REDIS_URL); `npm test` leaves them out unless it is set.
    exclude:
      process.env.TEST_REDIS_URL || process.env.TEST_REDIS_CLUSTER_NODES
        ? configDefaults.exclude
        : [...configDefaults.exclude, 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/pages/**'],
    },
  },
});
