import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { currentSession } from '../../auth/server/session';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { json } from '../../../server/http';
import { REFRESH_SECONDS, findEntry, publicBoard, readSolarisBoard, toFreshness } from './leaderboard';

const VIEWS = new Set(['board', 'personal']);

const unavailable = () =>
  json({ ok: false, error: 'The Solaris leaderboard is temporarily unavailable.', code: 'UNAVAILABLE' }, 503);

/**
 * `GET /api/v2/solaris?view=board|personal`. Members only. The board is one shared reading served from the cache, so
 * a browser asking more often than the refresh interval never reaches the Console. The personal view resolves the
 * member's own linked character freshly on every request and never accepts a client-supplied player id.
 */
export async function solarisApi(request: Request): Promise<Response> {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view the Solaris leaderboard.', 401, 'UNAUTHORIZED', true);
  const view = new URL(request.url).searchParams.get('view') ?? 'board';
  if (!VIEWS.has(view)) throw new AppError('Invalid view.', 400, 'INVALID_QUERY', true);

  const limit = await checkRateLimit(`solaris:${view}:${session.user.id}`, {
    limit: view === 'personal' ? 10 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    return json(
      { ok: false, error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' },
      limit.storageUnavailable ? 503 : 429,
      { 'Retry-After': String(Math.max(1, limit.retryAfter)) },
    );

  try {
    if (view === 'personal') {
      const linked = await getLinkedPlayer(
        {
          guildId: session.guildId,
          channelId: 'dashboard',
          userId: session.user.id,
          username: session.user.username,
          roleIds: session.roleIds ?? [],
          interactionId: `solaris-${Date.now()}`,
          commandName: 'portal',
        },
        { timeout: 5000 },
      ).catch(() => null);
      if (!linked) return unavailable();
      const playerId = linked.pawnId == null ? '' : String(linked.pawnId);
      if (!linked.linked || !/^\d{1,20}$/.test(playerId))
        return json({ ok: true, linked: false, entry: null, freshness: null });
      const reading = await readSolarisBoard();
      return json({
        ok: true,
        linked: true,
        entry: findEntry(reading.data, playerId),
        freshness: toFreshness(reading),
      });
    }

    const reading = await readSolarisBoard();
    return json({
      ok: true,
      board: publicBoard(reading.data),
      freshness: toFreshness(reading),
      refreshSeconds: REFRESH_SECONDS,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Any upstream failure without a cached reading is an honest "unavailable", never zeros or an empty board.
    return unavailable();
  }
}
