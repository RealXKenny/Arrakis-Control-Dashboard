import '../../../lib/assert-server';
import { clerkClient, getAuth } from '@clerk/nextjs/server';
import { getServerEnv, isClerkAuthEnabled } from '../../../config/env';
import { readDiscordIdentity } from '../../../infrastructure/discord';
import { NextResponse, getRequestOrigin } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { withTimeout } from '../../../lib/http/timeout';
import { establishDashboardSession } from './establish';

const CLERK_TIMEOUT_MS = 10_000;

/**
 * Clerk bridge: Clerk proves who signed in with Discord; Discord itself still proves the
 * guild membership and role. The resulting session is the same OAuth-verified Discord identity
 * the rest of the dashboard already trusts, so no guard or ownership check changes.
 */
export async function GET(request, res) {
  if (!isClerkAuthEnabled()) return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  const env = getServerEnv();
  const appUrl = env.APP_URL || new URL(request.url, getRequestOrigin(request)).origin;
  const { userId, sessionId } = getAuth(request);
  if (!userId || !sessionId || !/^sess_[A-Za-z0-9]{1,64}$/.test(sessionId))
    return NextResponse.redirect(new URL('/sign-in', appUrl));
  if (!env.DISCORD_GUILD_ID)
    return NextResponse.json(
      { ok: false, error: 'Authentication is temporarily unavailable.', code: 'AUTH_CONFIG_MISSING' },
      { status: 500 },
    );
  try {
    const clerk = await clerkClient();
    const [user, tokens] = await withTimeout(
      Promise.all([clerk.users.getUser(userId), clerk.users.getUserOauthAccessToken(userId, 'discord')]),
      CLERK_TIMEOUT_MS,
    );
    // Dev note: two witnesses agree on who rode the worm, or nobody gets into the sietch.
    const linked = user.externalAccounts.filter((account) => /^(?:oauth_)?discord$/.test(account.provider));
    const token = tokens.data.find((entry) => /^(?:oauth_)?discord$/.test(entry.provider))?.token;
    if (linked.length !== 1 || !/^\d{1,25}$/.test(linked[0].providerUserId) || !token)
      throw new AppError('Sign in with your Discord account to continue.', 403, 'DISCORD_ACCOUNT_REQUIRED', true);
    const identity = await readDiscordIdentity(token, env.DISCORD_GUILD_ID);
    if (identity.userData.id !== linked[0].providerUserId)
      throw new AppError('Discord could not confirm this account.', 403, 'DISCORD_ACCOUNT_MISMATCH', true);
    return await establishDashboardSession(request, res, identity, {
      guildId: env.DISCORD_GUILD_ID,
      method: 'clerk',
      clerkSessionId: sessionId,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Clerk API errors can carry request details; log only that the bridge failed.
    logger.error('Clerk sign-in bridge failed', { reason: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json(
      { ok: false, error: 'Authentication is temporarily unavailable.', code: 'AUTH_PROVIDER_ERROR' },
      { status: 502 },
    );
  }
}

/** Best-effort revocation so a dashboard logout also ends the Clerk session that created it. */
export async function revokeClerkSession(clerkSessionId: string | undefined) {
  if (!clerkSessionId || !isClerkAuthEnabled()) return;
  try {
    const clerk = await clerkClient();
    await withTimeout(clerk.sessions.revokeSession(clerkSessionId), CLERK_TIMEOUT_MS);
  } catch {
    logger.warn('Clerk session revocation failed');
  }
}
