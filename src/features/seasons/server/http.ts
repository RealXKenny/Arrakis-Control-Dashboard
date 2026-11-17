import '../../../lib/assert-server';
import { z } from 'zod';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { verifyObjective, syncSeasonObjectives } from './observations';
import { identifier } from '../contracts';
import { claimAllAvailable, claimGameReward, loadGameClaims } from './claims';
import { fail, listSeasons, loadAssignment, loadMember } from './store';
import { claimReward, equipReward } from './engine';

const memberAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), seasonId: identifier }).strict(),
  z.object({ action: z.literal('verify'), seasonId: identifier, challengeId: identifier }).strict(),
  z.object({ action: z.literal('claim'), seasonId: identifier, rewardId: identifier }),
  z.object({ action: z.literal('equip'), seasonId: identifier, rewardId: identifier }),
  z.object({ action: z.literal('claim-rewards'), seasonId: identifier, rewardId: identifier }).strict(),
  z.object({ action: z.literal('claim-all'), seasonId: identifier }).strict(),
]);
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const bytes = await readBoundedBody(request, 256 * 1024);
  if (!bytes) throw new AppError('Season request too large.', 413, 'BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail('Enter valid season details.', 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Invalid season details.', 400);
  return parsed.data;
}
/** Browser-safe claim view: component statuses only, never character IDs or administrator notes. */
async function ownGameClaims(id: string, owner: string) {
  const claims = await loadGameClaims(id, owner);
  return Object.fromEntries(
    Object.values(claims.value).map((r) => [r.rewardId, r.components.map((c) => ({ status: c.status }))]),
  );
}
export async function getSeasons(request: Request) {
  const session = await requireApiSession();
  const params = new URL(request.url).searchParams;
  const id = params.get('season');
  if (id) {
    if (!identifier.safeParse(id).success) fail('Invalid season ID.', 400);
    const data = await loadMember(id, session.user.id);
    if (['draft', 'preview'].includes(data.season.value.phase)) fail('Season not published.', 404);
    return json({
      ok: true,
      season: data.season.value,
      progress: data.progress.value,
      totals: data.totals.value,
      assignment: await loadAssignment(id, session.user.id),
      gameClaims: await ownGameClaims(id, session.user.id),
    });
  }
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .safeParse(params.get('offset') ?? 0);
  if (!offset.success) fail('Invalid history page.', 400);
  const seasons = (await listSeasons(offset.data)).filter((v) => !['draft', 'preview'].includes(v.phase));
  const members = await Promise.all(seasons.map((v) => loadMember(v.id, session.user.id)));
  return json({
    ok: true,
    seasons: await Promise.all(
      members.map(async (v) => ({
        season: v.season.value,
        progress: v.progress.value,
        totals: v.totals.value,
      })),
    ),
    nextOffset: offset.data + 25,
  });
}
export async function mutateSeasons(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:seasons:${session.user.id}`, { limit: 30, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Season actions temporarily limited. Try again shortly.',
      limit.storageUnavailable ? 503 : 429,
      'SEASON_RATE_LIMIT',
      true,
    );
  const action = await body(request, memberAction);
  const id = action.seasonId;
  const owner = session.user.id;
  if (action.action === 'sync') return json({ ok: true, ...(await syncSeasonObjectives(session, id, request.signal)) });
  if (action.action === 'claim') return json({ ok: true, ...(await claimReward(id, owner, action.rewardId)) });
  if (action.action === 'claim-rewards')
    return json({ ok: true, result: await claimGameReward(id, owner, action.rewardId) });
  if (action.action === 'claim-all') return json({ ok: true, ...(await claimAllAvailable(id, owner)) });
  if (action.action === 'equip') return json({ ok: true, progress: await equipReward(id, owner, action.rewardId) });
  return json({ ok: true, ...(await verifyObjective(session, id, action.challengeId, request.signal)) });
}
