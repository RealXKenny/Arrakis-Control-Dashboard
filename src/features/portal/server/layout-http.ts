import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { AppError } from '../../../lib/errors';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { portalLayoutRecordSchema } from '../layout';
import { readPortalLayout, savePortalLayout } from './layout-store';

async function owner() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:portal-layout:${session.user.id}`, { limit: 30, windowMs: 60000 });
  if (limit.storageUnavailable || !limit.allowed)
    throw new AppError(
      'Portal settings are temporarily limited. Try again shortly.',
      limit.storageUnavailable ? 503 : 429,
      'PORTAL_LAYOUT_LIMITED',
      true,
    );
  return session.user.id;
}
export async function getPortalLayout() {
  return json({ record: await readPortalLayout(await owner()) });
}
export async function putPortalLayout(request: Request) {
  assertSameOrigin(request);
  const id = await owner();
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send portal settings as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, 4096);
  if (!body) throw new AppError('Portal settings exceed the size limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('Enter valid portal settings.', 400, 'INVALID_PORTAL_LAYOUT', true);
  }
  const parsed = portalLayoutRecordSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      'Choose a valid portal layout with unique supported widgets.',
      400,
      'INVALID_PORTAL_LAYOUT',
      true,
    );
  return json({ record: await savePortalLayout(id, parsed.data.revision, parsed.data.layout) });
}
