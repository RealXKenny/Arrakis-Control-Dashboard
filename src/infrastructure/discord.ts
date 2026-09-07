import '../lib/assert-server';
import { AppError } from '../lib/errors';

export async function exchangeDiscordIdentity(
  code: string,
  config: { clientId: string; clientSecret: string; guildId: string; redirectUri: string },
) {
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

  const responseText = await tokenResponse.text();

  let tokenData;

  try {
    tokenData = JSON.parse(responseText);
  } catch {
    throw new AppError('Invalid response from Discord.', 502, 'OAUTH_PROVIDER_ERROR', true);
  }

  if (!tokenResponse.ok) {
    throw new AppError('Authentication was declined.', 400, 'OAUTH_REJECTED', true);
  }

  if (!tokenData.access_token) {
    throw new AppError('Authentication was declined.', 400, 'OAUTH_REJECTED', true);
  }

  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const userData = await userResponse.json();

  if (!userResponse.ok) {
    throw new AppError('Failed to retrieve Discord user', 400, 'OAUTH_USER_ERROR', true);
  }

  const memberUrl = `https://discord.com/api/guilds/${guildId}/members/@me`;

  const memberResponse = await fetch(memberUrl, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  let memberData: { roles?: string[] } = {};

  if (memberResponse.ok) {
    memberData = await memberResponse.json();
  }

  return { userData, memberData };
}
