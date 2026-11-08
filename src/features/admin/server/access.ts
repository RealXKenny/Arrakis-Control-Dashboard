import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { cookies } from '../../../server/cookies';
import { AppError } from '../../../lib/errors';
import { recordAudit } from '../../../lib/security/audit';
import { type DashboardSession } from '../../auth/server/session-store';
import { getSession } from '../../auth/server/session';

/** The project owner stays an administrator unless ADMIN_DISCORD_IDS names someone else. */
const DEFAULT_ADMIN_DISCORD_USER_ID = '456084885220884480';

function administratorIds(): string[] {
  const configured = getServerEnv().ADMIN_DISCORD_IDS;
  const ids = configured ? configured.split(',').map((id) => id.trim()) : [];
  return ids.length ? ids : [DEFAULT_ADMIN_DISCORD_USER_ID];
}

/** Authority comes exclusively from the OAuth-verified server session, never a client flag. */
export function isDashboardAdmin(session: DashboardSession | null): boolean {
  const env = getServerEnv();
  return Boolean(
    session &&
    session.expiresAt > Date.now() &&
    administratorIds().includes(session.user.id) &&
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

/**
 * Step-up for administrator changes. A stolen 30-day cookie must not be enough to run destructive operations:
 * the session has to come from an interactive sign-in within ADMIN_REAUTH_HOURS. Background Discord checks never
 * advance authenticatedAt, and sessions issued before it existed simply sign in once more.
 */
export function requireRecentSignIn(session: DashboardSession, options: { highRisk?: boolean } = {}): void {
  const env = getServerEnv();
  const windowMs = options.highRisk
    ? (env.ADMIN_HIGH_RISK_REAUTH_MINUTES ?? 60) * 60_000
    : (env.ADMIN_REAUTH_HOURS ?? 12) * 60 * 60_000;
  if (!session.authenticatedAt || Date.now() - session.authenticatedAt > windowMs) {
    void recordAudit({
      event: 'admin.reauth_required',
      outcome: 'denied',
      actor: session.user.id,
      data: { highRisk: options.highRisk === true },
    });
    throw new AppError(
      options.highRisk
        ? 'This action needs a fresh sign-in. Sign in again, then repeat it within the hour.'
        : 'Sign in again to make administrator changes. Viewing stays available.',
      403,
      'ADMIN_REAUTH_REQUIRED',
      true,
    );
  }
}
