import '../../../lib/assert-server';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import type { DashboardSession } from '../../auth/server/session-store';
import { isModerator } from './authorization';
import { createPlayerReport, mutateModerationCase, readModerationCases, readReporterCases } from './cases-store';
import { moderationActionSchema, moderationCaseView, reportInputSchema, reporterCaseView } from '../model';

type Context = { params: Promise<{ caseId: string }> };
function displayName(session: DashboardSession) {
  return (session.linkedPlayerName || session.user.global_name || session.user.username || 'Community member').slice(
    0,
    100,
  );
}
async function limit(owner: string, scope: string, count: number, windowMs = 60_000) {
  const result = await checkRateLimit(`v2:moderation:${scope}:${owner}`, { limit: count, windowMs });
  if (!result.allowed || result.storageUnavailable)
    throw new AppError(
      'Moderation requests are temporarily limited.',
      result.storageUnavailable ? 503 : 429,
      'MODERATION_LIMITED',
      true,
    );
}
async function moderator() {
  const session = await requireApiSession();
  if (!(await isModerator(session)))
    throw new AppError('Moderator access is required.', 403, 'MODERATOR_REQUIRED', true);
  return session;
}
async function body(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send case details as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 8192);
  if (!bytes) throw new AppError('Case details exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError('Enter valid case details.', 400, 'INVALID_MODERATION_ACTION', true);
  }
}

export async function getReports() {
  const session = await requireApiSession();
  await limit(session.user.id, 'reports-read', 30);
  return json({ ok: true, reports: (await readReporterCases(session.user.id)).map(reporterCaseView) });
}

export async function createReport(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await limit(session.user.id, 'reports-write', 3, 60 * 60_000);
  const input = reportInputSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Check the report subject, summary and evidence.', 400, 'INVALID_PLAYER_REPORT', true);
  const record = await createPlayerReport(input.data, session.user.id, displayName(session));
  void recordAudit({
    event: 'moderation.report_created',
    outcome: 'success',
    actor: session.user.id,
    data: { caseId: record.id, type: record.type },
  });
  return json({ ok: true, report: reporterCaseView(record) }, 201);
}

export async function getModerationCases() {
  const session = await moderator();
  await limit(session.user.id, 'read', 30);
  return json({ ok: true, cases: (await readModerationCases()).map(moderationCaseView) });
}

export async function mutateCase(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const session = await moderator();
  await limit(session.user.id, 'write', 30);
  const caseId = z.uuid().safeParse((await ctx.params).caseId);
  if (!caseId.success) throw new AppError('Invalid case ID.', 400, 'INVALID_CASE_ID', true);
  const input = moderationActionSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Choose a valid case action and decision reason.', 400, 'INVALID_MODERATION_ACTION', true);
  const record = await mutateModerationCase(caseId.data, input.data, {
    owner: session.user.id,
    name: displayName(session),
  });
  void recordAudit({
    event: `moderation.case_${input.data.action}`,
    outcome: 'success',
    actor: session.user.id,
    data: { caseId: record.id, type: record.type, decision: record.decision },
  });
  return json({ ok: true, case: moderationCaseView(record) });
}
