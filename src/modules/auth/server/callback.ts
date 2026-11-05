import '../../../lib/assert-server';
import { exchangeDiscordIdentity } from '../../../infrastructure/discord';
import { AppError } from '../../../lib/errors';
import { NextResponse, getRequestOrigin } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { getDiscordRedirectUri, getServerEnv } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { establishDashboardSession } from './establish';
import crypto from 'node:crypto';

export async function GET(request, res) {
  try {
    // Dev note: Discord called back; apparently it wanted closure too.
    const { searchParams } = new URL(request.url, getRequestOrigin(request));

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const cookieStore = cookies(request, res);
    const expectedState = cookieStore.get('oauth_state')?.value;
    cookieStore.set('oauth_state', '', {
      httpOnly: true,
      secure: getServerEnv().NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0),
      maxAge: 0,
      path: '/auth/callback',
      priority: 'high',
    });

    const validState =
      Boolean(state && expectedState && /^[a-f0-9]{64}$/.test(state) && /^[a-f0-9]{64}$/.test(expectedState)) &&
      crypto.timingSafeEqual(Buffer.from(state!), Buffer.from(expectedState!));
    if (!validState) {
      return NextResponse.json(
        { ok: false, error: 'Invalid authentication request.', code: 'INVALID_OAUTH_STATE' },
        { status: 400 },
      );
    }
    const oauthError = searchParams.get('error');

    if (oauthError) {
      logger.warn('Discord OAuth provider returned an error');

      const appUrl = getServerEnv().APP_URL || new URL(request.url, getRequestOrigin(request)).origin;

      return NextResponse.redirect(new URL('/?error=discord_denied', appUrl));
    }

    if (!code) {
      logger.warn('Discord callback missing authorization code');

      return NextResponse.json({ error: 'Missing Discord authorization code' }, { status: 400 });
    }

    const env = getServerEnv();
    const clientId = env.DISCORD_CLIENT_ID;
    const clientSecret = env.DISCORD_CLIENT_SECRET;
    const guildId = env.DISCORD_GUILD_ID;
    const redirectUri = getDiscordRedirectUri();

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { ok: false, error: 'Authentication is temporarily unavailable.', code: 'AUTH_CONFIG_MISSING' },
        { status: 500 },
      );
    }

    if (!guildId) {
      return NextResponse.json(
        { ok: false, error: 'Authentication is temporarily unavailable.', code: 'AUTH_CONFIG_MISSING' },
        { status: 500 },
      );
    }

    const { userData, memberData } = await exchangeDiscordIdentity(code, {
      clientId,
      clientSecret,
      guildId,
      redirectUri,
    });

    return establishDashboardSession(request, res, { userData, memberData }, { guildId, method: 'discord' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Discord callback failed', error);
    return NextResponse.json(
      {
        error: 'Internal server token processing error',
      },
      { status: 500 },
    );
  }
}
