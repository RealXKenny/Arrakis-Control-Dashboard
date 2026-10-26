import { beforeEach, expect, it, vi } from 'vitest';
import operations from '../../src/modules/admin/catalog.json';
import { parseAdminRequest } from '../../src/modules/admin/server/request';
import { parseAdminJson, sanitizeAdminData } from '../../src/modules/admin/server/sanitize';
import { isDashboardAdmin } from '../../src/modules/admin/server/access';

vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'FATAL',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'verified',
    ADMIN_CONSOLE_API_KEY: 'admin-private-credential',
    CONSOLE_API_KEY: 'ordinary-private-credential',
  }),
}));
beforeEach(() => vi.restoreAllMocks());
const session = () => ({
  user: { id: '456084885220884480' },
  guildId: 'guild',
  roleIds: ['verified'],
  expiresAt: Date.now() + 60_000,
});

it('permits only the specified OAuth identity with a current matching guild and role', () => {
  expect(isDashboardAdmin(session())).toBe(true);
  expect(isDashboardAdmin(null)).toBe(false);
  for (const patch of [
    { user: { id: 'someone-else' } },
    { guildId: 'other' },
    { roleIds: [] },
    { expiresAt: Date.now() - 1 },
  ])
    expect(isDashboardAdmin({ ...session(), ...patch })).toBe(false);
});

it('catalogs every unique reference entry with stable operation IDs and explicit key restrictions', () => {
  expect(operations).toHaveLength(378);
  expect(new Set(operations.map((entry) => entry.id)).size).toBe(378);
  expect(new Set(operations.map((entry) => `${entry.method} ${entry.route}`)).size).toBe(378);
  for (const operation of operations) {
    expect(operation.route).toMatch(/^\/api\//);
    expect(operation.route).not.toMatch(/[?#\\]/);
    if (/^\/api\/(settings|database|setup|auth)(\/|$)/.test(operation.route))
      expect(operation.restriction).toBeTruthy();
  }
  expect(operations.find((entry) => entry.id === 'post-updates-check-game')?.restriction).toBeUndefined();
  expect(operations.find((entry) => entry.id === 'post-backups-import-external')?.files).toEqual([
    'backup',
    'metadata',
  ]);
});

it('builds only allowlisted routes and preserves large IDs as strings', () => {
  const request = parseAdminRequest({
    operation: 'get-players-playerid-inventory',
    path: { playerId: '90071992547409931' },
  });
  expect(request.route).toBe('/api/players/90071992547409931/inventory');
  expect(parseAdminRequest({ operation: 'get-server-status' }).request.query.raw).toBe('0');
  expect(() => parseAdminRequest({ operation: 'https://evil.test' })).toThrow('Unknown operation');
  expect(() => parseAdminRequest({ operation: 'get-server-status', url: 'https://evil.test' })).toThrow(
    'Invalid operation',
  );
});

it.each(['..', '../settings', '%2e%2e', 'one?admin=1', 'one#part', 'one\\two', '//evil.test'])(
  'rejects unsafe route parameters: %s',
  (playerId) => {
    expect(() => parseAdminRequest({ operation: 'get-players-playerid-inventory', path: { playerId } })).toThrow(
      'Invalid playerId',
    );
  },
);

it('requires the exact operation confirmation and enforces payload limits', () => {
  expect(() => parseAdminRequest({ operation: 'post-server-restart' })).toThrow('confirmation');
  expect(
    parseAdminRequest({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' }).operation
      .method,
  ).toBe('POST');
  expect(() => parseAdminRequest({ operation: 'get-players', query: { pageSize: 1001 } })).toThrow('pageSize');
  expect(() => parseAdminRequest({ operation: 'get-players', body: { user: 'other' } })).toThrow('Read operations');
  expect(() => parseAdminRequest({ operation: 'get-players', query: { id: Number.MAX_SAFE_INTEGER + 1 } })).toThrow(
    'decimal strings',
  );
  expect(() => parseAdminRequest(JSON.parse('{"operation":"get-players","body":{"__proto__":{}}}'))).toThrow(
    'Invalid request field',
  );
  expect(() => parseAdminRequest({ operation: 'get-players', query: { q: 'x'.repeat(70_000) } })).toThrow('64 KiB');
});

it('does not bypass browser-only operations even for an administrator', () => {
  for (const operation of [
    'post-auth-login',
    'post-database-query',
    'post-settings-api-keys',
    'post-updates-apply-game',
  ])
    expect(() => parseAdminRequest({ operation })).toThrow(/browser session|API keys/);
});

it('preserves integer source text and removes nested credentials and command output', () => {
  expect(parseAdminJson('{"id":90071992547409931}')).toEqual({ id: '90071992547409931' });
  const safe = sanitizeAdminData({
    apiKey: 'one',
    nested: { secret: 'two', password: 'three' },
    text: 'admin-private-credential Bearer external-private-token token=hidden',
    stdout: 'private command output',
    rows: [{ id: '90071992547409931' }],
  });
  expect(JSON.stringify(safe)).not.toMatch(
    /admin-private-credential|external-private-token|token=hidden|private command output/,
  );
  expect(safe.data).toMatchObject({ apiKey: '[REDACTED]', rows: [{ id: '90071992547409931' }] });
  expect(sanitizeAdminData(Array.from({ length: 1001 }, () => 'value')).truncated).toBe(true);
});
