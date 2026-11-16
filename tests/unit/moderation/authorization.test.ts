import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({ env: vi.fn() }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: mocks.env }));
import { isModerator } from '../../../src/features/moderation/server/authorization';

const guild = '123456789012345678';
const role = '234567890123456789';
const user = '345678901234567890';
const session: DashboardSession = { user: { id: user }, guildId: guild, roleIds: [], expiresAt: Date.now() + 60000 };
beforeEach(() => {
  mocks.env.mockReturnValue({
    DISCORD_GUILD_ID: guild,
    MODERATOR_DISCORD_ROLE_IDS: role,
    DISCORD_BOT_TOKEN: 'fixture-token',
  });
});
afterEach(() => vi.unstubAllGlobals());

it('allows a freshly verified configured role', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ roles: [role] }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await isModerator(session)).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(
    `https://discord.com/api/guilds/${guild}/members/${user}`,
    expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
  );
});

it('denies missing roles and ignores a stale session role', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ roles: [] })));
  expect(await isModerator({ ...session, roleIds: [role] })).toBe(false);
  mocks.env.mockReturnValue({ DISCORD_GUILD_ID: guild, DISCORD_BOT_TOKEN: 'fixture-token' });
  expect(await isModerator(session)).toBe(false);
});

it('denies a revoked role on the next check', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ roles: [role] }))
      .mockResolvedValueOnce(Response.json({ roles: [] })),
  );
  expect(await isModerator(session)).toBe(true);
  expect(await isModerator(session)).toBe(false);
});

it('denies unavailable or invalid verification', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(await isModerator(session)).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ roles: 'invalid' })));
  expect(await isModerator(session)).toBe(false);
  expect(await isModerator({ ...session, guildId: 'wrong' })).toBe(false);
});
