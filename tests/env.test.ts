import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

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

it('accepts the portal environment template', async () => {
  vi.resetModules();
  const template = parse(readFileSync('.env.example'));
  for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value);
  const { getServerEnv } = await import('../src/config/env');
  const env = getServerEnv();
  expect(env.LOG_LEVEL).toBe('INFO');
  expect(env.POPULATION_HISTORY_ENABLED).toBe('true');
});

function productionFixture() {
  const values = {
    NODE_ENV: 'production',
    CONSOLE_URL: 'http://127.0.0.1:4000',
    CONSOLE_PASSWORD: 'test',
    ADAPTER_TOKEN: 'test',
    DISCORD_CLIENT_ID: 'test',
    DISCORD_CLIENT_SECRET: 'test',
    DISCORD_GUILD_ID: 'guild',
    DISCORD_REDIRECT_URI: 'https://portal.test/auth/callback',
    APP_URL: 'https://portal.test',
    DISCORD_APP_URL: 'https://portal.test',
    UPSTASH_REDIS_REST_URL: 'https://redis.test',
    UPSTASH_REDIS_REST_TOKEN: 'test',
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
it('requires credentials and matching secure public origins at production startup', async () => {
  vi.resetModules();
  productionFixture();
  const { validateProductionEnv } = await import('../src/config/env');
  expect(validateProductionEnv().NODE_ENV).toBe('production');
});
it('rejects a production Redis URL without HTTPS and does not disclose its token', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://redis.test');
  const { validateProductionEnv } = await import('../src/config/env');
  expect(validateProductionEnv).toThrow('Production HTTPS is required: UPSTASH_REDIS_REST_URL');
});
it('rejects missing production credentials before accepting requests', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('DISCORD_CLIENT_SECRET', '');
  const { validateProductionEnv } = await import('../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: DISCORD_CLIENT_SECRET');
});
