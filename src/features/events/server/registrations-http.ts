import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { eventIdSchema } from '../contracts';
import { eventRegistrationInputSchema } from '../registrations';
import { getEventRegistration, mutateEventRegistration } from './registrations-store';
import { listCommunityEvents } from './store';

type Context = { params: Promise<{ eventId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const eventId = eventIdSchema.safeParse((await ctx.params).eventId);
  if (!eventId.success) throw new AppError('Invalid event ID.', 400, 'INVALID_EVENT_ID', true);
  const limit = await checkRateLimit(`v2:event-registration:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 12 : 30,
    windowMs: 60_000,
  });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Event registration requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'REGISTRATION_LIMITED',
      true,
    );
  const event = (await listCommunityEvents()).find((item) => item.id === eventId.data);
  if (!event) throw new AppError('This event is not available.', 404, 'EVENT_NOT_FOUND', true);
  return { session, event };
}

export async function getRegistration(_request: Request, ctx: Context) {
  const { session, event } = await context(ctx, false);
  return json({ ok: true, registration: await getEventRegistration(event, session.user.id) });
}

export async function mutateRegistration(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const { session, event } = await context(ctx, true);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send the registration action as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 2048);
  if (!bytes) throw new AppError('Registration details exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter a valid registration action.', 400, 'INVALID_REGISTRATION', true);
  }
  const parsed = eventRegistrationInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Choose a valid registration action.', 400, 'INVALID_REGISTRATION', true);
  const registration = await mutateEventRegistration(event, parsed.data, session.user.id);
  void recordAudit({
    event: 'community.event_registration',
    outcome: 'success',
    actor: session.user.id,
    data: { eventId: event.id, action: parsed.data.action, status: registration.ownStatus ?? 'none' },
  });
  return json({ ok: true, registration });
}
