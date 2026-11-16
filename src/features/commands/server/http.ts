import '../../../lib/assert-server';
import { json, requireApiSession } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { lookupAssets } from './lookup';
export async function getCommandAssets(request: Request) {
  const session = await requireApiSession();
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== 'q') || params.getAll('q').length !== 1)
    throw new AppError('Provide one search query.', 400, 'INVALID_QUERY', true);
  const limit = await checkRateLimit(`v2:command-assets:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Asset searches are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'LOOKUP_LIMITED',
      true,
    );
  return json(await lookupAssets(session, params.get('q') ?? '', request.signal));
}
