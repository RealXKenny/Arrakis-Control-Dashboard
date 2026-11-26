import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import type { DashboardSession } from '../../auth/server/session-store';
import { resolveItemCharacter } from '../../player/server/item-finder';
import { loadPortalProfile } from '../../portal/server/load';
import { journalInputSchema, plannerInputSchema } from '../model';
import { readingFromProfile, snapshotOf } from '../reading';
import { clearJournal, mutatePlanner, readJournal, readPlanner, recordSnapshot } from './store';

async function limited(session: DashboardSession, scope: string, limit: number) {
  const result = await checkRateLimit(`v2:progression:${scope}:${session.user.id}`, { limit, windowMs: 60_000 });
  if (!result.allowed || result.storageUnavailable)
    throw new AppError(
      'Progression planner requests are temporarily limited.',
      result.storageUnavailable ? 503 : 429,
      'PROGRESSION_LIMITED',
      true,
    );
}
/** The fresh adapter link decides the character; a client-supplied ID only guards against a changed link. */
async function character(session: DashboardSession, expected?: string) {
  const { player } = await resolveItemCharacter(session);
  if (expected !== undefined && expected !== player)
    throw new AppError('Your linked character changed. Reload the planner.', 409, 'CHARACTER_CHANGED', true);
  return player;
}
async function body(request: Request, maxBytes: number): Promise<unknown> {
  assertSameOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send planner changes as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, maxBytes);
  if (!bytes) throw new AppError('Planner change exceeds the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid planner details.', 400, 'INVALID_PROGRESSION', true);
  }
}

export async function getPlanner() {
  const session = await requireApiSession();
  await limited(session, 'planner', 30);
  const player = await character(session);
  const [record, journal] = await Promise.all([
    readPlanner(session.user.id, player),
    readJournal(session.user.id, player),
  ]);
  return json({ character: player, record, journal });
}

export async function postPlanner(request: Request) {
  const raw = await body(request, 16384);
  const session = await requireApiSession();
  await limited(session, 'planner', 30);
  const parsed = plannerInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Check the planner fields.', 400, 'INVALID_PROGRESSION', true);
  const player = await character(session, parsed.data.character);
  return json({ character: player, record: await mutatePlanner(session.user.id, player, parsed.data) });
}

/**
 * Records or clears observation snapshots. Readings come only from the session-owned profile; tracking must be on.
 * Nothing is backfilled, and a recording that is not yet due leaves the journal unchanged.
 */
export async function postJournal(request: Request) {
  const raw = await body(request, 1024);
  const session = await requireApiSession();
  await limited(session, 'journal', 6);
  const parsed = journalInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Check the journal request.', 400, 'INVALID_PROGRESSION', true);
  const player = await character(session, parsed.data.character);
  if (parsed.data.action === 'clear')
    return json({ journal: await clearJournal(session.user.id, player, parsed.data.revision), recorded: false });
  const planner = await readPlanner(session.user.id, player);
  if (!planner.tracking.enabled)
    throw new AppError('Start tracking before recording observations.', 409, 'TRACKING_DISABLED', true);
  const profile = await loadPortalProfile(session);
  if (profile.status === 'limited')
    throw new AppError('Character read capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  if (profile.status !== 'ok')
    throw new AppError(
      'Character readings are unavailable, so nothing was recorded.',
      503,
      'READING_UNAVAILABLE',
      true,
    );
  if (String(profile.profile.legacyCharacter.playerId) !== player)
    throw new AppError('Your linked character changed. Reload the planner.', 409, 'CHARACTER_CHANGED', true);
  const reading = readingFromProfile(profile.profile, profile.capturedAt ?? new Date().toISOString());
  return json(
    await recordSnapshot(
      session.user.id,
      player,
      parsed.data.revision,
      snapshotOf(reading),
      parsed.data.action === 'record',
    ),
  );
}
