import { AppError } from '../../../../../lib/errors';
import { currentSession } from '../../../../../features/auth/server/session';
import { isMapName } from '../../../../../features/map/maps';
import { readLivePlayer } from '../../../../../features/map/server/live-player';
import { json, route } from '../../../../../server/http';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const GET = route(async (request: Request) => {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view the map.', 401, 'UNAUTHORIZED', true);
  const map = new URL(request.url).searchParams.get('map') ?? '';
  if (!isMapName(map)) return json({ ok: false, error: 'Invalid map' }, 400);
  const limit = await checkRateLimit(`map-live:${session.user.id}`, { limit: 60, windowMs: 60000 });
  if (!limit.allowed)
    return json({ ok: false, error: 'Live position temporarily unavailable.' }, limit.storageUnavailable ? 503 : 429);
  return json({ ok: true, position: await readLivePlayer(session, map) });
});
