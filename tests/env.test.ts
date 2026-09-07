import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('accepts empty optional monitoring settings from the environment template', async () => {
  vi.resetModules();
  vi.stubEnv('SENTRY_DSN', '');
  vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  const { getServerEnv } = await import('../src/config/env');
  expect(getServerEnv().SENTRY_DSN).toBeUndefined();
  expect(getServerEnv().SENTRY_AUTH_TOKEN).toBeUndefined();
});

it('rejects invalid settings without echoing their values', async () => {
  vi.resetModules();
  vi.stubEnv('CONSOLE_URL', 'private-invalid-url');
  const { getServerEnv } = await import('../src/config/env');
  expect(getServerEnv).toThrow('Invalid server environment configuration: CONSOLE_URL');
});
