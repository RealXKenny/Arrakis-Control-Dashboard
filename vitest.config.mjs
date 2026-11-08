import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Audit events are asserted in their own tests; elsewhere they must not add output or Redis calls.
    env: { AUDIT_LOG_STDOUT: 'false', AUDIT_LOG_REDIS: 'false' },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/pages/**'],
    },
  },
});
