import '../../lib/assert-server';
import { AppError } from '../../lib/errors';
import type { DashboardSession } from '../../lib/security/session-store';
import { isDashboardAdmin } from '../../modules/admin/server/access';
import { requireApiSession } from '../http';

/**
 * API gate for every administrator route. Authority comes only from the OAuth-verified
 * server session (`isDashboardAdmin`); nothing the client sends can widen it.
 */
export async function requireApiAdmin(): Promise<DashboardSession> {
  const session = await requireApiSession();
  if (!isDashboardAdmin(session)) throw new AppError('Administrator access required.', 403, 'FORBIDDEN', true);
  return session;
}
