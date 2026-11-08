import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  values: { DISCORD_GUILD_ID: 'guild', VERIFIED_MEMBER_ROLE_ID: 'verified' } as Record<string, unknown>,
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => env.values }));
vi.mock('../../../src/server/cookies', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('../../../src/features/auth/server/session', () => ({ getSession: async () => null }));

const OWNER = '456084885220884480';
const HOUR = 60 * 60_000;
const session = (id: string, extra: Record<string, unknown> = {}) =>
  ({ user: { id }, guildId: 'guild', roleIds: ['verified'], expiresAt: Date.now() + HOUR, ...extra }) as never;

beforeEach(() => {
  env.values = { DISCORD_GUILD_ID: 'guild', VERIFIED_MEMBER_ROLE_ID: 'verified' };
});

describe('administrator identity', () => {
  it('keeps the project owner as the default administrator', async () => {
    const { isDashboardAdmin } = await import('../../../src/features/admin/server/access');
    expect(isDashboardAdmin(session(OWNER))).toBe(true);
    expect(isDashboardAdmin(session('123'))).toBe(false);
  });

  it('uses ADMIN_DISCORD_IDS exclusively when configured', async () => {
    env.values.ADMIN_DISCORD_IDS = '111, 222';
    const { isDashboardAdmin } = await import('../../../src/features/admin/server/access');
    expect(isDashboardAdmin(session('222'))).toBe(true);
    expect(isDashboardAdmin(session(OWNER))).toBe(false);
  });

  it('still requires guild and role', async () => {
    const { isDashboardAdmin } = await import('../../../src/features/admin/server/access');
    expect(isDashboardAdmin({ ...(session(OWNER) as object), roleIds: [] } as never)).toBe(false);
    expect(isDashboardAdmin({ ...(session(OWNER) as object), guildId: 'other' } as never)).toBe(false);
  });
});

describe('step-up sign-in for administrator changes', () => {
  it('accepts a recent interactive sign-in', async () => {
    const { requireRecentSignIn } = await import('../../../src/features/admin/server/access');
    expect(() => requireRecentSignIn(session(OWNER, { authenticatedAt: Date.now() - HOUR }))).not.toThrow();
  });

  it('refuses a stale or unstamped session with a re-authentication code', async () => {
    const { requireRecentSignIn } = await import('../../../src/features/admin/server/access');
    for (const extra of [{ authenticatedAt: Date.now() - 13 * HOUR }, {}]) {
      expect(() => requireRecentSignIn(session(OWNER, extra))).toThrowError(
        expect.objectContaining({ statusCode: 403, code: 'ADMIN_REAUTH_REQUIRED' }),
      );
    }
  });

  it('honours ADMIN_REAUTH_HOURS', async () => {
    env.values.ADMIN_REAUTH_HOURS = 1;
    const { requireRecentSignIn } = await import('../../../src/features/admin/server/access');
    expect(() => requireRecentSignIn(session(OWNER, { authenticatedAt: Date.now() - 2 * HOUR }))).toThrow();
  });
});

describe('high-risk administrator actions', () => {
  it('use a much shorter window than ordinary changes', async () => {
    const { requireRecentSignIn } = await import('../../../src/features/admin/server/access');
    const threeHoursAgo = session(OWNER, { authenticatedAt: Date.now() - 3 * HOUR });
    expect(() => requireRecentSignIn(threeHoursAgo)).not.toThrow();
    expect(() => requireRecentSignIn(threeHoursAgo, { highRisk: true })).toThrowError(
      expect.objectContaining({ statusCode: 403, code: 'ADMIN_REAUTH_REQUIRED' }),
    );
    expect(() =>
      requireRecentSignIn(session(OWNER, { authenticatedAt: Date.now() - 30 * 60_000 }), { highRisk: true }),
    ).not.toThrow();
  });

  it('honour ADMIN_HIGH_RISK_REAUTH_MINUTES', async () => {
    env.values.ADMIN_HIGH_RISK_REAUTH_MINUTES = 10;
    const { requireRecentSignIn } = await import('../../../src/features/admin/server/access');
    expect(() =>
      requireRecentSignIn(session(OWNER, { authenticatedAt: Date.now() - 30 * 60_000 }), { highRisk: true }),
    ).toThrow();
  });
});
