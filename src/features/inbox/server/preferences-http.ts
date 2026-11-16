import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { AppError } from '../../../lib/errors';
import { notificationInputSchema } from '../preferences';
import { readNotifications, mutateNotifications } from './preferences-store';
async function owner() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:notifications:${session.user.id}`, { limit: 30, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Notification settings are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'NOTIFICATIONS_LIMITED',
      true,
    );
  return session.user.id;
}
const envelope = (record: Awaited<ReturnType<typeof readNotifications>>) =>
  json({ record, checkedAt: new Date().toISOString() });
export async function getNotifications() {
  return envelope(await readNotifications(await owner()));
}
export async function putNotifications(request: Request) {
  assertSameOrigin(request);
  const id = await owner();
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send notification settings as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 8192);
  if (!bytes) throw new AppError('Notification settings exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid notification settings.', 400, 'INVALID_NOTIFICATIONS', true);
  }
  const parsed = notificationInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError('Check categories, cooldowns, timezone and quiet hours.', 400, 'INVALID_NOTIFICATIONS', true);
  return envelope(await mutateNotifications(id, parsed.data));
}
