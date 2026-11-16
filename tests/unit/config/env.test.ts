import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const { getServerEnv } = await import('../../../src/config/env');
  expect(getServerEnv).toThrow('Invalid server environment configuration: CONSOLE_URL');
});

it('accepts the portal environment template', async () => {
  vi.resetModules();
  const template = parse(readFileSync('.env.example'));
  for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value);
  const { getServerEnv } = await import('../../../src/config/env');
  const env = getServerEnv();
  expect(env.LOG_LEVEL).toBe('INFO');
  expect(env.SERVER_HOSTNAME).toBe('0.0.0.0');
  expect(env.SERVER_PORT).toBe(2008);
  expect(env.API_MAX_CONCURRENCY).toBe(100);
  expect(env.API_GLOBAL_READ_LIMIT).toBe(2400);
  expect(env.BOT_API_TOKEN).toBeUndefined();
  expect(env.ADMIN_CONSOLE_API_KEY).toBeUndefined();
  expect(env.SEASON_GAME_DELIVERY_ENABLED).toBe(false);
});

it.each([
  ['SERVER_HOSTNAME', 'invalid hostname'],
  ['SERVER_PORT', '0'],
  ['SERVER_PORT', '65536'],
  ['SERVER_PORT', 'not-a-port'],
  ['API_MAX_CONCURRENCY', '0'],
  ['API_GLOBAL_READ_LIMIT', '-1'],
  ['BOT_API_TOKEN', 'too-short'],
  ['SEASON_GAME_DELIVERY_ENABLED', 'yes'],
])('rejects an invalid server binding in %s', async (name, value) => {
  vi.stubEnv(name, value);
  const { getServerEnv } = await import('../../../src/config/env');
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
    ADMIN_DISCORD_IDS: '123456789012345678',
    APP_URL: 'https://portal.test',
    AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
    REDIS_URL: 'redis://default:test@redis.test:6379/0',
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}
it('requires credentials and a secure public origin at production startup', async () => {
  vi.resetModules();
  productionFixture();
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv().NODE_ENV).toBe('production');
});
it('derives the Discord callback from the application URL', async () => {
  vi.resetModules();
  productionFixture();
  const { getDiscordRedirectUri } = await import('../../../src/config/env');
  expect(getDiscordRedirectUri()).toBe('https://portal.test/api/auth/callback/discord');
});
it('rejects an HTTP Redis URL without disclosing credentials', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('REDIS_URL', 'http://default:secret@redis.test');
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv).toThrow('Invalid server environment configuration: REDIS_URL');
});
it('rejects missing production credentials before accepting requests', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('DISCORD_CLIENT_SECRET', '');
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: DISCORD_CLIENT_SECRET');
});

it('refuses to start production without explicit administrators, naming the variable only', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('ADMIN_DISCORD_IDS', '');
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: ADMIN_DISCORD_IDS');
});

it.each(['not-a-url', 'redis://host/not-a-database', 'redis://host/0?password=secret', 'redis://host/0#secret'])(
  'rejects malformed Redis settings without exposing their values (%s)',
  async (value) => {
    vi.stubEnv('REDIS_URL', value);
    const { getServerEnv } = await import('../../../src/config/env');
    expect(getServerEnv).toThrow('Invalid server environment configuration: REDIS_URL');
  },
);

it('accepts TLS and nonstandard Redis allocation ports', async () => {
  productionFixture();
  vi.stubEnv('REDIS_URL', 'rediss://default:password@redis.test:25432/2');
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv().REDIS_URL).toBe('rediss://default:password@redis.test:25432/2');
});

it('requires REDIS_URL in production', async () => {
  productionFixture();
  vi.stubEnv('REDIS_URL', '');
  const { validateProductionEnv } = await import('../../../src/config/env');
  expect(validateProductionEnv).toThrow('Missing server environment configuration: REDIS_URL');
});
describe('Discord sign-in configuration', () => {
  it('requires the Discord OAuth client in production', async () => {
    vi.resetModules();
    productionFixture();
    vi.stubEnv('DISCORD_CLIENT_ID', '');
    vi.stubEnv('DISCORD_CLIENT_SECRET', '');
    const missing = await import('../../../src/config/env');
    expect(missing.validateProductionEnv).toThrow('DISCORD_CLIENT_ID');
    vi.resetModules();
    productionFixture();
    expect((await import('../../../src/config/env')).validateProductionEnv().DISCORD_CLIENT_ID).toBeTruthy();
  });
});

it('validates administrator settings', async () => {
  vi.resetModules();
  vi.stubEnv('ADMIN_DISCORD_IDS', '123456789012345678, 987654321098765432');
  vi.stubEnv('ADMIN_REAUTH_HOURS', '4');
  const { getServerEnv } = await import('../../../src/config/env');
  expect(getServerEnv().ADMIN_DISCORD_IDS).toContain('987654321098765432');
  expect(getServerEnv().ADMIN_REAUTH_HOURS).toBe(4);

  vi.resetModules();
  vi.stubEnv('ADMIN_DISCORD_IDS', 'not-an-id');
  const invalid = await import('../../../src/config/env');
  expect(invalid.getServerEnv).toThrow('Invalid server environment configuration: ADMIN_DISCORD_IDS');
});

it('refuses plain-text Redis in production only when REDIS_REQUIRE_TLS is enabled', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('REDIS_URL', 'redis://:pw@redis.test:6379');
  const permissive = await import('../../../src/config/env');
  expect(permissive.validateProductionEnv().REDIS_REQUIRE_TLS).toBe(false);

  vi.resetModules();
  vi.stubEnv('REDIS_REQUIRE_TLS', 'true');
  const strict = await import('../../../src/config/env');
  expect(strict.validateProductionEnv).toThrow('REDIS_REQUIRE_TLS is enabled');

  vi.resetModules();
  vi.stubEnv('REDIS_URL', 'rediss://:pw@redis.test:6379');
  const secure = await import('../../../src/config/env');
  expect(secure.validateProductionEnv().NODE_ENV).toBe('production');
});

it('refuses unauthenticated plain-text Redis on a public-looking host unless explicitly allowed', async () => {
  vi.resetModules();
  productionFixture();
  vi.stubEnv('REDIS_URL', 'redis://redis.example.com:6379');
  const refused = await import('../../../src/config/env');
  expect(refused.validateProductionEnv).toThrow('plain-text and unauthenticated');

  vi.resetModules();
  vi.stubEnv('REDIS_ALLOW_INSECURE', 'true');
  const allowed = await import('../../../src/config/env');
  expect(allowed.validateProductionEnv().NODE_ENV).toBe('production');

  // A password, TLS, or a private network each make it acceptable without the escape hatch.
  for (const url of ['redis://:pw@redis.example.com', 'rediss://redis.example.com', 'redis://10.0.0.4:6379']) {
    vi.resetModules();
    vi.stubEnv('REDIS_ALLOW_INSECURE', 'false');
    vi.stubEnv('REDIS_URL', url);
    const accepted = await import('../../../src/config/env');
    expect(accepted.validateProductionEnv().NODE_ENV, url).toBe('production');
  }
});
