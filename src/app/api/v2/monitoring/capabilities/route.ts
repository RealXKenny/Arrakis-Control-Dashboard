import { json, requireApiSession, route } from '../../../../../server/http';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';
import { AppError } from '../../../../../lib/errors';
import { readCapabilities } from '../../../../../features/monitoring/server/capabilities';

export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:capabilities:${session.user.id}`, { limit: 6, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Capability checks are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'CAPABILITY_LIMITED',
      true,
    );
  return json({ ok: true, readings: await readCapabilities() });
});
