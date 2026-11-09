import { z } from 'zod';
import { assertSameOrigin, json } from '../../../server/http';
import { requireApiAdmin, spendAdminBudget } from '../../admin/server/api-access';
import { requireRecentSignIn } from '../../admin/server/access';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { AppError } from '../../../lib/errors';
import { recordAudit } from '../../../lib/security/audit';
import { eventInputSchema, eventIdSchema } from '../contracts';
import { listCommunityEvents, saveCommunityEvent, deleteCommunityEvent } from './store';
import { syncCommunityEvent, withdrawCommunityEvent } from './announce';
import { getServerEnv } from '../../../config/env';

export async function getAdminEvents(): Promise<Response> {
  await requireApiAdmin();
  const env = getServerEnv();
  return json({
    ok: true,
    events: await listCommunityEvents(true),
    discordConfigured: Boolean(env.DISCORD_BOT_TOKEN && env.COMMUNITY_EVENTS_CHANNEL_ID),
  });
}

export async function mutateAdminEvent(request: Request): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  requireRecentSignIn(session, { highRisk: true });
  await spendAdminBudget(session);
  const bytes = await readBoundedBody(request, 24 * 1024);
  if (!bytes) throw new AppError('Event details are too large.', 413, 'EVENT_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid event details.', 400, 'INVALID_EVENT', true);
  }
  const envelope = z
    .object({ id: eventIdSchema, revision: z.number().int().min(0).max(1_000_000).default(0) })
    .safeParse(raw);
  if (!envelope.success) throw new AppError('Invalid event ID or revision.', 400, 'INVALID_EVENT', true);
  const { id, revision } = envelope.data;
  if (
    (request.method === 'POST' && (revision !== 0 || !z.string().uuid().safeParse(id).success)) ||
    (request.method !== 'POST' && revision < 1)
  )
    throw new AppError('Invalid event revision.', 400, 'INVALID_EVENT', true);
  if (request.method === 'DELETE') {
    await deleteCommunityEvent(id, revision);
    const discord = await withdrawCommunityEvent(id).catch(() => ({ status: 'failed' }));
    void recordAudit({
      event: 'admin.event_deleted',
      outcome: 'success',
      actor: session.user.id,
      data: { eventId: id },
    });
    return json({ ok: true, discord });
  }
  const input = eventInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError(input.error.issues[0]?.message ?? 'Check the event details.', 400, 'INVALID_EVENT', true);
  const event = await saveCommunityEvent(id, input.data, revision);
  const discord = await (event.visibility === 'published' ? syncCommunityEvent(id) : withdrawCommunityEvent(id)).catch(
    () => ({ status: 'failed' }),
  );
  void recordAudit({
    event: request.method === 'POST' ? 'admin.event_created' : 'admin.event_updated',
    outcome: 'success',
    actor: session.user.id,
    data: { eventId: id, visibility: event.visibility },
  });
  return json({ ok: true, event, discord }, request.method === 'POST' ? 201 : 200);
}
