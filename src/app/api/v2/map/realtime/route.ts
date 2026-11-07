import { AppError } from '../../../../../lib/errors';
import { loadRealtime } from '../../../../../modules/map/server/realtime-snapshot';
import { json, route } from '../../../../../server/http';
import { currentSession } from '../../../../../server/session';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view realtime data.', 401, 'UNAUTHORIZED', true);
  const result = await loadRealtime(session, new URL(request.url).searchParams.get('map'));
  return json(result.body, result.status, { 'Cache-Control': 'private, no-store' });
});
