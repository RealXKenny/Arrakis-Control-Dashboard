import '../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getServerEnv } from '../../config/env';
import { getRedisClient } from '../../lib/redis/client';
import { AppError } from '../../lib/errors';
import { readBoundedText } from '../../lib/http/response';
import type { DiscordContainerPayload } from '../../lib/discord-components';

const KEEP_SECONDS = 365 * 86400;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
type MessageState = {
  channelId: string;
  messageId?: string;
  fingerprint: string;
  outcome: 'unknown' | 'sent' | 'rejected';
  retryAt?: number;
};
export type DiscordAnnouncementResult = {
  status: 'sent' | 'removed' | 'unchanged' | 'unconfigured' | 'busy' | 'unknown' | 'failed';
  edited?: boolean;
  retryAfterSeconds?: number;
};

/** Credentials stay on this fixed Discord origin; raw provider bodies and errors never escape. */
export async function discordBotRequest(path: string, method = 'GET', body?: unknown): Promise<Response> {
  const token = getServerEnv().DISCORD_BOT_TOKEN;
  if (!token)
    throw new AppError('Set DISCORD_BOT_TOKEN to enable announcements.', 503, 'DISCORD_BOT_NOT_CONFIGURED', true);
  try {
    return await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError(
      'Discord did not confirm the request. Check the channel before trying again.',
      502,
      'DISCORD_OUTCOME_UNKNOWN',
      true,
    );
  }
}

export async function verifyAnnouncementChannel(channelId: string): Promise<void> {
  if (!/^\d{15,25}$/.test(channelId))
    throw new AppError('Invalid Discord channel configuration.', 503, 'DISCORD_CHANNEL_INVALID', true);
  const response = await discordBotRequest(`/channels/${channelId}`);
  let channel: Record<string, unknown>;
  try {
    channel = JSON.parse(await readBoundedText(response, 16384));
  } catch {
    throw new AppError('Discord channel could not be verified.', 502, 'DISCORD_CHANNEL_UNAVAILABLE', true);
  }
  if (
    !response.ok ||
    !channel ||
    typeof channel !== 'object' ||
    channel.guild_id !== getServerEnv().DISCORD_GUILD_ID ||
    ![0, 5].includes(Number(channel.type))
  )
    throw new AppError(
      'The bot needs access to a text or announcement channel in the configured Discord server.',
      503,
      'DISCORD_CHANNEL_UNAVAILABLE',
      true,
    );
}

