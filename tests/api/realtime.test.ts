import { beforeEach, expect, it, vi } from 'vitest';
import route from '../../src/pages/api/map/realtime';
import { getDuneClient, DuneConsoleApiError } from '../../src/infrastructure/dune';
import { getSession } from '../../src/lib/session-store';
import { responseMock } from '../helpers/response';

const config = vi.hoisted(() => ({
  REALTIME_ROLE_ID: '123',
  DISCORD_GUILD_ID: 'guild',
  CONSOLE_URL: 'https://console.test',
}));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', ...config }) }));
vi.mock('../../src/infrastructure/dune', async (original) => ({
  ...(await original<typeof import('../../src/infrastructure/dune')>()),
  getDuneClient: vi.fn(),
}));
vi.mock('../../src/lib/session-store', () => ({ getSession: vi.fn() }));
vi.mock('../../src/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 100, retryAfter: 60 }),
  getClientAddress: () => 'test',
}));

const request = vi.fn();
const source = { map: 'Survival_1', partition: 2, ready: true, pid: 123456 };
const object = { i: 1, k: 'worm', s: 0, x: 10, y: 20, z: 30, secret: 'private' };
const call = async (url = '/api/map/realtime?map=HaggaBasin', method = 'GET') => {
  const res = responseMock();
  await route({ method, url, headers: { cookie: 'dashboard_session=staff' } }, res);
  return { status: res.statusCode, body: typeof res.body === 'string' ? JSON.parse(res.body) : res.body, res };
};
beforeEach(() => {
  vi.clearAllMocks();
  config.REALTIME_ROLE_ID = '123';
  config.CONSOLE_URL = 'https://console.test';
  vi.mocked(getSession).mockResolvedValue({
    user: { id: 'user' },
    guildId: 'guild',
    roleIds: ['123'],
    expiresAt: Date.now() + 60000,
  });
  vi.mocked(getDuneClient, { partial: true }).mockReturnValue({ request });
  request.mockResolvedValue({ gen: 1, t: Date.now(), sources: [source], objects: [object] });
});

it('requires a session, the configured staff role and matching guild before contacting Console', async () => {
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await call()).status).toBe(401);
  vi.mocked(getSession).mockResolvedValueOnce({
    user: { id: 'u' },
    guildId: 'guild',
    roleIds: [],
    expiresAt: Date.now() + 60000,
  });
  expect((await call()).status).toBe(403);
  vi.mocked(getSession).mockResolvedValueOnce({
    user: { id: 'u' },
    guildId: 'other',
    roleIds: ['123'],
    expiresAt: Date.now() + 60000,
  });
  expect((await call()).status).toBe(403);
  config.REALTIME_ROLE_ID = '';
  expect((await call()).status).toBe(403);
  expect(request).not.toHaveBeenCalled();
});

it('normalizes positions and omits raw source metadata, players and vehicles', async () => {
  request.mockResolvedValueOnce({
    gen: 1,
    t: Date.now(),
    sources: [source],
    objects: [object, { ...object, i: 2, k: 'player' }, { ...object, i: 3, k: 'vehicle' }],
  });
  const { body, res } = await call();
  expect(body.markers).toEqual([
    { id: 'realtime:0:1', type: 'worm', name: 'Sandworm', x: 10, y: 20, z: 30, partition: 2, realtime: true },
  ]);
  expect(body.sources).toEqual([{ partition: 2, ready: true }]);
  expect(JSON.stringify(body)).not.toMatch(/pid|private|secret/);
  expect(res.getHeader('Cache-Control')).toContain('no-store');
  expect(request).toHaveBeenCalledWith('GET', '/api/realtime/objects', { timeoutMs: 5000, retryRead: false });
});

it('revalidates the session on each snapshot and rejects unsupported maps and methods', async () => {
  expect((await call()).status).toBe(200);
  vi.mocked(getSession).mockResolvedValueOnce(null);
  expect((await call()).status).toBe(401);
  expect((await call('/api/map/realtime?map=unknown')).status).toBe(400);
  expect((await call(undefined, 'POST')).status).toBe(405);
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([
  [401, 'requires Realtime Data'],
  [403, 'requires Realtime Data'],
  [404, 'does not support'],
  [429, 'rate limit'],
  [503, 'agent is unavailable'],
])('provides safe availability diagnostics for Console %s', async (status, message) => {
  request.mockRejectedValueOnce(new DuneConsoleApiError('private upstream error', Number(status)));
  const result = await call();
  expect(result.status).toBe(503);
  expect(result.body.error).toContain(message);
  expect(JSON.stringify(result.body)).not.toContain('private upstream');
});

it('rejects insecure remote transport and malformed snapshots', async () => {
  config.CONSOLE_URL = 'http://console.test';
  expect((await call()).body.error).toContain('HTTPS');
  expect(request).not.toHaveBeenCalled();
  config.CONSOLE_URL = 'http://127.0.0.1:8088';
  request.mockResolvedValueOnce({ sources: [], objects: [] });
  expect((await call()).status).toBe(503);
});
