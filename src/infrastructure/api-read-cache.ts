import '../lib/assert-server';
import { createHash } from 'node:crypto';
import { cookies } from './cookies';
import { getSession } from '../lib/session-store';
import { ReadCache } from '../lib/read-cache';
import type { NextApiRequest, NextApiResponse } from 'next';

type ApiReading = { body: string | null; status: number; headers: Record<string, string> };
const cache = new ReadCache<ApiReading>(
  (value) => Buffer.byteLength(value.body ?? ''),
  (value) => value.status === 200,
);
const reads = new Set([
  '/api/player',
  '/api/map',
  '/api/map/destinations',
  '/api/market',
  '/api/market/config',
  '/api/market/listings',
  '/api/portal/world',
  '/api/server/status',
]);
export const cacheScope = (id: string) => createHash('sha256').update(`read-cache:${id}`).digest('hex');
export function clearApiReadCache() {
  cache.clear();
}
export function invalidateApiReads(req: NextApiRequest, res: NextApiResponse) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  if (id) cache.clear(`${cacheScope(id)}:`);
}
export async function cachedApiReading(
  req: NextApiRequest,
  res: NextApiResponse,
  load: () => Promise<ApiReading>,
): Promise<ApiReading> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (req.method !== 'GET' || !reads.has(url.pathname)) return load();
  let scope = 'public';
  if (url.pathname !== '/api/server/status') {
    const id = cookies(req, res).get('dashboard_session')?.value;
    const session = id ? await getSession(id) : null;
    // Run the feature's normal unauthorized handling; never serve a cached private body.
    if (!id || !session || session.expiresAt <= Date.now()) return load();
    scope = cacheScope(id);
  }
  url.searchParams.sort();
  const entry = await cache.get(`${scope}:${url.pathname}${url.search}`, load, req.headers['x-refresh-cache'] === '1');
  return { ...entry.data, headers: { ...entry.data.headers, 'X-Data-Captured-At': String(entry.capturedAt) } };
}
