import { AppError } from '../../../../../lib/errors';
import { currentSession } from '../../../../../features/auth/server/session';
import { readHubPoi } from '../../../../../features/map/server/hub-poi';
import { json, route } from '../../../../../server/http';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const GET = route(async (request: Request) => {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view the map.', 401, 'UNAUTHORIZED', true);
  // Only Harko Village uses Console points of interest; Arrakeen keeps its community markers.
  if (new URL(request.url).searchParams.get('map') !== 'HarkoVillage')
    return json({ ok: false, error: 'Invalid map' }, 400);
  const limit = await checkRateLimit(`map-poi:${session.user.id}`, { limit: 30, windowMs: 60000 });
  if (!limit.allowed)
    return json({ ok: false, error: 'Map points temporarily unavailable.' }, limit.storageUnavailable ? 503 : 429);
  const points = await readHubPoi(session, 'HarkoVillage');
  return points ? json({ ok: true, points }) : json({ ok: false, error: 'Map points unavailable.' }, 503);
});
