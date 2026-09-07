import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import login from '../src/pages/api/auth/login';
import callback from '../src/pages/api/auth/callback';
import logout from '../src/pages/api/auth/logout';
import map from '../src/pages/api/map';
import player from '../src/pages/api/player';
import market from '../src/pages/api/market';
import marketListings from '../src/pages/api/market/listings';
import marketConfig from '../src/pages/api/market/config';
import exportBase from '../src/pages/api/bases/[baseId]/export';
import status from '../src/pages/api/server/status';
import world from '../src/pages/api/portal/world';
import live from '../src/pages/api/live';
import { runPagesApiHandler, NextResponse } from '../src/infrastructure/pages-api';
import { getDuneClient, getDiscordPlayer } from '../src/infrastructure/dune';
import { getSession, saveSession, deleteSession } from '../src/lib/session-store';
import { checkRateLimit } from '../src/lib/rate-limit';
import { responseMock } from './helpers/response';

vi.mock('../src/infrastructure/dune', () => ({ getDuneClient: vi.fn(), getDiscordPlayer: vi.fn() }));
vi.mock('../src/lib/session-store', () => ({
  getSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  sessionTtlSeconds: () => 43200,
}));
vi.mock('../src/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), getClientAddress: () => 'test' }));
vi.mock('../src/config/env', () => ({
  getServerEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'INFO',
    DISCORD_CLIENT_ID: 'client',
    DISCORD_CLIENT_SECRET: 'secret',
    DISCORD_GUILD_ID: 'guild',
    DISCORD_REDIRECT_URI: 'https://dashboard.test/auth/callback',
    DISCORD_APP_URL: 'https://dashboard.test',
  }),
}));

