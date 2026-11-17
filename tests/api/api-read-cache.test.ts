import { beforeEach, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cachedApiReading, clearApiReadCache } from '../../src/server/api-read-cache';
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = session;
  return { getSession, currentSession: () => getSession() };
});
beforeEach(() => {
  clearApiReadCache();
  session.mockReset();
  session.mockResolvedValue({ expiresAt: Date.now() + 60000 });
});
const req = (id: string, url = '/api/player') =>
  ({ method: 'GET', url, headers: { cookie: `dashboard_session=${id}` } }) as NextApiRequest;
const result = (name: string) => ({ body: JSON.stringify({ name }), status: 200, headers: {} });
it('validates sessions on every hit and separates users', async () => {
  const load = vi.fn().mockResolvedValue(result('one'));
  await cachedApiReading(req('one'), {} as NextApiResponse, load);
  await cachedApiReading(req('one'), {} as NextApiResponse, load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(session).toHaveBeenCalledTimes(2);
  await cachedApiReading(req('two'), {} as NextApiResponse, load);
  expect(load).toHaveBeenCalledTimes(2);
  session.mockResolvedValue(null);
  const denied = await cachedApiReading(req('one'), {} as NextApiResponse, async () => ({
    ...result('denied'),
    status: 401,
  }));
  expect(denied.status).toBe(401);
});
it('never caches exports or mutations and separates query filters', async () => {
  const load = vi.fn().mockResolvedValue(result('one'));
  await cachedApiReading(req('one', '/api/market?owner=all'), {} as NextApiResponse, load);
  await cachedApiReading(req('one', '/api/market?owner=player'), {} as NextApiResponse, load);
  await cachedApiReading(req('one', '/api/bases/1/export'), {} as NextApiResponse, load);
  await cachedApiReading(req('one', '/api/bases/1/export'), {} as NextApiResponse, load);
  expect(load).toHaveBeenCalledTimes(4);
});
it('limits how often one session can bypass the cache with a refresh header', async () => {
  const load = vi.fn().mockResolvedValue(result('one'));
  const refreshing = (id: string) =>
    ({
      method: 'GET',
      url: '/api/player',
      headers: { cookie: `dashboard_session=${id}`, 'x-refresh-cache': '1' },
    }) as unknown as NextApiRequest;
  for (let index = 0; index < 10; index += 1)
    await cachedApiReading(refreshing('refresher'), {} as NextApiResponse, load);
  // Six refreshes are honoured; the rest are served from the cache the last one filled.
  expect(load).toHaveBeenCalledTimes(6);
});
