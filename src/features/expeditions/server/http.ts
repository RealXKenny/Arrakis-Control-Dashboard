import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { resolveItemCharacter } from '../../player/server/item-finder';
import { PLAN_LIMITS, planWriteSchema } from '../model';
import { rescueActionSchema, SHARE_ID_PATTERN } from '../rescue';
import { readPlan, savePlan } from './plan-store';
import { cancelRescue, publishRescue, readOwnRescue, readSharedRescue } from './rescue-store';

async function limit(key: string, count = 30) {
  const result = await checkRateLimit(key, { limit: count, windowMs: 60_000 });
  if (!result.allowed) throw new AppError('Request limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
}

async function jsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new AppError('Send JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, maxBytes);
  if (!body) throw new AppError('The request is too large.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new AppError('The request is not valid JSON.', 400, 'INVALID_JSON', true);
  }
}

async function planContext() {
  const session = await requireApiSession();
  await limit(`v2:expedition-plan:${session.user.id}`);
  // Ownership comes from the session and the fresh adapter link, never from the request.
  const { controller, player } = await resolveItemCharacter(session);
  return { session, controller, player };
}

/** GET /api/v2/expeditions/plan */
export async function getPlan() {
  const { session, controller, player } = await planContext();
  return json(await readPlan(session.user.id, controller, player));
}

/** POST /api/v2/expeditions/plan: replace the whole private plan with UUID compare-and-set. */
export async function postPlan(request: Request) {
  assertSameOrigin(request);
  const { session, controller, player } = await planContext();
  const value = await jsonBody(request, PLAN_LIMITS.bytes);
  const parsed = planWriteSchema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.find((issue) => issue.code === 'custom')?.message;
    throw new AppError(message ?? 'These plans are invalid or exceed a limit.', 400, 'INVALID_PLAN', true);
  }
  return json(await savePlan(session.user.id, controller, player, parsed.data.revision, parsed.data.plan));
}

/** GET /api/v2/expeditions/rescue: the owner's own active card and link, if any. */
export async function getOwnRescue() {
  const session = await requireApiSession();
  await limit(`v2:rescue-owner:${session.user.id}`, 20);
  return json(await readOwnRescue(session.user.id));
}

/** POST /api/v2/expeditions/rescue: explicit, confirmed publish or cancel. Never retried automatically. */
export async function postRescue(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limit(`v2:rescue-owner:${session.user.id}`, 20);
  const parsed = rescueActionSchema.safeParse(await jsonBody(request, 4096));
  if (!parsed.success) throw new AppError('This rescue request is invalid.', 400, 'INVALID_RESCUE', true);
  const action = parsed.data;
  const result =
    action.action === 'publish'
      ? await publishRescue(session.user.id, action.expected, action.data, action.hours)
      : await cancelRescue(session.user.id, action.expected);
  // Audits name the action only, never the location, details or link.
  void recordAudit({ event: `rescue.${action.action}`, outcome: 'success', actor: session.user.id });
  return json(result);
}

/** GET /api/v2/expeditions/rescue/<shareId>: signed-in members holding the unlisted link. */
export async function getSharedRescue(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  await limit(`v2:rescue-view:${session.user.id}`);
  const { id } = await context.params;
  const card = SHARE_ID_PATTERN.test(id) ? await readSharedRescue(id) : null;
  if (!card) throw new AppError('This rescue request has ended or the link is not valid.', 404, 'NOT_FOUND', true);
  return json({ card });
}
