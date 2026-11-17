import '../../../lib/assert-server';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import type { DashboardSession } from '../../auth/server/session-store';
import {
  helpActionSchema,
  helpCreateSchema,
  helpMessageInputSchema,
  helpRequestView,
  helpVolunteerViewSchema,
  volunteerInputSchema,
} from '../model';
import { readHelpMessages, sendHelpMessage } from './messages-store';
import { claimHelpRequest, createHelpRequest, mutateHelpRequest, readHelpRequests } from './requests-store';
import { readVolunteer, saveVolunteer } from './volunteers-store';

type Context = { params: Promise<{ requestId: string }> };
const requestIdSchema = z.uuid();
const claimSchema = z.object({ action: z.literal('claim'), revision: z.uuid() }).strict();
function displayName(session: DashboardSession) {
  return (session.linkedPlayerName || session.user.global_name || session.user.username || 'Community member').slice(
    0,
    100,
  );
}
async function limit(owner: string, scope: string, count: number, windowMs = 60_000) {
  const result = await checkRateLimit(`v2:assistance:${scope}:${owner}`, { limit: count, windowMs });
  if (!result.allowed || result.storageUnavailable)
    throw new AppError(
      'Player assistance requests are temporarily limited.',
      result.storageUnavailable ? 503 : 429,
      'ASSISTANCE_LIMITED',
      true,
    );
}
async function body(request: Request, max = 8192) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send assistance details as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, max);
  if (!bytes) throw new AppError('Assistance details exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError('Enter valid assistance details.', 400, 'INVALID_ASSISTANCE', true);
  }
}
async function requestContext(ctx: Context) {
  const session = await requireApiSession();
  const id = requestIdSchema.safeParse((await ctx.params).requestId);
  if (!id.success) throw new AppError('Invalid help request ID.', 400, 'INVALID_HELP_REQUEST', true);
  const request = (await readHelpRequests()).find((item) => item.id === id.data);
  if (!request) throw new AppError('Help request not found.', 404, 'HELP_REQUEST_NOT_FOUND', true);
  return { session, request };
}
function volunteerView(volunteer: Awaited<ReturnType<typeof readVolunteer>>) {
  const { owner: _owner, ...view } = volunteer;
  return helpVolunteerViewSchema.parse(view);
}

export async function getAssistanceBoard() {
  const session = await requireApiSession();
  await limit(session.user.id, 'read', 30);
  const [requests, volunteer] = await Promise.all([readHelpRequests(), readVolunteer(session.user.id)]);
  return json({
    ok: true,
    volunteer: volunteerView(volunteer),
    requests: requests.flatMap((request) => {
      const view = helpRequestView(request, session.user.id);
      return view ? [view] : [];
    }),
  });
}

export async function createAssistanceRequest(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limit(session.user.id, 'create', 3, 60 * 60_000);
  const input = helpCreateSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Check the help title, category and details.', 400, 'INVALID_HELP_REQUEST', true);
  const record = await createHelpRequest(input.data, session.user.id, displayName(session));
  void recordAudit({
    event: 'assistance.request_created',
    outcome: 'success',
    actor: session.user.id,
    data: { requestId: record.id, category: record.category },
  });
  return json({ ok: true, request: helpRequestView(record, session.user.id) }, 201);
}

export async function updateVolunteer(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limit(session.user.id, 'volunteer', 12);
  const input = volunteerInputSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Choose valid availability and help categories.', 400, 'INVALID_VOLUNTEER', true);
  const volunteer = await saveVolunteer(input.data, session.user.id, displayName(session));
  void recordAudit({
    event: 'assistance.volunteer_updated',
    outcome: 'success',
    actor: session.user.id,
    data: { available: volunteer.available, categories: volunteer.categories },
  });
  return json({ ok: true, volunteer: volunteerView(volunteer) });
}

export async function mutateAssistanceRequest(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const { session, request: existing } = await requestContext(ctx);
  await limit(session.user.id, 'action', 20);
  const raw = await body(request);
  const claim = claimSchema.safeParse(raw);
  if (claim.success) {
    const volunteer = await readVolunteer(session.user.id);
    const result = await claimHelpRequest(existing.id, claim.data.revision, volunteer);
    void recordAudit({
      event: 'assistance.request_claimed',
      outcome: 'success',
      actor: session.user.id,
      data: { requestId: existing.id, category: existing.category },
    });
    return json({
      ok: true,
      request: helpRequestView(result.request, session.user.id),
      volunteer: volunteerView(result.volunteer),
    });
  }
  const input = helpActionSchema.safeParse(raw);
  if (!input.success) throw new AppError('Choose a valid help-request action.', 400, 'INVALID_HELP_ACTION', true);
  const result = await mutateHelpRequest(existing.id, input.data, session.user.id);
  void recordAudit({
    event: `assistance.request_${input.data.action}`,
    outcome: 'success',
    actor: session.user.id,
    data: { requestId: existing.id },
  });
  return json({
    ok: true,
    request: helpRequestView(result.request, session.user.id),
    ...(result.volunteer ? { volunteer: volunteerView(result.volunteer) } : {}),
  });
}

export async function getMessages(_request: Request, ctx: Context) {
  const { session, request } = await requestContext(ctx);
  await limit(session.user.id, 'messages-read', 60);
  const messages = await readHelpMessages(request, session.user.id);
  return json({
    ok: true,
    messages: messages.map((message) => ({
      id: message.id,
      authorName: message.authorName,
      body: message.body,
      sentAt: message.sentAt,
      isOwn: message.owner === session.user.id,
    })),
  });
}

export async function createMessage(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const { session, request: existing } = await requestContext(ctx);
  await limit(session.user.id, 'messages-write', 30);
  const input = helpMessageInputSchema.safeParse(await body(request, 2048));
  if (!input.success) throw new AppError('Enter a message of 1 to 1000 characters.', 400, 'INVALID_HELP_MESSAGE', true);
  const message = await sendHelpMessage(existing, input.data, session.user.id, displayName(session));
  void recordAudit({
    event: 'assistance.message_sent',
    outcome: 'success',
    actor: session.user.id,
    data: { requestId: existing.id, messageId: message.id },
  });
  return json(
    {
      ok: true,
      message: {
        id: message.id,
        authorName: message.authorName,
        body: message.body,
        sentAt: message.sentAt,
        isOwn: true,
      },
    },
    201,
  );
}