const routes = [
  ['/api/auth/login', login],
  ['/api/auth/callback', callback],
  ['/api/auth/logout', logout],
  ['/api/map', map],
  ['/api/player', player],
  ['/api/market', market],
  ['/api/market/listings', marketListings],
  ['/api/market/config', marketConfig],
  ['/api/bases/base/export', exportBase],
  ['/api/server/status', status],
  ['/api/portal/world', world],
  ['/api/live', live],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 29, retryAfter: 60 });
  vi.mocked(getSession).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('route contracts after extraction', () => {
  it('authenticates world readings, validates maps, and tolerates a partial provider outage', async () => {
    const denied = responseMock();
    await world({ method: 'GET', url: '/api/portal/world', headers: {} }, denied);
    expect(denied.statusCode).toBe(401);
    expect(getDuneClient).not.toHaveBeenCalled();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    const request = vi.fn(async (_method, route) => {
      if (route.includes('/markers'))
        return {
          capabilities: { spice_active: true },
          rows: [{ type: 'spice_active', sector: 'D5', account_id: 'private' }],
        };
      if (route.includes('/landsraad')) throw new Error('offline');
      return { totalListings: 12 };
    });
    vi.mocked(getDuneClient).mockReturnValue({ request });
    const headers = { cookie: 'dashboard_session=session' };
    const invalid = responseMock();
    await world({ method: 'GET', url: '/api/portal/world?map=Other', headers }, invalid);
    expect(invalid.statusCode).toBe(400);
    expect(request).not.toHaveBeenCalled();
    const valid = responseMock();
    await world({ method: 'GET', url: '/api/portal/world?map=DeepDesert', headers }, valid);
    expect(valid.statusCode).toBe(200);
    expect(JSON.parse(String(valid.body))).toMatchObject({
      spice: { count: 1 },
      council: null,
      market: { listings: 12 },
    });
    expect(JSON.stringify(valid.body)).not.toContain('private');
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('validates and authenticates price ladders before calling the provider', async () => {
    const unauthenticated = responseMock();
    await marketListings({ method: 'GET', url: '/api/market/listings?templateId=Spice', headers: {} }, unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    const request = vi.fn().mockResolvedValue({ rows: [{ id: 'order', stock: '10' }] });
    vi.mocked(getDuneClient).mockReturnValue({ request });
    const invalid = responseMock();
    await marketListings(
      {
        method: 'GET',
        url: '/api/market/listings?templateId=Spice&quality=bad',
        headers: { cookie: 'dashboard_session=session' },
      },
      invalid,
    );
    expect(invalid.statusCode).toBe(400);
    expect(request).not.toHaveBeenCalled();
    const valid = responseMock();
    await marketListings(
      {
        method: 'GET',
        url: '/api/market/listings?templateId=Spice&quality=0',
        headers: { cookie: 'dashboard_session=session' },
      },
      valid,
    );
    expect(valid.statusCode).toBe(200);
    expect(request).toHaveBeenCalledWith('GET', '/api/exchange/listings?templateId=Spice&quality=0');
  });
  it('scopes vehicles and inventory to the linked player and tolerates optional telemetry failures', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    vi.mocked(getDiscordPlayer).mockResolvedValue({ linked: true, pawnId: 'linked-player' });
    const request = vi.fn().mockImplementation(async (_method, path) => {
      if (path.endsWith('/journey')) throw new Error('Unavailable');
      return { rows: [] };
    });
    vi.mocked(getDuneClient).mockReturnValue({ request });
    const res = responseMock();
    await player(
      { method: 'GET', url: '/api/player?playerId=another-user', headers: { cookie: 'dashboard_session=session' } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(request).toHaveBeenCalledWith('GET', '/api/players/linked-player/vehicles');
    expect(request).toHaveBeenCalledWith('GET', '/api/players/linked-player/inventory');
    expect(request.mock.calls.some((call) => call[1] === '/api/vehicles' || call[1].includes('another-user'))).toBe(
      false,
    );
    expect(JSON.parse(res.body as string).details.journey).toBeNull();
  });
  it('denies exports of another player base before calling administrative export', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    vi.mocked(getDiscordPlayer).mockResolvedValue({ linked: true, pawnId: 'player' });
    const request = vi.fn().mockResolvedValue({ rows: [{ id: 'someone-else', relationship: 'shared' }] });
    vi.mocked(getDuneClient).mockReturnValue({ request });
    const res = responseMock();
    await exportBase(
      {
        method: 'GET',
        url: '/api/bases/someone-else/export',
        headers: { cookie: 'dashboard_session=session' },
        query: { baseId: 'someone-else' },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).not.toContain('/export');
  });
  it.each(['/api/auth/logout', '/_next/data/build/api/auth/logout.json'])(
    'does not revoke sessions on a prefetched GET %s',
    async (url) => {
      const res = responseMock();
      await logout({ method: 'GET', url, headers: { cookie: 'dashboard_session=session', purpose: 'prefetch' } }, res);
      expect(res.statusCode).toBe(405);
      expect(deleteSession).not.toHaveBeenCalled();
      expect(res.getHeader('Set-Cookie')).toBeUndefined();
    },
  );

  it('revokes sessions only on intentional same-origin POST', async () => {
    const res = responseMock();
    await logout(
      {
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          host: 'dashboard.test',
          origin: 'https://dashboard.test',
          'x-forwarded-proto': 'https',
          cookie: 'dashboard_session=session',
        },
      },
      res,
    );
    expect(deleteSession).toHaveBeenCalledWith('session');
    expect(res.statusCode).toBe(303);
    expect(res.getHeader('Location')).toBe('https://dashboard.test/');
    expect(String(res.getHeader('Set-Cookie'))).toContain('Max-Age=0');
  });

  it('rejects cross-origin logout without deleting the session', async () => {
    const res = responseMock();
    await logout(
      {
        method: 'POST',
        url: '/api/auth/logout',
        headers: { host: 'dashboard.test', origin: 'https://other.test', cookie: 'dashboard_session=session' },
      },
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(res.getHeader('Set-Cookie')).toBeUndefined();
  });

  it('searches upstream and tolerates unavailable optional market configuration', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ display_name: 'Spice' }], totalCount: 101 })
      .mockResolvedValueOnce({ totalListings: 500 })
      .mockRejectedValueOnce(new Error('Forbidden'));
    vi.mocked(getDuneClient).mockReturnValue({ request });
    const res = responseMock();
    await market(
      { method: 'GET', url: '/api/market?q=Spice%20Melange&page=1', headers: { cookie: 'dashboard_session=session' } },
      res,
    );
    expect(res.statusCode).toBe(200);
    const query = new URL(request.mock.calls[0][1], 'http://test').searchParams;
    expect(query.get('q')).toBe('Spice Melange');
    expect(query.get('page')).toBe('1');
    expect(JSON.parse(res.body as string)).toMatchObject({
      items: { totalCount: 101 },
      marketConfig: null,
      warnings: [expect.any(String)],
    });
  });

  it.each(routes)('rejects unsupported methods at %s before accessing providers', async (url, handler) => {
    const res = responseMock();
    await handler({ method: url.endsWith('/logout') ? 'GET' : 'POST', url, headers: { 'x-request-id': 'trace' } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe(url.endsWith('/logout') ? 'POST' : 'GET');
    expect(res.body).toMatchObject({ requestId: 'trace', code: 'METHOD_NOT_ALLOWED' });
    expect(getDuneClient).not.toHaveBeenCalled();
  });

  it.each(routes.slice(3, 8))('requires a session at %s before accessing providers', async (url, handler) => {
    const res = responseMock();
    await handler({ method: 'GET', url, headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body as string)).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
      requestId: res.getHeader('X-Request-ID'),
    });
    expect(getDuneClient).not.toHaveBeenCalled();
  });

  it('returns a protected error when rate-limit storage is unavailable', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 5,
      storageUnavailable: true,
    });
    const handler = vi.fn();
    const res = responseMock();
    await runPagesApiHandler({ method: 'GET', url: '/api/test', headers: {} }, res, 'GET', handler);
    expect(res.statusCode).toBe(503);
    expect(res.getHeader('Retry-After')).toBe('5');
    expect(handler).not.toHaveBeenCalled();
  });

  it('catches unexpected rate-limit failures inside the API boundary', async () => {
    vi.mocked(checkRateLimit).mockRejectedValue(new Error('private storage details'));
    const res = responseMock();
    await runPagesApiHandler({ method: 'GET', url: '/api/test', headers: {} }, res, 'GET', () =>
      NextResponse.json({ ok: true }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toContain('private storage');
  });

  it('preserves the blueprint attachment without adding an API envelope', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    vi.mocked(getDiscordPlayer).mockResolvedValue({ linked: true, pawnId: 'player' });
    vi.mocked(getDuneClient).mockReturnValue({
      request: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'base', relationship: 'owner' }] })
        .mockResolvedValueOnce({ blueprint: [1, 2] }),
    });
    const res = responseMock();
    await exportBase(
      {
        method: 'GET',
        url: '/api/bases/base/export',
        headers: { cookie: 'dashboard_session=session' },
        query: { baseId: 'base' },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="base-base.json"');
    expect(JSON.parse(res.body as string)).toEqual({ blueprint: [1, 2] });
  });

  it('hides upstream failure details in market responses', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    vi.mocked(getDuneClient).mockReturnValue({ request: vi.fn().mockRejectedValue(new Error('provider-secret')) });
    const res = responseMock();
    await market({ method: 'GET', url: '/api/market', headers: { cookie: 'dashboard_session=session' } }, res);
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body as string)).toMatchObject({
      code: 'UPSTREAM_ERROR',
      error: 'Unable to load market data',
      requestId: res.getHeader('X-Request-ID'),
    });
    expect(res.body).not.toContain('provider-secret');
  });

  it('persists an opaque session and clears OAuth state after a successful callback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'provider-secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'user', username: 'tester' }))
      .mockResolvedValueOnce(Response.json({ roles: ['member'] }));
    vi.stubGlobal('fetch', fetchMock);
    const res = responseMock();
    await callback(
      {
        method: 'GET',
        url: '/api/auth/callback?code=code&state=state',
        headers: { host: 'dashboard.test', cookie: 'oauth_state=state' },
      },
      res,
    );
    expect(res.statusCode).toBe(307);
    expect(res.getHeader('Location')).toBe('https://dashboard.test/portal');
    expect(saveSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({ user: expect.objectContaining({ id: 'user' }), roleIds: ['member'] }),
    );
    const cookies = res.getHeader('Set-Cookie') as string[];
    expect(cookies[0]).toMatch(/^dashboard_session=[a-f0-9]{64};/);
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('Max-Age=43200');
    expect(cookies[1]).toContain('oauth_state=; Max-Age=0');
    expect(JSON.stringify([cookies, vi.mocked(saveSession).mock.calls])).not.toContain('provider-secret');
  });
});
