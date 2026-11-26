import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { readBoundedText } from '../../../lib/http/response';
import { readDiscordIdentity } from '../../../server/integrations/discord';
import { INSTANCE_ID, SNOWFLAKE } from '../contracts';

const RESPONSE_LIMIT = 64 * 1024;

export interface ActivityIdentity {
  readonly userId: string;
  readonly displayName: string;
}

function activityConfig() {
  const env = getServerEnv();
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const guildId = env.DISCORD_GUILD_ID;
  const botToken = env.DISCORD_BOT_TOKEN;
  if (!clientId || !clientSecret || !guildId || !botToken || !SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(clientId)) {
    throw new AppError('Poker is not configured on this server.', 503, 'POKER_UNCONFIGURED', true);
  }
  return { clientId, clientSecret, guildId, botToken, requiredRole: env.VERIFIED_MEMBER_ROLE_ID };
}

async function parseObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readBoundedText(response, RESPONSE_LIMIT));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const cleanName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  // Strip control characters; React escapes the rest when rendering.
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return trimmed ? trimmed.slice(0, 32) : undefined;
};

/**
 * Exchanges the Embedded App SDK authorization code (no redirect URI for Activities) and re-reads the
 * member fresh from Discord. The access token is used once here and never stored or returned.
 */
export async function identifyActivityPlayer(code: string): Promise<ActivityIdentity> {
  const config = activityConfig();
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = await parseObject(tokenResponse);
  const accessToken = tokenData?.access_token;
  if (!tokenResponse.ok || typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096) {
    throw new AppError(
      'Discord declined the sign-in. Close and reopen the Activity.',
      401,
      'POKER_OAUTH_REJECTED',
      true,
    );
  }
  const { userData, memberData } = await readDiscordIdentity(accessToken, config.guildId);
  if (config.requiredRole && !memberData.roles.includes(config.requiredRole)) {
    throw new AppError('Poker is open to verified community members only.', 403, 'POKER_ROLE_REQUIRED', true);
  }
  const userId = String(userData.id);
  if (!SNOWFLAKE.test(userId)) throw new AppError('Invalid response from Discord.', 502, 'OAUTH_PROVIDER_ERROR', true);
  const displayName =
    cleanName(memberData.nick) ?? cleanName(userData.global_name) ?? cleanName(userData.username) ?? 'Player';
  return { userId, displayName };
}

/**
 * Asks Discord, with the bot token, whether this Activity instance is real, runs in our guild and
 * currently includes the player. A client cannot pick someone else's table by naming its instance ID.
 */
export async function verifyActivityInstance(instanceId: string, userId: string): Promise<void> {
  const config = activityConfig();
  if (!INSTANCE_ID.test(instanceId)) throw new AppError('Unknown Activity.', 400, 'POKER_INSTANCE_INVALID', true);
  const response = await fetch(
    `https://discord.com/api/v10/applications/${config.clientId}/activity-instances/${encodeURIComponent(instanceId)}`,
    {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    throw new AppError('This Activity has ended. Launch it again.', 404, 'POKER_INSTANCE_NOT_FOUND', true);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new AppError(
      'Discord could not confirm this Activity. Try again shortly.',
      502,
      'POKER_INSTANCE_UNVERIFIED',
      true,
    );
  }
  const body = await parseObject(response);
  const location = body?.location;
  const users = body?.users;
  const guildId =
    location && typeof location === 'object' && !Array.isArray(location)
      ? (location as Record<string, unknown>).guild_id
      : undefined;
  if (
    body?.instance_id !== instanceId ||
    guildId !== config.guildId ||
    !Array.isArray(users) ||
    users.length > 1000 ||
    !users.includes(userId)
  ) {
    throw new AppError(
      'Join the Activity from this community’s Discord server.',
      403,
      'POKER_INSTANCE_FORBIDDEN',
      true,
    );
  }
}
