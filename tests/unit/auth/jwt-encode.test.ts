import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ factory: undefined as undefined | (() => Record<string, any>) }));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/server/integrations/discord', () => ({}));
vi.mock('../../../src/config/env', () => {
  const env = {
    AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
    DISCORD_CLIENT_ID: 'client',
    DISCORD_CLIENT_SECRET: 'secret',
    DISCORD_GUILD_ID: 'guild',
    NODE_ENV: 'test',
    LOG_LEVEL: 'FATAL',
  };
  return { getServerEnv: () => env, requireServerEnv: () => env };
});
vi.mock('next-auth', () => ({
  default: (factory: () => Record<string, any>) => {
    captured.factory = factory;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

const token = (extra: Record<string, unknown> = {}) => ({
  discordId: '123456789012345678',
  guildId: 'guild',
  roleIds: ['555'],
  expiresAt: Date.now() + 60 * 60_000,
  ...extra,
});

beforeEach(() => vi.resetModules());

describe('Auth.js session cookie write-back', () => {
  it('preserves the verified server nickname through session writes', async () => {
    await import('../../../src/features/auth/server/config');
    const store = await import('../../../src/features/auth/server/session-store');
    const sid = await captured.factory!().jwt.encode({ token: token({ guildNickname: 'Server Nick' }) });
    expect((await store.readSession(sid))?.user.guild_nickname).toBe('Server Nick');
  });
  it('creates a new server session for a fresh sign-in', async () => {
    await import('../../../src/features/auth/server/config');
    const store = await import('../../../src/features/auth/server/session-store');
    const sid = await captured.factory!().jwt.encode({ token: token() });
    expect(sid).toMatch(/^[a-f0-9]{64}$/);
    expect(await store.readSession(sid)).not.toBeNull();
  });

  it('does not recreate a session that was signed out before the cookie was refreshed', async () => {
    await import('../../../src/features/auth/server/config');
    const store = await import('../../../src/features/auth/server/session-store');
    const sid = await captured.factory!().jwt.encode({ token: token() });
    await store.deleteSession(sid);

    // /api/auth/session decoded the token before the sign-out and re-encodes it afterwards.
    const returned = await captured.factory!().jwt.encode({ token: token({ sid }) });
    expect(returned).toBe(sid);
    expect(await store.readSession(sid)).toBeNull();
  });
});
