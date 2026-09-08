import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getSession } from '../../../lib/session-store';
import { AppError } from '../../../lib/errors';
import { worldReading, type WorldReading } from '../utils/world';
import { readPopulationHistory } from './population';

// Shared, sanitized world readings only. Authentication is checked on every request.
const cache = new Map<string, { expires: number; value: Promise<WorldReading> }>();

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now())
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const map = new URL(req.url, 'http://localhost').searchParams.get('map') ?? 'HaggaBasin';
  if (!['DeepDesert', 'HaggaBasin'].includes(map)) throw new AppError('Invalid map', 400, 'INVALID_MAP', true);
  let reading = cache.get(map);
  if (!reading || reading.expires <= Date.now()) {
    const client = getDuneClient();
    const value = Promise.allSettled([
      client.request('GET', `/api/map/markers?map=${map}&static=0`),
      client.request('GET', '/api/exchange/stats'),
      client.request('GET', '/api/admin/landsraad'),
    ]).then((results) => {
      const [markers, market, council] = results.map((result) => (result.status === 'fulfilled' ? result.value : null));
      return worldReading(map, markers, market, council);
    });
    reading = { expires: Date.now() + 30000, value };
    cache.set(map, reading);
  }
  const [world, population] = await Promise.all([reading.value, readPopulationHistory()]);
  return NextResponse.json({ ...world, population }, { headers: { 'Cache-Control': 'no-store' } });
}
