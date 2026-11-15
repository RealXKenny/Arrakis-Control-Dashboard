import '../../../lib/assert-server';
import { json, requireApiSession } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { loadInbox } from './load';

export async function getInbox() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:inbox:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Inbox checks are temporarily limited. Try again shortly.',
      limit.storageUnavailable ? 503 : 429,
      'INBOX_LIMITED',
      true,
    );
  return json({ data: await loadInbox(session) });
}
