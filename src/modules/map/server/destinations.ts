import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getSession } from '../../../lib/session-store';
import { normalizeMapDestinations } from '../utils/destinations';

function value(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'fulfilled' ? result.value : null;
}

export async function GET(req, res) {
  const sessionId = cookies(req, res).get('dashboard_session')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.expiresAt <= Date.now())
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const client = getDuneClient();
  const partitions = await client.request('GET', '/api/map/partitions').catch(() => null);
  const authoritative = normalizeMapDestinations(null, null, null, partitions);
  if (authoritative.length) {
    const ids = authoritative
      .filter((entry) => entry.kind === 'sietch' && entry.partitionId)
      .map((entry) => entry.partitionId)
      .join(',');
    const [dimensionsResult, haggaCombatResult, deepDesertCombatResult] = await Promise.allSettled([
      ids ? client.request('GET', `/api/sietches/dimensions?ids=${encodeURIComponent(ids)}`) : Promise.resolve(null),
      client.request('GET', '/api/maps/combat-state?map=Survival_1'),
      client.request('GET', '/api/maps/combat-state?map=DeepDesert_1'),
    ]);
    const dimensions = value(dimensionsResult);
    const combatStates = [value(haggaCombatResult), value(deepDesertCombatResult)];
    const destinations = normalizeMapDestinations(null, dimensions, null, partitions, combatStates);
    return NextResponse.json(
      { ok: true, data: destinations },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  }

  const [sietchesResult, deepDesertResult] = await Promise.allSettled([
    client.request('GET', '/api/sietches'),
    client.request('GET', '/api/deepdesert'),
  ]);
  const sietches = value(sietchesResult);
  const deepDesert = value(deepDesertResult);
  const initial = normalizeMapDestinations(sietches, null, deepDesert);
  const ids = initial
    .filter((entry) => entry.kind === 'sietch' && entry.partitionId)
    .map((entry) => entry.partitionId)
    .join(',');
  const dimensions = ids
    ? await client.request('GET', `/api/sietches/dimensions?ids=${encodeURIComponent(ids)}`).catch(() => null)
    : null;
  const destinations = normalizeMapDestinations(sietches, dimensions, deepDesert);

  return NextResponse.json(
    { ok: true, data: destinations },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
