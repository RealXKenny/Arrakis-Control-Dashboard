import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { recordAudit } from '../../../lib/security/audit';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import type { DashboardSession } from '../../auth/server/session-store';
import { isDashboardAdmin } from './access';
import { requireApiSession } from '../../../server/http';

/** Operations per administrator per minute: generous for the UI, a ceiling for a stolen session or runaway client. */
const ADMIN_OPERATIONS_PER_MINUTE = { limit: 300, windowMs: 60_000 };

/**
 * API gate for every administrator route. Authority comes only from the OAuth-verified
 * server session (`isDashboardAdmin`); nothing the client sends can widen it.
 */
export async function requireApiAdmin(): Promise<DashboardSession> {
  const session = await requireApiSession();
  if (!isDashboardAdmin(session)) {
    void recordAudit({ event: 'admin.access_denied', outcome: 'denied', actor: session.user.id });
    throw new AppError('Administrator access required.', 403, 'FORBIDDEN', true);
  }
  return session;
}

/** Budget for Console-bound administrator operations. Fails closed if the limiter's storage is down. */
export async function spendAdminBudget(session: DashboardSession): Promise<void> {
  const limit = await checkRateLimit(`v2:admin:ops:${session.user.id}`, ADMIN_OPERATIONS_PER_MINUTE);
  if (limit.storageUnavailable)
    throw new AppError('Request protection is temporarily unavailable.', 503, 'RATE_LIMIT_UNAVAILABLE', true);
  if (!limit.allowed)
    throw new AppError(`Too many administrator operations. Retry in ${limit.retryAfter}s.`, 429, 'RATE_LIMITED', true);
}
