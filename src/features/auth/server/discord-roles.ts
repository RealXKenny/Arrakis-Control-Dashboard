import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { readBoundedText } from '../../../lib/http/response';
import type { DashboardSession } from './session-store';

/** Verify current roles directly with Discord; never use the session's cached role list. */
export async function hasDiscordRole(session: DashboardSession, configuredRoles: string | undefined): Promise<boolean> {
  try {
    const env = getServerEnv();
    const guildId = env.DISCORD_GUILD_ID;
    const roles = configuredRoles?.split(',').map((role) => role.trim());
    const token = env.DISCORD_BOT_TOKEN;
    const userId = session.user.id;
    if (
      !guildId ||
      !/^\d{15,25}$/.test(guildId) ||
      session.guildId !== guildId ||
      !/^\d{15,25}$/.test(userId) ||
      !roles?.length ||
      !token ||
      roles.length > 20 ||
      !roles.every((role) => /^\d{15,25}$/.test(role))
    )
      return false;
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const value: unknown = JSON.parse(await readBoundedText(response, 32768));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const memberRoles = (value as Record<string, unknown>).roles;
    if (
      !Array.isArray(memberRoles) ||
      memberRoles.length > 250 ||
      !memberRoles.every((role) => typeof role === 'string' && /^\d{15,25}$/.test(role))
    )
      return false;
    return roles.some((role) => memberRoles.includes(role));
  } catch {
    return false;
  }
}
