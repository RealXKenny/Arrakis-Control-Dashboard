import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
const env = vi.hoisted(() => ({
  DISCORD_CLIENT_ID: 'client',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: 'guild',
  VERIFIED_MEMBER_ROLE_ID: '555',
  AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
  LOG_LEVEL: 'FATAL',
  NODE_ENV: 'test',
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => env, requireServerEnv: () => env }));
vi.mock('../../../src/server/integrations/discord', () => ({ refreshDiscordIdentity: refresh }));

const SID = 'a'.repeat(64);
const DISCORD_ID = '123456789012345678';
const HOUR = 60 * 60_000;

function rejection(code: string) {
  return Object.assign(new Error(code), { code });
}

function identity(roles: string[], overrides: Record<string, unknown> = {}) {
  return { userData: { id: DISCORD_ID }, memberData: { roles }, refreshToken: 'rotated-token', ...overrides };
}

async function setup(session: { verifiedAt?: number; authenticatedAt?: number } = {}) {
  const store = await import('../../../src/features/auth/server/session-store');
  const sessionService = await import('../../../src/features/auth/server/session');
  const users = await import('../../../src/features/auth/server/users');
  const password = await import('../../../src/features/auth/server/password');
  await users.saveAccount({
    discordId: DISCORD_ID,
    email: 'member@dune.test',
    refreshToken: password.sealSecret('original-token'),
    createdAt: 1,
  });
  await store.saveSession(SID, {
    user: { id: DISCORD_ID, username: 'paul', guild_nickname: null },
    guildId: 'guild',
    roleIds: ['555', '777'],
    expiresAt: Date.now() + 24 * HOUR,
    ...session,
  });
  return { store: { ...store, ...sessionService }, users, password };
}

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
});

