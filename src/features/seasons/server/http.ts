import '../../../lib/assert-server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { requireApiAdmin, spendAdminBudget } from '../../admin/server/api-access';
import { requireRecentSignIn } from '../../admin/server/access';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { definitionSchema, identifier, seasonTemplate } from '../contracts';
import { adminRecords, fail, listSeasons, loadMember, loadSeason, seasonKeys, readRecord } from './store';
import {
  saveSeason,
  transitionSeason,
  submitChallenge,
  reviewSubmission,
  claimReward,
  equipReward,
  correctXp,
  manageDelivery,
} from './engine';

const evidenceLink = z
  .string()
  .url()
  .max(500)
  .refine(
    (v) => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password,
    'Evidence links must use HTTPS without credentials.',
  );
const memberAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    seasonId: identifier,
    challengeId: identifier,
    text: z.string().trim().min(10).max(2000),
    links: z.array(evidenceLink).max(3),
    requestId: z.string().uuid(),
  }),
  z.object({ action: z.literal('verify'), seasonId: identifier, challengeId: identifier }),
  z.object({ action: z.literal('claim'), seasonId: identifier, rewardId: identifier }),
  z.object({ action: z.literal('equip'), seasonId: identifier, rewardId: identifier }),
]);
const adminAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delivery-request'),
    seasonId: identifier,
    owner: identifier,
    description: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal('delivery-review'),
    seasonId: identifier,
    deliveryId: z.string().uuid(),
    approve: z.boolean(),
    note: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal('save'),
    seasonId: identifier,
    revision: z.string().max(36),
    definition: definitionSchema,
  }),
  z.object({ action: z.literal('duplicate'), seasonId: identifier }),
  z.object({
    action: z.literal('transition'),
    seasonId: identifier,
    revision: z.string().uuid(),
    transition: z.enum(['draft', 'preview', 'publish', 'end', 'archive']),
    confirmation: z.string().max(120),
  }),
  z.object({
    action: z.literal('review'),
    seasonId: identifier,
    owner: identifier,
    submissionId: z.string().uuid(),
    approve: z.boolean(),
    note: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal('correct'),
    seasonId: identifier,
    owner: identifier,
    delta: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(10).max(500),
    operationId: z.string().uuid(),
  }),
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
export async function getSeasons(request: Request) {
  const session = await requireApiSession();
  const params = new URL(request.url).searchParams;
  const id = params.get('season');
  if (id) {
    if (!identifier.safeParse(id).success) fail('Invalid season ID.', 400);
    const data = await loadMember(id, session.user.id);
    if (['draft', 'preview'].includes(data.season.value.phase)) fail('Season not published.', 404);
    return json({ ok: true, season: data.season.value, progress: data.progress.value, totals: data.totals.value });
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
    seasons: members.map((v) => ({ season: v.season.value, progress: v.progress.value, totals: v.totals.value })),
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
  if (action.action === 'claim') return json({ ok: true, ...(await claimReward(id, owner, action.rewardId)) });
  if (action.action === 'equip') return json({ ok: true, progress: await equipReward(id, owner, action.rewardId) });
  if (action.action === 'verify') {
    const linked = await getLinkedPlayer(owner, { timeout: 4000 });
    if (!linked.linked || !linked.pawnId || !linked.controllerId) fail('A verified linked character is required.', 403);
    return json({
      ok: true,
      ...(await submitChallenge(
        id,
        owner,
        action.challengeId,
        { text: 'Fresh adapter observation: linked character confirmed.', links: [] },
        true,
      )),
    });
  }
  return json({
    ok: true,
    ...(await submitChallenge(id, owner, action.challengeId, {
      text: action.text,
      links: action.links,
      requestId: action.requestId,
    })),
  });
}
export async function getAdminSeasons(request: Request) {
  await requireApiAdmin();
  const params = new URL(request.url).searchParams;
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .safeParse(params.get('offset') ?? 0);
  if (!offset.success) fail('Invalid season page.', 400);
  const id = params.get('season');
  if (id) {
    if (!identifier.safeParse(id).success) fail('Invalid season ID.', 400);
    const season = (await loadSeason(id)).value;
    const records = await adminRecords(id, offset.data);
    const totals = await readRecord(seasonKeys.totals(id));
    const deliveries = await readRecord(seasonKeys.deliveries(id));
    const owner = params.get('owner');
    if (owner && !identifier.safeParse(owner).success) fail('Invalid account ID.', 400);
    const member = owner ? (await loadMember(id, owner)).progress.value : null;
    return json({ ok: true, season, ...records, totals: totals.value, deliveries: deliveries.value ?? [], member });
  }
  return json({
    ok: true,
    seasons: await listSeasons(offset.data, true),
    template: seasonTemplate(),
    deliveryEnabled: false,
  });
}
export async function mutateAdminSeasons(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  requireRecentSignIn(session, { highRisk: true });
  await spendAdminBudget(session);
  const action = await body(request, adminAction);
  const id = action.seasonId;
  const actor = session.user.id;
  if (action.action === 'delivery-request')
    return json({
      ok: true,
      deliveries: await manageDelivery(id, { owner: action.owner, description: action.description }, actor),
    });
  if (action.action === 'delivery-review')
    return json({
      ok: true,
      deliveries: await manageDelivery(
        id,
        { deliveryId: action.deliveryId, approve: action.approve, note: action.note },
        actor,
      ),
    });
  if (action.action === 'save')
    return json({ ok: true, season: await saveSeason(id, action.revision, action.definition, actor) });
  if (action.action === 'duplicate') {
    const original = (await loadSeason(id)).value;
    const definition = {
      ...original.definition,
      slug: `${original.definition.slug.slice(0, 40)}-${randomUUID().slice(0, 8)}`,
      number: original.definition.number + 1,
      name: `${original.definition.name.slice(0, 80)} — next season`,
    };
    return json({ ok: true, season: await saveSeason(randomUUID(), '', definition, actor) });
  }
  if (action.action === 'transition') {
    const season = (await loadSeason(id)).value;
    if (action.confirmation !== season.definition.name) fail('Type the season name to confirm this transition.', 400);
    return json({ ok: true, season: await transitionSeason(id, action.revision, action.transition, actor) });
  }
  if (action.action === 'review')
    return json({
      ok: true,
      ...(await reviewSubmission(id, action.owner, action.submissionId, action.approve, action.note, actor)),
    });
  return json({
    ok: true,
    progress: await correctXp(id, action.owner, action.delta, action.reason, action.operationId, actor),
  });
}
