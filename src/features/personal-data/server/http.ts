import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { eraseInputSchema, exportInputSchema } from '../model';
import { summarizePersonalData, exportPersonalData, erasePersonalData } from './service';
async function access(request?: Request) {
  if (request) assertSameOrigin(request);
  const session = await requireApiSession();
  const budget = await checkRateLimit(`v2:personal-data:${session.user.id}`, { limit: 10, windowMs: 60000 });
  if (!budget.allowed || budget.storageUnavailable)
    throw new AppError(
      'Personal data requests are temporarily limited.',
      budget.storageUnavailable ? 503 : 429,
      'PERSONAL_DATA_LIMITED',
      true,
    );
  return session;
}
async function body(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send changes as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 8192);
  if (!bytes) throw new AppError('Personal data request exceeds the limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError('Send a valid personal data request.', 400, 'INVALID_PERSONAL_DATA', true);
  }
}
export async function getPersonalData() {
  const session = await access();
  return json(await summarizePersonalData(session.user.id));
}
export async function downloadPersonalData(request: Request) {
  const session = await access(request);
  const input = exportInputSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Choose saved data scopes from the current summary.', 400, 'INVALID_PERSONAL_DATA', true);
  const exported = await exportPersonalData(
    session.user.id,
    input.data.selection.map((value) => ({ scope: value.scope, revision: value.revision ?? null })),
  );
  void recordAudit({
    event: 'personal_data.export',
    outcome: 'success',
    actor: session.user.id,
    data: { scopes: input.data.selection.map((v) => v.scope) },
  });
  return json(exported, 200, {
    'Content-Disposition': 'attachment; filename="arrakis-personal-data.json"',
    'Referrer-Policy': 'no-referrer',
  });
}
export async function deletePersonalData(request: Request) {
  const session = await access(request);
  const input = eraseInputSchema.safeParse(await body(request));
  if (!input.success)
    throw new AppError('Review one scope and type DELETE MY DATA to confirm.', 400, 'INVALID_PERSONAL_DATA', true);
  const erased = await erasePersonalData(session.user.id, input.data.scope, input.data.revision);
  void recordAudit({
    event: 'personal_data.erase',
    outcome: 'success',
    actor: session.user.id,
    data: { scope: erased.scope },
  });
  return json({ erased, checkedAt: new Date().toISOString() });
}
