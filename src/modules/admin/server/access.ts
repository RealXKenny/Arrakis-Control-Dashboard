import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { cookies } from '../../../infrastructure/cookies';
import { AppError } from '../../../lib/errors';
import { getSession, type DashboardSession } from '../../../lib/session-store';

export const ADMIN_DISCORD_USER_ID = '456084885220884480';

/** Authority comes exclusively from the OAuth-verified server session, never a client flag. */
export function isDashboardAdmin(session: DashboardSession | null): boolean {
  const env = getServerEnv();
  return Boolean(
    session &&
    session.expiresAt > Date.now() &&
    session.user.id === ADMIN_DISCORD_USER_ID &&
    session.guildId === env.DISCORD_GUILD_ID &&
    (!env.VERIFIED_MEMBER_ROLE_ID || session.roleIds.includes(env.VERIFIED_MEMBER_ROLE_ID)),
  );
}

export async function requireDashboardAdmin(req, res): Promise<DashboardSession> {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now())
    throw new AppError('Sign in to continue.', 401, 'UNAUTHORIZED', true);
  if (!isDashboardAdmin(session)) throw new AppError('Administrator access required.', 403, 'FORBIDDEN', true);
  return session;
}
