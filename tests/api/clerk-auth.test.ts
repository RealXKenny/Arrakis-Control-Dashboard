import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clerkContentSecurityPolicySources,
  clerkFrontendApiOrigin,
  clerkProxyEnabled,
} from '../../src/modules/auth/clerk-config';

const discordId = '123456789012345678';
const config = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'FATAL',
  APP_URL: 'https://portal.test',
  DISCORD_GUILD_ID: 'browser-guild',
  VERIFIED_MEMBER_ROLE_ID: '222222222222222222',
  AUTH_PROVIDER: 'clerk',
};
const enabled = vi.fn(() => true);
const getAuth = vi.fn();
const clerk = {
  users: { getUser: vi.fn(), getUserOauthAccessToken: vi.fn() },
  sessions: { revokeSession: vi.fn() },
};
const saveSession = vi.fn();
const setCookie = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ getAuth: (req: unknown) => getAuth(req), clerkClient: async () => clerk }));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => config, isClerkAuthEnabled: () => enabled() }));
vi.mock('../../src/lib/security/session-store', () => ({ saveSession, sessionTtlSeconds: () => 43200 }));
vi.mock('../../src/infrastructure/cookies', () => ({ cookies: () => ({ set: setCookie, get: () => undefined }) }));

const publishableKey = `pk_test_${btoa('happy-sandworm-12.clerk.accounts.dev$')}`;
const request = { url: '/auth/complete', headers: { host: 'portal.test' } };
const { GET } = await import('../../src/modules/auth/server/clerk-complete');

function discord(member: { status?: number; roles?: string[] } = {}, userId = discordId) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('/users/@me')
        ? Response.json({ id: userId, username: 'Sand rider', avatar: null })
        : member.status
          ? new Response('{}', { status: member.status })
          : Response.json({ roles: member.roles ?? ['222222222222222222'] }),
    ),
  );
}

beforeEach(() => {
  enabled.mockReturnValue(true);
  getAuth.mockReturnValue({ userId: 'user_abc', sessionId: 'sess_abc123' });
  clerk.users.getUser.mockResolvedValue({
    externalAccounts: [{ provider: 'oauth_discord', providerUserId: discordId }],
  });
  clerk.users.getUserOauthAccessToken.mockResolvedValue({
    data: [{ provider: 'oauth_discord', token: 'discord-token' }],
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Clerk configuration', () => {
  it('derives only a well-formed Clerk Frontend API origin from the publishable key', () => {
    expect(clerkFrontendApiOrigin(publishableKey)).toBe('https://happy-sandworm-12.clerk.accounts.dev');
    for (const hostile of ['evil.test/path$', 'evil.test:444$', 'evil.test', "x.test' 'unsafe-inline$", '$'])
      expect(clerkFrontendApiOrigin(`pk_live_${btoa(hostile)}`), hostile).toBeNull();
    expect(clerkFrontendApiOrigin('sk_test_notpublishable')).toBeNull();
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
  });
  it('enables the proxy middleware only when Clerk is selected and both keys are valid', () => {
    const secretKey = 'sk_test_abcdefghijklmnopqrstuvwxyz0123';
    expect(clerkProxyEnabled({ provider: 'clerk', publishableKey, secretKey })).toBe(true);
    expect(clerkProxyEnabled({ provider: 'discord', publishableKey, secretKey })).toBe(false);
    expect(clerkProxyEnabled({ provider: 'clerk', publishableKey })).toBe(false);
    expect(clerkProxyEnabled({ provider: 'clerk', publishableKey: 'pk_test_bad', secretKey })).toBe(false);
    expect(clerkContentSecurityPolicySources(publishableKey)?.script).toEqual([
      'https://happy-sandworm-12.clerk.accounts.dev',
      'https://challenges.cloudflare.com',
    ]);
  });
});

describe('Clerk sign-in bridge', () => {
  it('stays unreachable while Discord login is selected', async () => {
    enabled.mockReturnValue(false);
    expect((await GET(request, {})).status).toBe(404);
    expect(getAuth).not.toHaveBeenCalled();
  });
  it('sends signed-out visitors back to the Clerk sign-in page', async () => {
    getAuth.mockReturnValue({ userId: null, sessionId: null });
    const response = await GET(request, {});
    expect(response.headers.Location).toBe('https://portal.test/sign-in');
    expect(saveSession).not.toHaveBeenCalled();
  });
  it('issues the normal dashboard session for the Discord-verified member', async () => {
    discord();
    const response = await GET(request, {});
    expect(response.headers.Location).toBe('https://portal.test/portal');
    expect(saveSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({
        user: expect.objectContaining({ id: discordId }),
        guildId: 'browser-guild',
        roleIds: ['222222222222222222'],
        clerkSessionId: 'sess_abc123',
      }),
    );
    expect(setCookie).toHaveBeenCalledWith(
      'dashboard_session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[1];
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toBe(
      'https://discord.com/api/users/@me/guilds/browser-guild/member',
    );
    expect(init?.headers).toEqual({ Authorization: 'Bearer discord-token' });
  });
  it('refuses a session when Discord reports a different account than Clerk linked', async () => {
    discord({}, '999999999999999999');
    await expect(GET(request, {})).rejects.toMatchObject({ code: 'DISCORD_ACCOUNT_MISMATCH', statusCode: 403 });
    expect(saveSession).not.toHaveBeenCalled();
  });
  it('keeps the guild membership and role requirements', async () => {
    discord({ roles: ['333333333333333333'] });
    expect((await GET(request, {})).status).toBe(403);
    discord({ status: 404 });
    await expect(GET(request, {})).rejects.toMatchObject({ code: 'GUILD_REQUIRED' });
    expect(saveSession).not.toHaveBeenCalled();
  });
  it('requires exactly one linked Discord account with an access token', async () => {
    clerk.users.getUser.mockResolvedValue({ externalAccounts: [{ provider: 'oauth_google', providerUserId: 'x' }] });
    await expect(GET(request, {})).rejects.toMatchObject({ code: 'DISCORD_ACCOUNT_REQUIRED' });
    clerk.users.getUser.mockResolvedValue({
      externalAccounts: [{ provider: 'oauth_discord', providerUserId: discordId }],
    });
    clerk.users.getUserOauthAccessToken.mockResolvedValue({ data: [] });
    await expect(GET(request, {})).rejects.toMatchObject({ code: 'DISCORD_ACCOUNT_REQUIRED' });
  });
  it('hides Clerk API failures behind a generic provider error', async () => {
    clerk.users.getUser.mockRejectedValue(new Error('secret request detail'));
    const response = await GET(request, {});
    expect(response.status).toBe(502);
    expect(response.body).not.toContain('secret request detail');
  });
});
