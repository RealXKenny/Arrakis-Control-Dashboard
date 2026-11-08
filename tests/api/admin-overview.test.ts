import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/v2/admin/overview/route';
import { summarizeAdminMetrics } from '../../src/features/admin/overview';
const { config, session, fetcher } = vi.hoisted(() => ({
  config: {
    CONSOLE_URL: 'https://console.test',
    ADMIN_CONSOLE_API_KEY: 'fixture-admin-key',
    ADAPTER_TOKEN: 'fixture-adapter-key',
    REDIS_URL: 'redis://fixture',
    APP_URL: 'https://dashboard.test',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'verified',
    LOG_LEVEL: 'FATAL',
  },
  session: vi.fn(),
  fetcher: vi.fn(),
}));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => config }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'fixture' }) }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = session;
  return { getSession, currentSession: () => getSession() };
});
afterEach(() => vi.unstubAllGlobals());
const call = () => GET(new Request('https://dashboard.test/api/v2/admin/overview'));
const read = async () => (await (await call()).json()).data;
const fixtures: Record<string, unknown> = {
  '/api/server/status': { data: { summary: { overall: 'READY' } } },
  '/api/server/performance': { cpuPercent: 24.5, memoryPercent: 62 },
  '/api/server/services': {
    services: [
      { name: 'Game', running: true },
      { name: 'Database', status: 'healthy' },
    ],
  },
  '/api/players/online': { rows: [{ id: '1' }], total: 17 },
  '/api/players': { rows: [{ id: '1' }], total: 250 },
  '/api/guilds': { rows: [{ id: '2' }], total: 8 },
  '/api/bases': { total: 42 },
  '/api/vehicles': { total: 12 },
  '/api/maps': { maps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  '/api/backups': { backups: ['one', 'two', 'three', 'four'] },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetcher);
  config.CONSOLE_URL = 'https://console.test';
  config.ADMIN_CONSOLE_API_KEY = 'fixture-admin-key';
  session.mockResolvedValue({
    user: { id: '456084885220884480' },
    guildId: 'guild',
    roleIds: ['verified'],
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  });
  fetcher.mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify({ ok: true, ...(fixtures[new URL(url).pathname] as object), token: 'fixture-admin-key' }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
});
it('returns normalized real readings and setup flags through read-only bounded requests', async () => {
  const data = await read();
  const values = Object.fromEntries(data.metrics.map((entry) => [entry.id, entry.value]));
  expect(values).toEqual({
    health: 'READY',
    cpu: 24.5,
    memory: 62,
    online: 17,
    players: 250,
    guilds: 8,
    bases: 42,
    vehicles: 12,
    maps: 3,
    backups: 4,
  });
  expect(data.services).toEqual([
    { name: 'Game', state: 'Running' },
    { name: 'Database', state: 'healthy' },
  ]);
  expect(data.sources).toHaveLength(10);
  expect(data.sources.every((source) => source.state === 'ready')).toBe(true);
  expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  for (const [url, options] of fetcher.mock.calls) {
    expect(options.headers.Authorization).toBe('Bearer fixture-admin-key');
    if (/\/players|\/guilds|\/bases|\/vehicles/.test(new URL(url).pathname))
      expect(new URL(url).searchParams.get('pageSize')).toBe('1');
  }
  expect(JSON.stringify(data)).not.toMatch(/fixture-admin-key|fixture-adapter-key|redis:\/\/fixture/);
});
it('keeps working sources available when another scope is refused', async () => {
  fetcher.mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(new URL(url).pathname === '/api/guilds' ? { ok: false } : fixtures[new URL(url).pathname]),
        {
          status: new URL(url).pathname === '/api/guilds' ? 403 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  );
  const data = await read();
  expect(data.metrics.find((entry) => entry.id === 'guilds').value).toBeNull();
  expect(data.metrics.find((entry) => entry.id === 'players').value).toBe(250);
  expect(data.sources.find((source) => source.operation === 'get-guilds')).toMatchObject({
    state: 'error',
    status: 403,
  });
});
it('reports setup requirements without making requests when credentials or secure transport are missing', async () => {
  config.ADMIN_CONSOLE_API_KEY = '';
  let data = await read();
  expect(data.setup.find((entry) => entry.id === 'admin-key').ready).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  config.ADMIN_CONSOLE_API_KEY = 'fixture-admin-key';
  config.CONSOLE_URL = 'http://remote.test';
  data = await read();
  expect(data.setup.find((entry) => entry.id === 'console').ready).toBe(false);
  expect(data.sources.every((source) => source.state === 'unconfigured')).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it('checks administrator authority before any statistics or configuration data is read', async () => {
  for (const who of [
    null,
    { user: { id: 'member' }, guildId: 'guild', roleIds: ['verified'], expiresAt: Date.now() + 60000 },
  ]) {
    session.mockResolvedValue(who);
    expect((await call()).status).toBe(who ? 403 : 401);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('limits concurrent provider reads and sanitizes connection failures', async () => {
  let active = 0,
    maximum = 0;
  fetcher.mockImplementation(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    throw new Error('private connection data');
  });
  const data = await read();
  expect(maximum).toBeLessThanOrEqual(4);
  expect(data.sources.every((source) => source.state === 'error')).toBe(true);
  expect(JSON.stringify(data)).not.toContain('private connection data');
});
it('does not confuse one page of rows with a total and preserves unsafe-size counts', () => {
  const result = summarizeAdminMetrics({
    'get-players': { rows: [{ id: 'one' }] },
    'get-guilds': { total: '9007199254740993123' },
    'get-bases': { total: 0 },
  });
  expect(result.metrics.find((entry) => entry.id === 'players')?.value).toBeNull();
  expect(result.metrics.find((entry) => entry.id === 'guilds')?.value).toBe('9007199254740993123');
  expect(result.metrics.find((entry) => entry.id === 'bases')?.value).toBe(0);
});