/** Persistent intent before POST prevents uncertain sends from being blindly repeated after a crash. */
export async function syncDiscordAnnouncement(
  stateKey: string,
  channelId: string | undefined,
  source: DiscordContainerPayload | (() => Promise<DiscordContainerPayload | null>),
): Promise<DiscordAnnouncementResult> {
  if (!getServerEnv().DISCORD_BOT_TOKEN || !channelId) return { status: 'unconfigured' };
  const redis = getRedisClient();
  if (!redis) return { status: 'failed' };
  if (await redis.get('arrakis:{discord-bot}:cooldown')) return { status: 'busy' };
  const lockKey = `${stateKey}:lock`;
  const lease = randomUUID();
  if ((await redis.set(lockKey, lease, { nx: true, ex: 60 })) !== 'OK') return { status: 'busy' };
  try {
    const raw = await redis.get<unknown>(stateKey);
    if (
      raw !== null &&
      (!raw ||
        typeof raw !== 'object' ||
        !('channelId' in raw) ||
        !('outcome' in raw) ||
        !['unknown', 'sent', 'rejected'].includes(String(raw.outcome)))
    )
      return { status: 'failed' };
    const previous = raw && typeof raw === 'object' ? (raw as MessageState) : null;
    if (
      previous &&
      (previous.channelId !== channelId || (previous.messageId && !/^\d{15,25}$/.test(previous.messageId)))
    )
      return { status: 'failed' };
    if (previous?.outcome === 'unknown' && !previous.messageId) return { status: 'unknown' };
    if (previous?.retryAt && previous.retryAt > Date.now()) return { status: 'busy' };
    const payload = typeof source === 'function' ? await source() : source;
    if (!payload) return { status: 'unchanged' };
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    if (previous?.outcome === 'sent' && previous.fingerprint === fingerprint) {
      await redis.set(stateKey, previous, { ex: KEEP_SECONDS });
      return { status: 'unchanged' };
    }
    await verifyAnnouncementChannel(channelId);
    const messageId = previous?.messageId;
    const intent: MessageState = { channelId, ...(messageId ? { messageId } : {}), fingerprint, outcome: 'unknown' };
    await redis.set(stateKey, intent, { ex: KEEP_SECONDS });
    const nonce = createHash('sha256')
      .update(stateKey + channelId)
      .digest('hex')
      .slice(0, 24);
    let response: Response;
    try {
      response = await discordBotRequest(
        `/channels/${channelId}/messages${messageId ? `/${messageId}` : ''}`,
        messageId ? 'PATCH' : 'POST',
        {
          ...payload,
          ...(!messageId ? { nonce, enforce_nonce: true } : {}),
        },
      );
    } catch {
      return { status: 'unknown' };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const retryAfterSeconds =
        response.status === 429
          ? Math.min(3600, Math.max(1, Math.ceil(Number(response.headers.get('retry-after')) || 60)))
          : undefined;
      if (retryAfterSeconds) await redis.set('arrakis:{discord-bot}:cooldown', '1', { ex: retryAfterSeconds });
      // 5xx can follow a successful write. A 4xx rejection is definitive and safe to try later.
      await redis.set(
        stateKey,
        {
          ...intent,
          ...(messageId && response.status === 404 ? { messageId: undefined } : {}),
          outcome: response.status >= 500 ? 'unknown' : 'rejected',
          retryAt: Date.now() + (retryAfterSeconds ?? (response.status === 403 ? 300 : 60)) * 1000,
        },
        { ex: KEEP_SECONDS },
      );
      return {
        status: response.status >= 500 ? 'unknown' : 'failed',
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      };
    }
    let result: { id?: unknown };
    try {
      result = JSON.parse(await readBoundedText(response, 16384));
    } catch {
      return { status: 'unknown' };
    }
    if (!result || typeof result !== 'object' || typeof result.id !== 'string' || !/^\d{15,25}$/.test(result.id))
      return { status: 'unknown' };
    await redis.set(stateKey, { ...intent, messageId: result.id, outcome: 'sent' }, { ex: KEEP_SECONDS });
    return { status: 'sent', edited: Boolean(messageId) };
  } finally {
    await redis.eval(RELEASE, [lockKey], [lease]).catch(() => undefined);
  }
}

/** Known message IDs can be retired idempotently when an announcement series becomes shorter. */
export async function removeDiscordAnnouncement(
  stateKey: string,
  channelId: string,
): Promise<DiscordAnnouncementResult> {
  const redis = getRedisClient();
  if (!redis || !getServerEnv().DISCORD_BOT_TOKEN) return { status: 'unconfigured' };
  if (await redis.get('arrakis:{discord-bot}:cooldown')) return { status: 'busy' };
  const lease = randomUUID();
  const lockKey = `${stateKey}:lock`;
  if ((await redis.set(lockKey, lease, { nx: true, ex: 60 })) !== 'OK') return { status: 'busy' };
  try {
    const previous = await redis.get<unknown>(stateKey);
    if (previous === null) return { status: 'unchanged' };
    if (!previous || typeof previous !== 'object' || !('channelId' in previous) || previous.channelId !== channelId)
      return { status: 'failed' };
    if (!('messageId' in previous) || !previous.messageId) {
      if ('outcome' in previous && previous.outcome === 'rejected') {
        await redis.del(stateKey);
        return { status: 'unchanged' };
      }
      return { status: 'unknown' };
    }
    if (typeof previous.messageId !== 'string' || !/^\d{15,25}$/.test(previous.messageId)) return { status: 'failed' };
    await verifyAnnouncementChannel(channelId);
    let response: Response;
    try {
      response = await discordBotRequest(`/channels/${channelId}/messages/${previous.messageId}`, 'DELETE');
    } catch {
      return { status: 'unknown' };
    }
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 204 || response.status === 404) {
      await redis.del(stateKey);
      return { status: 'removed' };
    }
    if (response.status === 429) {
      const seconds = Math.min(3600, Math.max(1, Math.ceil(Number(response.headers.get('retry-after')) || 60)));
      await redis.set('arrakis:{discord-bot}:cooldown', '1', { ex: seconds });
    }
    return { status: response.status >= 500 ? 'unknown' : 'failed' };
  } finally {
    await redis.eval(RELEASE, [lockKey], [lease]).catch(() => undefined);
  }
}
