import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { CacheUnavailableError } from '../../../lib/cache/shared-cache';
import { currentSession } from '../../auth/server/session';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { json } from '../../../server/http';
import { DUNGEON_ID_PATTERN } from '../model';
import { readDungeonBoard, readDungeonRuns, readPersonalBests, refreshSeconds, toFreshness } from './leaderboard';

const VIEWS = new Set(['board', 'runs', 'personal']);

function integer(value: string | null, max: number): number | null {
  if (value === null || value === '') return null;
  if (!/^\d{1,6}$/.test(value)) throw new AppError('Invalid filter.', 400, 'INVALID_QUERY', true);
  const parsed = Number(value);
  if (parsed > max) throw new AppError('Invalid filter.', 400, 'INVALID_QUERY', true);
  return parsed;
}

const unavailable = () =>
  json({ ok: false, error: 'Dungeon records are temporarily unavailable.', code: 'UNAVAILABLE' }, 503);

/**
 * `GET /api/v2/dungeons?view=board|runs|personal`. Members only. Board and run pages are shared readings served from
 * the cache; a browser asking more often than the refresh interval never reaches the Console. Personal bests resolve
 * the member's own linked character freshly on every request and are never accepted from a client-supplied id.
 */
export async function dungeonsApi(request: Request): Promise<Response> {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view dungeon records.', 401, 'UNAUTHORIZED', true);
  const params = new URL(request.url).searchParams;
  const view = params.get('view') ?? 'board';
  if (!VIEWS.has(view)) throw new AppError('Invalid view.', 400, 'INVALID_QUERY', true);

  const limit = await checkRateLimit(`dungeons:${view === 'personal' ? 'personal' : 'read'}:${session.user.id}`, {
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
          interactionId: `dungeons-${Date.now()}`,
          commandName: 'portal',
        },
        { timeout: 5000 },
      ).catch(() => null);
      if (!linked) return unavailable();
      const playerId = linked.pawnId == null ? '' : String(linked.pawnId);
      if (!linked.linked || !/^\d{1,20}$/.test(playerId))
        return json({ ok: true, linked: false, board: null, freshness: null });
      const reading = await readPersonalBests(playerId);
      return json({ ok: true, linked: true, board: reading.data, freshness: toFreshness(reading) });
    }

    const board = await readDungeonBoard();
    if (view === 'board')
      return json({ ok: true, board: board.data, freshness: toFreshness(board), refreshSeconds: refreshSeconds() });

    const dungeonId = params.get('dungeonId');
    if (dungeonId && !DUNGEON_ID_PATTERN.test(dungeonId))
      throw new AppError('Invalid filter.', 400, 'INVALID_QUERY', true);
    const runs = await readDungeonRuns(
      {
        page: integer(params.get('page'), 1_000_000) ?? 0,
        dungeonId: dungeonId || null,
        difficulty: integer(params.get('difficulty'), 1_000_000),
      },
      board.data,
    );
    return json({ ok: true, runs: runs.data, freshness: toFreshness(runs) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof CacheUnavailableError) return unavailable();
    // Any upstream failure without a cached reading is an honest "unavailable", never zeros or an empty board.
    return unavailable();
  }
}