describe('session re-verification', () => {
  it('automatically backfills an older but freshly verified session without signing in again', async () => {
    const { store } = await setup({ verifiedAt: Date.now(), authenticatedAt: 123 });
    const current = (await store.readSession(SID))!;
    delete current.user.guild_nickname;
    await store.saveSession(SID, current);
    refresh.mockResolvedValue(identity(['555'], { memberData: { roles: ['555'], nick: 'Kenny' } }));
    const upgraded = await store.getSession(SID);
    expect(upgraded?.user.guild_nickname).toBe('Kenny');
    expect(upgraded?.authenticatedAt).toBe(123);
    await store.getSession(SID);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('remembers that no guild nickname exists instead of refreshing on every request', async () => {
    const { store } = await setup({ verifiedAt: Date.now() });
    const current = (await store.readSession(SID))!;
    delete current.user.guild_nickname;
    await store.saveSession(SID, current);
    refresh.mockResolvedValue(identity(['555']));
    expect((await store.getSession(SID))?.user.guild_nickname).toBeNull();
    await store.getSession(SID);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('backs off failed nickname backfills without extending the authorization freshness clock', async () => {
    const verifiedAt = Date.now() - 60_000;
    const { store } = await setup({ verifiedAt });
    const current = (await store.readSession(SID))!;
    delete current.user.guild_nickname;
    await store.saveSession(SID, current);
    refresh.mockRejectedValue(rejection('DISCORD_UNAVAILABLE'));
    expect((await store.getSession(SID))?.verifiedAt).toBe(verifiedAt);
    await store.getSession(SID);
    expect(refresh).toHaveBeenCalledOnce();
    const deferred = (await store.readSession(SID))!;
    await store.saveSession(SID, { ...deferred, profileRefreshAttemptedAt: Date.now() - 6 * 60_000 });
    refresh.mockResolvedValue(identity(['555'], { memberData: { roles: ['555'], nick: 'Recovered Nick' } }));
    expect((await store.getSession(SID))?.user.guild_nickname).toBe('Recovered Nick');
  });

  it('does not log out a fresh legacy session solely because optional nickname backfill lacks a refresh token', async () => {
    const { store, users } = await setup({ verifiedAt: Date.now() });
    const current = (await store.readSession(SID))!;
    delete current.user.guild_nickname;
    await store.saveSession(SID, current);
    await users.saveAccount({ discordId: DISCORD_ID, createdAt: 1 });
    expect((await store.getSession(SID))?.user.id).toBe(DISCORD_ID);
    expect(refresh).not.toHaveBeenCalled();
    const updated = (await store.readSession(SID))!;
    await store.saveSession(SID, { ...updated, verifiedAt: Date.now() - HOUR });
    expect(await store.getSession(SID)).toBeNull();
  });

  it('still ends a legacy session if the automatic nickname refresh proves its role was removed', async () => {
    const { store } = await setup({ verifiedAt: Date.now() });
    const current = (await store.readSession(SID))!;
    delete current.user.guild_nickname;
    await store.saveSession(SID, current);
    refresh.mockResolvedValue(identity(['777']));
    expect(await store.getSession(SID)).toBeNull();
  });
  it('refreshes cosmetic Discord names and photo only after the ID and role are verified', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockResolvedValue(
      identity(['555'], {
        userData: { id: DISCORD_ID, username: 'new-user', global_name: 'Kenny', avatar: 'a'.repeat(32) },
        memberData: { roles: ['555'], nick: 'Server Nick' },
      }),
    );
    expect((await store.getSession(SID))?.user).toEqual({
      id: DISCORD_ID,
      username: 'new-user',
      global_name: 'Kenny',
      avatar: 'a'.repeat(32),
      guild_nickname: 'Server Nick',
    });
    refresh.mockResolvedValue(
      identity(['555'], {
        userData: { id: DISCORD_ID, global_name: null, avatar: null },
        memberData: { roles: ['555'] },
      }),
    );
    const updated = (await store.readSession(SID))!;
    await store.saveSession(SID, { ...updated, verifiedAt: Date.now() - HOUR });
    const cleared = await store.getSession(SID);
    expect(cleared?.user.global_name).toBeUndefined();
    expect(cleared?.user.guild_nickname).toBeNull();
    expect(cleared?.user.avatar).toBeNull();
  });
  it('does not call Discord for a recently verified session', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - 5 * 60_000 });
    expect((await store.getSession(SID))?.user.id).toBe(DISCORD_ID);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes roles, restarts the clock and persists the rotated refresh token', async () => {
    const { store, users, password } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockResolvedValue(identity(['555', '888']));

    const session = await store.getSession(SID);
    expect(refresh).toHaveBeenCalledWith('original-token', expect.objectContaining({ guildId: 'guild' }));
    expect(session?.roleIds).toEqual(['555', '888']);
    expect(Date.now() - (session?.verifiedAt ?? 0)).toBeLessThan(5_000);
    expect(password.openSecret((await users.getAccount(DISCORD_ID))!.refreshToken!)).toBe('rotated-token');

    // Verified just now: the next read is free.
    await store.getSession(SID);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the required role is gone', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockResolvedValue(identity(['777']));
    expect(await store.getSession(SID)).toBeNull();
    refresh.mockClear();
    expect(await store.getSession(SID)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ends the session when the member left the guild or the token was revoked', async () => {
    for (const code of ['GUILD_REQUIRED', 'OAUTH_REJECTED']) {
      vi.resetModules();
      const { store } = await setup({ verifiedAt: Date.now() - HOUR });
      refresh.mockRejectedValue(rejection(code));
      expect(await store.getSession(SID), code).toBeNull();
    }
  });

  it('keeps a recently verified session through a Discord outage, but not an old one', async () => {
    const recent = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockRejectedValue(rejection('DISCORD_UNAVAILABLE'));
    expect(await recent.store.getSession(SID)).not.toBeNull();

    vi.resetModules();
    const old = await setup({ verifiedAt: Date.now() - 7 * HOUR });
    expect(await old.store.getSession(SID)).toBeNull();
  });

  it('gives a session with no verification stamp no grace period', async () => {
    const { store } = await setup();
    refresh.mockRejectedValue(rejection('DISCORD_UNAVAILABLE'));
    expect(await store.getSession(SID)).toBeNull();
  });

  it('does not resurrect a session that was signed out while Discord was being asked', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockImplementation(async () => {
      await store.deleteSession(SID);
      return identity(['555']);
    });
    expect(await store.getSession(SID)).toBeNull();
    expect(await store.readSession(SID)).toBeNull();
  });

  it('only writes background session updates when the session still exists', async () => {
    const { store } = await setup({ verifiedAt: Date.now() });
    const live = (await store.readSession(SID))!;
    await store.deleteSession(SID);
    expect(await store.saveSession(SID, live, { onlyIfExists: true })).toBe(false);
    expect(await store.readSession(SID)).toBeNull();
    expect(await store.saveSession(SID, live)).toBe(true);
    expect(await store.readSession(SID)).not.toBeNull();
  });

  it('ends a session whose member has no stored refresh token', async () => {
    const { store, users } = await setup({ verifiedAt: Date.now() - HOUR });
    await users.saveAccount({ discordId: DISCORD_ID, createdAt: 1 });
    expect(await store.getSession(SID)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps the session when a password login rotated the token during the check', async () => {
    const { store, users, password } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockImplementation(async () => {
      await users.saveAccount({
        discordId: DISCORD_ID,
        refreshToken: password.sealSecret('rotated-elsewhere'),
        createdAt: 1,
      });
      throw rejection('OAUTH_REJECTED');
    });
    expect(await store.getSession(SID)).not.toBeNull();
  });

  it('rejects a Discord response for a different account', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockResolvedValue(identity(['555'], { userData: { id: '999' } }));
    expect(await store.getSession(SID)).toBeNull();
  });

  it('runs one Discord check for simultaneous requests on the same session', async () => {
    const { store } = await setup({ verifiedAt: Date.now() - HOUR });
    refresh.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return identity(['555']);
    });
    const [a, b, c] = await Promise.all([store.getSession(SID), store.getSession(SID), store.getSession(SID)]);
    expect([a, b, c].every((session) => session?.user.id === DISCORD_ID)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
