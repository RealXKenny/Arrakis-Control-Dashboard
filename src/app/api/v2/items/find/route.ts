import { json, requireApiSession, route } from '../../../../../server/http';
import { findItems } from '../../../../../features/player/server/item-finder';

import { checkRateLimit } from '../../../../../lib/security/rate-limit';
import { AppError } from '../../../../../lib/errors';

export const GET = route(async (request: Request) => {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:item-finder:${session.user.id}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed)
    throw new AppError(`Search limit reached. Try again in ${limit.retryAfter} seconds.`, 429, 'RATE_LIMITED', true);
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return json(await findItems(session, query, request.signal));
});
