import { AppError } from '../../../../../lib/errors';
import { readBoundedBody } from '../../../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';
import { announcementInputSchema } from '../../../../../features/changelog/discord';
import { isDashboardAdmin } from '../../../../../features/admin/server/access';
import { announce } from '../../../../../features/changelog/server/announce';
import { assertSameOrigin, json, requireApiSession, route } from '../../../../../server/http';

const MAX_BODY_BYTES = 64 * 1024;
const ANNOUNCEMENTS_PER_HOUR = { limit: 20, windowMs: 60 * 60_000 };

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiSession();
  // Authority comes from the OAuth-verified server session only, never from the request body.
  if (!isDashboardAdmin(session)) throw new AppError('Administrator access required.', 403, 'FORBIDDEN', true);

  const limit = await checkRateLimit(`v2:changelog:announce:${session.user.id}`, ANNOUNCEMENTS_PER_HOUR);
  if (!limit.allowed) {
    throw new AppError(`Announcement limit reached. Try again in ${limit.retryAfter}s.`, 429, 'RATE_LIMITED', true);
  }

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body) throw new AppError('The request is too large.', 413, 'PAYLOAD_TOO_LARGE', true);

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('The request is not valid JSON.', 400, 'INVALID_JSON', true);
  }
  const parsed = announcementInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(`${issue.path.join('.') || 'Request'}: ${issue.message}`, 422, 'INVALID_ANNOUNCEMENT', true);
  }

  const result = await announce(parsed.data, session.user.username ?? session.user.id);
  return json({ ok: true, edited: result.edited });
});
