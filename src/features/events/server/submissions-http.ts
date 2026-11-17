import '../../../lib/assert-server';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { eventIdSchema } from '../contracts';
import {
  EVENT_SUBMISSION_IMAGE_MAX_BYTES,
  submissionReviewSchema,
  submissionSaveSchema,
  submissionView,
} from '../submissions';
import { canReviewEventSubmissions } from './review-authorization';
import { processSubmissionImage } from './submission-image';
import {
  readEventSubmissions,
  readSubmissionImage,
  reviewEventSubmission,
  saveEventSubmission,
  withdrawEventSubmission,
} from './submissions-store';
import { listCommunityEvents } from './store';

type EventContext = { params: Promise<{ eventId: string }> };
type SubmissionContext = { params: Promise<{ eventId: string; submissionId: string }> };
const submissionIdSchema = z.uuid();
const withdrawSchema = z.object({ action: z.literal('withdraw'), revision: z.uuid() }).strict();

async function eventContext(ctx: EventContext, existingSession?: Awaited<ReturnType<typeof requireApiSession>>) {
  const session = existingSession ?? (await requireApiSession());
  const eventId = eventIdSchema.safeParse((await ctx.params).eventId);
  if (!eventId.success) throw new AppError('Invalid event ID.', 400, 'INVALID_EVENT_ID', true);
  const event = (await listCommunityEvents()).find((item) => item.id === eventId.data);
  if (!event) throw new AppError('This event is not available.', 404, 'EVENT_NOT_FOUND', true);
  return { session, event };
}
async function itemContext(ctx: SubmissionContext) {
  const session = await requireApiSession();
  const base = await eventContext(ctx, session);
  const submissionId = submissionIdSchema.safeParse((await ctx.params).submissionId);
  if (!submissionId.success) throw new AppError('Invalid submission ID.', 400, 'INVALID_SUBMISSION_ID', true);
  return { ...base, submissionId: submissionId.data };
}
async function limit(owner: string, scope: string, count: number, windowMs = 60_000) {
  const result = await checkRateLimit(`v2:event-submissions:${scope}:${owner}`, { limit: count, windowMs });
  if (!result.allowed || result.storageUnavailable)
    throw new AppError(
      'Event submission requests are temporarily limited.',
      result.storageUnavailable ? 503 : 429,
      'SUBMISSIONS_LIMITED',
      true,
    );
}

export async function getSubmissions(_request: Request, ctx: EventContext) {
  const session = await requireApiSession();
  await limit(session.user.id, 'read', 30);
  const { event } = await eventContext(ctx, session);
  const reviewer = await canReviewEventSubmissions(session);
  const records = await readEventSubmissions(event.id);
  return json({
    ok: true,
    canReview: reviewer,
    submissionOpen: event.status === 'open' && event.endsAt && Date.parse(event.endsAt) > Date.now(),
    submissions: records.flatMap((record) => {
      const view = submissionView(event.id, record, { owner: session.user.id, reviewer });
      return view ? [view] : [];
    }),
  });
}

export async function createSubmission(request: Request, ctx: EventContext) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limit(session.user.id, 'upload', 6, 60 * 60_000);
  const { event } = await eventContext(ctx, session);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))
    throw new AppError('Upload the submission as multipart form data.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, EVENT_SUBMISSION_IMAGE_MAX_BYTES + 16_384);
  if (!body) throw new AppError('The submission is too large.', 413, 'PAYLOAD_TOO_LARGE', true);
  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type')! } }).formData();
  } catch {
    throw new AppError('The submission could not be read.', 400, 'INVALID_SUBMISSION', true);
  }
  const input = submissionSaveSchema.safeParse({
    id: String(form.get('id') ?? '') || undefined,
    revision: String(form.get('revision') ?? '') || undefined,
    title: String(form.get('title') ?? ''),
    note: String(form.get('note') ?? ''),
  });
  if (!input.success)
    throw new AppError('Check the submission title, note and revision.', 400, 'INVALID_SUBMISSION', true);
  const file = form.get('image');
  const image =
    file instanceof File && file.size
      ? await processSubmissionImage(new Uint8Array(await file.arrayBuffer()))
      : undefined;
  const author = (
    session.linkedPlayerName ||
    session.user.global_name ||
    session.user.username ||
    'Community member'
  ).slice(0, 100);
  const record = await saveEventSubmission(event, input.data, session.user.id, author, image);
  void recordAudit({
    event: 'community.event_submission_saved',
    outcome: 'success',
    actor: session.user.id,
    data: { eventId: event.id, submissionId: record.id, edited: Boolean(input.data.id) },
  });
  return json(
    { ok: true, submission: submissionView(event.id, record, { owner: session.user.id, reviewer: false }) },
    201,
  );
}

export async function mutateSubmission(request: Request, ctx: SubmissionContext) {
  assertSameOrigin(request);
  const { session, event, submissionId } = await itemContext(ctx);
  await limit(session.user.id, 'write', 30);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send the submission action as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 4096);
  if (!bytes) throw new AppError('Submission details exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter a valid submission action.', 400, 'INVALID_SUBMISSION', true);
  }
  const withdrawal = withdrawSchema.safeParse(raw);
  if (withdrawal.success) {
    const record = await withdrawEventSubmission(event, submissionId, withdrawal.data.revision, session.user.id);
    void recordAudit({
      event: 'community.event_submission_withdrawn',
      outcome: 'success',
      actor: session.user.id,
      data: { eventId: event.id, submissionId },
    });
    return json({
      ok: true,
      submission: submissionView(event.id, record, { owner: session.user.id, reviewer: false }),
    });
  }
  if (!(await canReviewEventSubmissions(session)))
    throw new AppError('Event reviewer access is required.', 403, 'EVENT_REVIEWER_REQUIRED', true);
  const input = submissionReviewSchema.safeParse(raw);
  if (!input.success) throw new AppError('Choose a valid review or judging action.', 400, 'INVALID_REVIEW', true);
  const record = await reviewEventSubmission(event, submissionId, input.data);
  void recordAudit({
    event: `community.event_submission_${input.data.action}`,
    outcome: 'success',
    actor: session.user.id,
    data: { eventId: event.id, submissionId, action: input.data.action },
  });
  return json({ ok: true, submission: submissionView(event.id, record, { owner: session.user.id, reviewer: true }) });
}

export async function getSubmissionImage(_request: Request, ctx: SubmissionContext) {
  const { session, event, submissionId } = await itemContext(ctx);
  const reviewer = await canReviewEventSubmissions(session);
  const record = (await readEventSubmissions(event.id)).find((item) => item.id === submissionId);
  if (!record || (record.status !== 'approved' && record.owner !== session.user.id && !reviewer))
    throw new AppError('Submission image not found.', 404, 'SUBMISSION_IMAGE_NOT_FOUND', true);
  const bytes = await readSubmissionImage(event.id, submissionId);
  if (!bytes) throw new AppError('Submission image not found.', 404, 'SUBMISSION_IMAGE_NOT_FOUND', true);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
