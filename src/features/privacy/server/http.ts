import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { privacyInputSchema } from '../model';
import { readPrivacy, mutatePrivacy, readSharedPrivacy } from './store';
export async function privacyBudget(owner: string, shared = false) {
  const limit = await checkRateLimit(`v2:privacy:${shared ? 'member' : 'owner'}:${owner}`, {
    limit: 30,
    windowMs: 60000,
  });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Privacy requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'PRIVACY_LIMITED',
      true,
    );
}
export async function getPrivacy() {
  const session = await requireApiSession();
  await privacyBudget(session.user.id);
  return json({ record: await readPrivacy(session.user.id), checkedAt: new Date().toISOString() });
}
export async function putPrivacy(request: Request) {
  assertSameOrigin(request);
  const session = await requireApiSession();
  await privacyBudget(session.user.id);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send sharing changes as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 16384);
  if (!bytes) throw new AppError('The sharing card exceeds the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid sharing details.', 400, 'INVALID_PRIVACY', true);
  }
  const parsed = privacyInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      'Check the card, expiry and publication confirmation. Locations can be shared for at most 24 hours.',
      400,
      'INVALID_PRIVACY',
      true,
    );
  const record = await mutatePrivacy(session.user.id, parsed.data);
  void recordAudit({
    event: `privacy.${parsed.data.action.replaceAll('-', '_')}`,
    outcome: 'success',
    actor: session.user.id,
    data: {
      category:
        'card' in parsed.data ? parsed.data.card.category : 'category' in parsed.data ? parsed.data.category : 'all',
    },
  });
  return json({ record, checkedAt: new Date().toISOString() });
}
export async function getSharedPrivacy(_request: Request, context: { params: Promise<{ shareId: string }> }) {
  const session = await requireApiSession();
  await privacyBudget(session.user.id, true);
  return json({ data: await readSharedPrivacy((await context.params).shareId) });
}
