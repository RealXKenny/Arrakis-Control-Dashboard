import { AppError } from '../../../../../lib/errors';
import { ID_PATTERN } from '../../../../../features/casino/server/request';
import { verifyOwnRound } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

/** Verification inputs for one of the caller's own finished rounds (available once its seed is retired). */
export const GET = route(async (request: Request) => {
  const session = await requireApiSession();
  const id = new URL(request.url).searchParams.get('round') ?? '';
  if (!ID_PATTERN.test(id)) throw new AppError('Round not found.', 404, 'NOT_FOUND', true);
  return json({ ok: true, verification: await verifyOwnRound(session, id) });
});
