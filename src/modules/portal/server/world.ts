import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getSession } from '../../../lib/session-store';
import { AppError } from '../../../lib/errors';
import { worldReading, type WorldReading } from '../utils/world';
import { totalPlayHours } from '../utils/population';
import { readPopulationHistory } from './population';

// Shared, sanitized world readings only. Authentication is checked on every request.
const cache = new Map<string, { expires: number; value: Promise<WorldReading> }>();

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now())
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const map = new URL(req.url, 'http://localhost').searchParams.get('map') ?? 'HaggaBasin';
  const partitionId = new URL(req.url, 'http://localhost').searchParams.get('partitionId')?.trim() || null;
  if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(map) || (partitionId && !/^[a-zA-Z0-9_.:-]{1,128}$/.test(partitionId)))
    throw new AppError('Invalid map', 400, 'INVALID_MAP', true);
  const cacheKey = `${map}:${partitionId ?? ''}`;
  let reading = cache.get(cacheKey);
  if (!reading || reading.expires <= Date.now()) {
    const client = getDuneClient();
    const value = Promise.allSettled([
      client.request(
        'GET',
        `/api/map/markers?map=${encodeURIComponent(map)}${partitionId ? `&partitionId=${encodeURIComponent(partitionId)}` : ''}&static=0`,
      ),
      client.request('GET', '/api/exchange/stats'),
      client.request('GET', '/api/admin/landsraad'),
      client.request('GET', '/api/players'),
    ]).then((results) => {
      const [markers, market, council, players] = results.map((result) =>
        result.status === 'fulfilled' ? result.value : null,
      );
      return {
        ...worldReading(map, markers, market, council),
        partitionId,
        totalPlayHours: totalPlayHours(players),
      };
    });
    reading = { expires: Date.now() + 30000, value };
    cache.set(cacheKey, reading);
  }
  const [world, population] = await Promise.all([reading.value, readPopulationHistory()]);
  return NextResponse.json({ ...world, population }, { headers: { 'Cache-Control': 'no-store' } });
}
