import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { currentSession } from '../../auth/server/session';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { assertSameOrigin, json } from '../../../server/http';
import type { DashboardSession } from '../../auth/server/session-store';
import { REFRESH_SECONDS, findEntry, publicBoard, readSolarisBoard, toFreshness } from './leaderboard';
import { claimPrize, prizesFor } from './prizes';
import {
  WEEK_MS,
  configuredPrizes,
  isWeekId,
  loadCredits,
  loadWeek,
  publicStandings,
  standings,
  weekId,
  weekStart,
} from './weekly';

const VIEWS = new Set(['board', 'personal', 'weekly']);

const unavailable = () =>
  json({ ok: false, error: 'The Solaris leaderboard is temporarily unavailable.', code: 'UNAVAILABLE' }, 503);

async function limited(key: string, limit: number) {
  const result = await checkRateLimit(key, { limit, windowMs: 60_000 });
  if (result.allowed) return null;
  return json(
    { ok: false, error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' },
    result.storageUnavailable ? 503 : 429,
    { 'Retry-After': String(Math.max(1, result.retryAfter)) },
  );
}

/** The member's own character, checked freshly through the Discord adapter. Never taken from the request. */
async function linkedCharacter(session: DashboardSession) {
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
  if (!linked) return null;
  const pawnId = linked.pawnId == null ? '' : String(linked.pawnId);
  return { linked: Boolean(linked.linked) && /^\d{1,20}$/.test(pawnId), pawnId, onlineStatus: linked.onlineStatus };
}

async function weeklyView(now = Date.now()) {
  const start = weekStart(now);
  const [week, last] = await Promise.all([loadWeek(weekId(start)), loadWeek(weekId(start - WEEK_MS))]);
  const rows = week ? standings(week, await loadCredits(week.id)) : [];
  return {
    rows,
    body: {
      ok: true,
      week: {
        id: weekId(start),
        startsAt: start,
        endsAt: start + WEEK_MS,
        updatedAt: week?.latestAt || null,
        standings: publicStandings(rows),
      },
      prizes: configuredPrizes(),
      last: last?.closed
        ? {
            id: last.id,
            winners: last.closed.winners.map(({ place, name, gain, prize }) => ({ place, name, gain, prize })),
          }
        : null,
    },
  };
}

/**
 * `GET /api/v2/solaris?view=board|personal|weekly`. Members only. The board is one shared reading served from the
 * cache, so a browser asking more often than the refresh interval never reaches the Console. The personal view
 * resolves the member's own linked character freshly on every request and never accepts a client-supplied player id.
 */
export async function solarisApi(request: Request): Promise<Response> {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to view the Solaris leaderboard.', 401, 'UNAUTHORIZED', true);
  const view = new URL(request.url).searchParams.get('view') ?? 'board';
  if (!VIEWS.has(view)) throw new AppError('Invalid view.', 400, 'INVALID_QUERY', true);
  const blocked = await limited(`solaris:${view}:${session.user.id}`, view === 'personal' ? 10 : 60);
  if (blocked) return blocked;

  try {
    if (view === 'weekly') return json((await weeklyView()).body);
    if (view === 'personal') {
      const character = await linkedCharacter(session);
      if (!character) return unavailable();
      if (!character.linked)
        return json({ ok: true, linked: false, entry: null, freshness: null, weekly: null, prizes: [] });
      const [reading, weekly, prizes] = await Promise.all([
        readSolarisBoard(),
        weeklyView().catch(() => null),
        prizesFor(character.pawnId).catch(() => []),
      ]);
      const index = weekly ? weekly.rows.findIndex((row) => row.id === character.pawnId) : -1;
      const mine =
        weekly && index >= 0
          ? { rank: publicStandings(weekly.rows, index + 1)[index]!.rank, gain: weekly.rows[index]!.gain }
          : null;
      return json({
        ok: true,
        linked: true,
        entry: findEntry(reading.data, character.pawnId),
        freshness: toFreshness(reading),
        weekly: mine,
        prizes,
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

/** `POST /api/v2/solaris` `{ action: "claim", weekId }`: collect a weekly prize for the member's own character. */
export async function solarisMutation(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to collect prizes.', 401, 'UNAUTHORIZED', true);
  const blocked = await limited(`solaris:claim:${session.user.id}`, 5);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  const action = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (action.action !== 'claim' || !isWeekId(action.weekId))
    throw new AppError('Invalid request.', 400, 'INVALID_REQUEST', true);
  const character = await linkedCharacter(session);
  if (!character) return unavailable();
  if (!character.linked) throw new AppError('Link your character before collecting prizes.', 409, 'NOT_LINKED', true);
  const result = await claimPrize(action.weekId, character, session.user.id);
  return json({ ok: true, ...result });
}
