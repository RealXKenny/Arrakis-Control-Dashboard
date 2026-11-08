import { beforeEach, expect, it, vi } from 'vitest';
import { DELETE } from '../../src/app/api/v2/admin/sessions/route';
import { getSession } from '../../src/features/auth/server/session';
import { revokeAllSessionsForUser } from '../../src/features/auth/server/session-store';
import { ADMIN_ORIGIN } from '../helpers/admin-v2';

const audit = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: audit, readAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'FATAL',
    APP_URL: 'https://dashboard.test',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'verified',
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'admin' }) }) }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = vi.fn();
  return { getSession, currentSession: () => getSession() };
});
vi.mock('../../src/features/auth/server/session-store', () => ({ revokeAllSessionsForUser: vi.fn() }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => ({ eval: async () => [1, 60000] }) }));

const OWNER = '456084885220884480';
const session = (overrides: Record<string, unknown> = {}) => ({
  user: { id: OWNER },
  guildId: 'guild',
  roleIds: ['verified'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  ...overrides,
});
const call = (headers: Record<string, string> = { origin: ADMIN_ORIGIN }, body?: unknown) =>
  DELETE(
    new Request(`${ADMIN_ORIGIN}/api/v2/admin/sessions`, {
      method: 'DELETE',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session() as never);
});

it('revokes only the calling administrator’s sessions and records an audit event', async () => {
  const response = await call(undefined, { userId: 'someone-else' });
  expect(response.status).toBe(200);
  // A target in the request is ignored: the only member ever revoked is the verified session's own user.
  expect(revokeAllSessionsForUser).toHaveBeenCalledExactlyOnceWith(OWNER);
  expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'admin.sessions_revoked', actor: OWNER }));
});

it('refuses cross-site requests, anonymous callers and non-administrators without revoking anything', async () => {
  expect((await call({ origin: 'https://evil.example' })).status).toBe(403);
  vi.mocked(getSession).mockResolvedValue(null);
  expect((await call()).status).toBe(401);
  vi.mocked(getSession).mockResolvedValue(session({ user: { id: 'ordinary-member' } }) as never);
  expect((await call()).status).toBe(403);
  expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
});

it('needs a sign-in from the last hour', async () => {
  vi.mocked(getSession).mockResolvedValue(session({ authenticatedAt: Date.now() - 2 * 60 * 60_000 }) as never);
  const response = await call();
  expect(response.status).toBe(403);
  expect(await response.text()).toContain('ADMIN_REAUTH_REQUIRED');
  expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
});
