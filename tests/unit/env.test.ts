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
  const { getServerEnv } = await import('../../src/config/env');
  expect(getServerEnv().SENTRY_DSN).toBeUndefined();
  expect(getServerEnv().SENTRY_AUTH_TOKEN).toBeUndefined();
});

it('rejects invalid settings without echoing their values', async () => {
  vi.resetModules();
  vi.stubEnv('CONSOLE_URL', 'private-invalid-url');
  const { getServerEnv } = await import('../../src/config/env');
  expect(getServerEnv).toThrow('Invalid server environment configuration: CONSOLE_URL');
});

it('accepts the portal environment template', async () => {
  vi.resetModules();
  const template = parse(readFileSync('.env.example'));
  for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value);
  const { getServerEnv } = await import('../../src/config/env');
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
    REDIS_URL: 'redis://default:test@redis.test:6379/0',
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
it('requires credentials and matching secure public origins at production startup', async () => {
  vi.resetModules();
  productionFixture();
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv().NODE_ENV).toBe('production');
});
it('rejects an HTTP Redis URL without disclosing credentials', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('REDIS_URL', 'http://default:secret@redis.test');
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv).toThrow('Invalid server environment configuration: REDIS_URL');
});
it('rejects missing production credentials before accepting requests', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('DISCORD_CLIENT_SECRET', '');
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: DISCORD_CLIENT_SECRET');
});

it.each(['not-a-url', 'redis://host/not-a-database', 'redis://host/0?password=secret', 'redis://host/0#secret'])(
  'rejects malformed Redis settings without exposing their values (%s)',
  async (value) => {
    vi.stubEnv('REDIS_URL', value);
    const { getServerEnv } = await import('../../src/config/env');
    expect(getServerEnv).toThrow('Invalid server environment configuration: REDIS_URL');
  },
);

it('accepts TLS and nonstandard Redis allocation ports', async () => {
  productionFixture();
  vi.stubEnv('REDIS_URL', 'rediss://default:password@redis.test:25432/2');
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv().REDIS_URL).toBe('rediss://default:password@redis.test:25432/2');
});

it('requires REDIS_URL in production', async () => {
  productionFixture();
  vi.stubEnv('REDIS_URL', '');
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: REDIS_URL');
});
