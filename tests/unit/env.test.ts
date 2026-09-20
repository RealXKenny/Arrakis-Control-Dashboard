import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('rejects invalid settings without echoing their values', async () => {
  // Dev note: invalid settings tried to blend in, but their values were off-key.
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
  expect(env.SERVER_HOSTNAME).toBe('127.0.0.1');
  expect(env.SERVER_PORT).toBe(2008);
});

it.each([
  ['SERVER_HOSTNAME', 'invalid hostname'],
  ['SERVER_PORT', '0'],
  ['SERVER_PORT', '65536'],
  ['SERVER_PORT', 'not-a-port'],
])('rejects an invalid server binding in %s', async (name, value) => {
  vi.stubEnv(name, value);
  const { getServerEnv } = await import('../../src/config/env');
  expect(getServerEnv).toThrow(`Invalid server environment configuration: ${name}`);
});

function productionFixture() {
  const values = {
    NODE_ENV: 'production',
    CONSOLE_URL: 'http://127.0.0.1:4000',
    CONSOLE_API_KEY: 'test',
    ADAPTER_TOKEN: 'test',
    DISCORD_CLIENT_ID: 'test',
    DISCORD_CLIENT_SECRET: 'test',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: '222222222222222222',
    APP_URL: 'https://portal.test',
    REDIS_URL: 'redis://default:test@redis.test:6379/0',
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
it('requires credentials and a secure public origin at production startup', async () => {
  vi.resetModules();
  productionFixture();
  const { validateProductionEnv } = await import('../../src/config/env');
  expect(validateProductionEnv().NODE_ENV).toBe('production');
});
it('derives the Discord callback from the application URL', async () => {
  vi.resetModules();
  productionFixture();
  const { getDiscordRedirectUri } = await import('../../src/config/env');
  expect(getDiscordRedirectUri()).toBe('https://portal.test/auth/callback');
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
