import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { currentSession } from '../../auth/server/session';
import { id } from '../../player/server/item-finder';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { json } from '../../../server/http';
import { recapYear } from '../model';
import { personalRecap, serverRecap } from './recap';

const VIEWS = new Set(['server', 'personal']);

/**
 * `GET /api/v2/unwrapped?view=server|personal`. Members only. The server recap is composed from shared cached
 * readings; the personal recap resolves the member's own linked character freshly on every request and never
 * accepts a client-supplied player or character id.
 */
export async function unwrappedApi(request: Request): Promise<Response> {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to see Unwrapped.', 401, 'UNAUTHORIZED', true);
  const view = new URL(request.url).searchParams.get('view') ?? 'server';
  if (!VIEWS.has(view)) throw new AppError('Invalid view.', 400, 'INVALID_QUERY', true);

  const limit = await checkRateLimit(`unwrapped:${view}:${session.user.id}`, {
    limit: view === 'personal' ? 10 : 30,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    return json(
      { ok: false, error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' },
      limit.storageUnavailable ? 503 : 429,
      { 'Retry-After': String(Math.max(1, limit.retryAfter)) },
    );

  if (view === 'server') return json({ ok: true, recap: await serverRecap() });

  const linked = await getLinkedPlayer(
    {
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds ?? [],
      interactionId: `unwrapped-${Date.now()}`,
      commandName: 'portal',
    },
    { timeout: 5000 },
  ).catch(() => null);
  if (!linked)
    return json(
      { ok: false, error: 'Your linked character could not be checked right now.', code: 'UNAVAILABLE' },
      503,
    );
  const playerId = linked.pawnId == null ? null : String(linked.pawnId);
  const pawn = playerId && /^\d{1,20}$/.test(playerId) ? playerId : null;
  if (!linked.linked || !pawn) {
    const year = recapYear(Date.now());
    return json({
      ok: true,
      recap: {
        year,
        linked: false,
        character: null,
        dungeons: null,
        solaris: null,
        journey: null,
        tracking: null,
      },
    });
  }
  // Same character key the progression planner uses, so the journal read is the member's own.
  const character = id(linked.controllerId) ? id(linked.pawnId ?? linked.controllerId) : null;
  const name = linked.characterName?.trim().slice(0, 64) || null;
  return json({ ok: true, recap: await personalRecap(session.user.id, { playerId: pawn, character, name }) });
}
