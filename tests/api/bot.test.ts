import { beforeEach, expect, it, vi } from 'vitest';
import route from '../../src/pages/api/v1/bot/world';
import { responseMock } from '../helpers/response';
import { readWorld } from '../../src/modules/portal/server/world';
import { checkRateLimit } from '../../src/lib/rate-limit';

const config = vi.hoisted(() => ({ BOT_API_TOKEN: 'independent-bot-credential-32-characters' as string | undefined }));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', ...config }) }));
vi.mock('../../src/modules/portal/server/world', () => ({ readWorld: vi.fn() }));
vi.mock('../../src/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), getClientAddress: () => 'test' }));

async function call(authorization?: string, url = '/api/v1/bot/world?map=DeepDesert', method = 'GET') {
  const res = responseMock();
  await route({ method, url, headers: { authorization, cookie: 'dashboard_session=member' } }, res);
  return { res, body: typeof res.body === 'string' ? JSON.parse(res.body) : res.body };
}

beforeEach(() => {
  vi.clearAllMocks();
  config.BOT_API_TOKEN = 'independent-bot-credential-32-characters';
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 59, retryAfter: 60 });
  vi.mocked(readWorld).mockResolvedValue({
    map: 'DeepDesert',
    observedAt: '2026-10-26T12:00:00Z',
    spice: null,
    nextCycleAt: null,
    market: null,
    council: null,
  });
});

it('is disabled by default and never substitutes a browser session for service authentication', async () => {
  config.BOT_API_TOKEN = undefined;
  expect((await call()).res.statusCode).toBe(503);
  config.BOT_API_TOKEN = 'independent-bot-credential-32-characters';
  for (const header of [undefined, 'Bearer wrong', 'Basic token', `Bearer ${'x'.repeat(300)}`]) {
    const { res, body } = await call(header);
    expect(res.statusCode).toBe(401);
    expect(res.getHeader('WWW-Authenticate')).toContain('Bearer');
    expect(JSON.stringify(body)).not.toContain(config.BOT_API_TOKEN);
  }
  expect(readWorld).not.toHaveBeenCalled();
});

it('serves only the versioned shared-data response with no-store headers', async () => {
  const { res, body } = await call(`Bearer ${config.BOT_API_TOKEN}`);
  expect(res.statusCode).toBe(200);
  expect(body).toMatchObject({ ok: true, apiVersion: '1', data: { map: 'DeepDesert' } });
  expect(res.getHeader('Cache-Control')).toContain('no-store');
  expect(readWorld).toHaveBeenCalledWith('DeepDesert');
  expect(checkRateLimit).toHaveBeenCalledWith('bot:v1:world', { limit: 60, windowMs: 60000 });
});

it('rejects user impersonation, URL credentials, duplicate parameters, and mutations', async () => {
  for (const query of ['?userId=123', '?token=secret', '?map=DeepDesert&map=HaggaBasin'])
    expect((await call(`Bearer ${config.BOT_API_TOKEN}`, `/api/v1/bot/world${query}`)).res.statusCode).toBe(400);
  expect((await call(`Bearer ${config.BOT_API_TOKEN}`, undefined, 'POST')).res.statusCode).toBe(405);
  expect(readWorld).not.toHaveBeenCalled();
});

it('enforces the credential-wide budget independently of IP limits', async () => {
  vi.mocked(checkRateLimit)
    .mockResolvedValueOnce({ allowed: true, remaining: 100, retryAfter: 60 })
    .mockResolvedValueOnce({ allowed: true, remaining: 100, retryAfter: 60 })
    .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 12 });
  const { res } = await call(`Bearer ${config.BOT_API_TOKEN}`);
  expect(res.statusCode).toBe(429);
  expect(res.getHeader('Retry-After')).toBe('12');
  expect(readWorld).not.toHaveBeenCalled();
});
