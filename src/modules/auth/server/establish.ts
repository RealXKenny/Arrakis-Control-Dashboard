import '../../../lib/assert-server';
import crypto from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse, getRequestOrigin } from '../../../infrastructure/pages-api';
import { logger } from '../../../lib/logger';
import { saveSession, sessionTtlSeconds } from '../../../lib/session-store';

type DiscordIdentity = { userData: Record<string, unknown>; memberData: { roles: string[] } };

/**
 * Turn verified Discord identity and guild-role evidence into the dashboard's Redis session.
 * Both sign-in paths (direct Discord OAuth and Clerk) end here, so every downstream guard,
 * admin check and ownership check keeps reading the same OAuth-verified Discord user ID.
 */
export async function establishDashboardSession(
  request,
  res,
  identity: DiscordIdentity,
  options: { guildId: string; method: 'discord' | 'clerk'; clerkSessionId?: string },
) {
  const env = getServerEnv();
  const { userData, memberData } = identity;
  const roles = Array.isArray(memberData.roles) ? memberData.roles : [];
  if (env.VERIFIED_MEMBER_ROLE_ID && !roles.includes(env.VERIFIED_MEMBER_ROLE_ID)) {
    return NextResponse.json(
      { ok: false, error: 'The required Discord role is missing.', code: 'ROLE_REQUIRED' },
      { status: 403 },
    );
  }
  const sessionId = crypto.randomBytes(32).toString('hex');
  await saveSession(sessionId, {
    user: {
      id: String(userData.id),
      username: typeof userData.username === 'string' ? userData.username.slice(0, 100) : undefined,
      global_name: typeof userData.global_name === 'string' ? userData.global_name.slice(0, 100) : undefined,
      avatar:
        typeof userData.avatar === 'string' && /^(a_)?[a-f0-9]{32}$/.test(userData.avatar) ? userData.avatar : null,
    },
    guildId: options.guildId,
    roleIds: roles,
    ...(options.clerkSessionId ? { clerkSessionId: options.clerkSessionId } : {}),
    expiresAt: Date.now() + sessionTtlSeconds() * 1000,
  });
  cookies(request, res).set('dashboard_session', sessionId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sessionTtlSeconds(),
    path: '/',
    priority: 'high',
  });
  const appUrl = env.APP_URL || new URL(request.url, getRequestOrigin(request)).origin;
  logger.info('Login established', {
    method: options.method,
    lifetimeSeconds: sessionTtlSeconds(),
    secureCookie: env.NODE_ENV === 'production',
    redirectOrigin: new URL(appUrl).origin,
  });
  return NextResponse.redirect(new URL('/portal', appUrl));
}
