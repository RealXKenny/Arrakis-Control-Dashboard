import '../../../lib/assert-server';
import { assertSameOrigin, requireApiSession, json } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { readPersonalTasks } from '../../tasks/server/store';
import { activityInputSchema, activityEnvelopeSchema } from '../model';
import { readActivityViews, mutateActivityViews } from './store';
async function owner() {
  const session = await requireApiSession();
  const budget = await checkRateLimit(`v2:activity-views:${session.user.id}`, { limit: 20, windowMs: 60000 });
  if (!budget.allowed || budget.storageUnavailable)
    throw new AppError(
      'Saved view requests are temporarily limited.',
      budget.storageUnavailable ? 503 : 429,
      'ACTIVITY_VIEWS_LIMITED',
      true,
    );
  return session.user.id;
}
export async function getActivityViews() {
  const id = await owner();
  const [record, tasks] = await Promise.all([readActivityViews(id), readPersonalTasks(id).catch(() => null)]);
  const plans =
    tasks?.tasks
      .filter((t) => t.kind === 'project' || t.kind === 'goal')
      .map((t) => ({ id: t.id, title: t.title, kind: t.kind })) ?? [];
  return json(activityEnvelopeSchema.parse({ record, plans, planningAvailable: tasks !== null }));
}
export async function postActivityViews(request: Request) {
  assertSameOrigin(request);
  const id = await owner();
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send saved view changes as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 8192);
  if (!bytes) throw new AppError('Saved view request exceeds the limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Send a valid saved view request.', 400, 'INVALID_ACTIVITY_VIEW', true);
  }
  const input = activityInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the saved view settings and confirmation.', 400, 'INVALID_ACTIVITY_VIEW', true);
  const record = await mutateActivityViews(id, input.data);
  void recordAudit({
    event: 'activity_view.change',
    actor: id,
    outcome: 'success',
    data: { action: input.data.action },
  });
  return json({ record });
}
