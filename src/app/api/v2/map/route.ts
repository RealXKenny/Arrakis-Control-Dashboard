import { AppError } from '../../../../lib/errors';
import { REALTIME_MAPS } from '../../../../modules/map/server/realtime-snapshot';
import { loadMapData } from '../../../../modules/map/server/load-map';
import { json, route } from '../../../../server/http';
import { currentSession } from '../../../../server/session';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view the map.', 401, 'UNAUTHORIZED', true);
  const requested = new URL(request.url).searchParams.get('map') ?? 'HaggaBasin';
  if (!(REALTIME_MAPS as readonly string[]).includes(requested)) {
    return json({ ok: false, error: 'Invalid map' }, 400);
  }
  const result = await loadMapData(session, requested);
  return json(result.body, result.status);
});
