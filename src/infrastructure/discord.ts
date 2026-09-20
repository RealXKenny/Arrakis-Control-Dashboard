import '../lib/assert-server';
import { AppError } from '../lib/errors';
import { readBoundedText } from '../lib/http-response';

const DISCORD_RESPONSE_LIMIT = 1024 * 1024;

async function discordJson(response: Response): Promise<Record<string, unknown>> {
  const text = await readBoundedText(response, DISCORD_RESPONSE_LIMIT);
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Discord response');
    return value as Record<string, unknown>;
  } catch {
    throw new AppError('Invalid response from Discord.', 502, 'OAUTH_PROVIDER_ERROR', true);
  }
}

export async function exchangeDiscordIdentity(
  code: string,
  config: { clientId: string; clientSecret: string; guildId: string; redirectUri: string },
) {
  // Dev note: OAuth wanted closure, so JavaScript gave it a callback.
  const { clientId, clientSecret, guildId, redirectUri } = config;
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const tokenData = await discordJson(tokenResponse);

  if (!tokenResponse.ok) {
    throw new AppError('Authentication was declined.', 400, 'OAUTH_REJECTED', true);
  }

  if (typeof tokenData.access_token !== 'string' || !tokenData.access_token || tokenData.access_token.length > 4096) {
    throw new AppError('Authentication was declined.', 400, 'OAUTH_REJECTED', true);
  }

  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const userData = await discordJson(userResponse);

  if (!userResponse.ok) {
    throw new AppError('Failed to retrieve Discord user', 400, 'OAUTH_USER_ERROR', true);
  }

  if (typeof userData.id !== 'string' || !/^\d{1,25}$/.test(userData.id)) {
    throw new AppError('Invalid response from Discord.', 502, 'OAUTH_PROVIDER_ERROR', true);
  }

  const memberUrl = `https://discord.com/api/users/@me/guilds/${guildId}/member`;

  const memberResponse = await fetch(memberUrl, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (!memberResponse.ok) {
    if (memberResponse.status === 404)
      throw new AppError('Discord guild membership is required.', 403, 'GUILD_REQUIRED', true);
    throw new AppError('Discord could not verify guild membership.', 502, 'GUILD_VERIFICATION_FAILED', true);
  }
  const memberResponseData = await discordJson(memberResponse);
  const roles = Array.isArray(memberResponseData.roles)
    ? memberResponseData.roles.filter((role): role is string => typeof role === 'string' && /^\d{1,25}$/.test(role))
    : [];
  const memberData = { roles };

  return { userData, memberData };
}
