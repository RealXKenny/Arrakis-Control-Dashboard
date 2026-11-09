import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import type { DiscordContainerPayload } from '../../../lib/discord-components';
import {
  syncDiscordAnnouncement,
  removeDiscordAnnouncement,
  type DiscordAnnouncementResult,
} from '../../../server/integrations/discord-bot';
import { ANNOUNCEMENT_LIMITS } from '../discord';

const REFRESH = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], 60) end return 0`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const KEEP_SECONDS = 365 * 86400;
const partKey = (key: string, index: number) => (index === 0 ? key : `${key}:part:${index + 1}`);

function confirmed(result: DiscordAnnouncementResult): void {
  if (['sent', 'unchanged', 'removed'].includes(result.status)) return;
  throw new AppError(
    result.status === 'unknown'
      ? 'Discord confirmation is unknown for an announcement part. Check the channel before retrying; confirmed parts are preserved.'
      : 'The announcement series is incomplete. Check bot permissions or rate limits, then send again to resume the same parts.',
    503,
    'DISCORD_ANNOUNCEMENT_UNAVAILABLE',
    true,
  );
}

/** A series lease prevents two administrators from interleaving different generations of the same release. */
export async function syncChangelogSeries(
  key: string,
  channelId: string,
  payloads: DiscordContainerPayload[],
): Promise<{ edited: boolean; parts: number }> {
  if (!payloads.length || payloads.length > ANNOUNCEMENT_LIMITS.parts)
    throw new AppError('Invalid announcement part count.', 400, 'INVALID_ANNOUNCEMENT', true);
  const redis = getRedisClient();
  if (!redis)
    throw new AppError('Redis is required to track announcement parts.', 503, 'DISCORD_ANNOUNCEMENT_UNAVAILABLE', true);
  const lockKey = `${key}:series-lock`;
  const manifestKey = `${key}:series`;
  const lease = randomUUID();
  if ((await redis.set(lockKey, lease, { nx: true, ex: 60 })) !== 'OK')
    throw new AppError(
      'This announcement is already being updated. Try again shortly.',
      409,
      'ANNOUNCEMENT_BUSY',
      true,
    );
  try {
    const previous = await redis.get<unknown>(manifestKey);
    if (
      previous !== null &&
      (!Number.isInteger(previous) || Number(previous) < 1 || Number(previous) > ANNOUNCEMENT_LIMITS.parts)
    )
      throw new AppError(
        'Announcement tracking needs administrator attention.',
        503,
        'ANNOUNCEMENT_STATE_INVALID',
        true,
      );
    const oldCount = previous === null ? 1 : Number(previous);
    // Record the high-water mark first: a crash during expansion or cleanup must not orphan part tracking.
    await redis.set(manifestKey, Math.max(oldCount, payloads.length), { ex: KEEP_SECONDS });
    const refresh = async () => {
      if (Number(await redis.eval(REFRESH, [lockKey], [lease])) !== 1)
        throw new AppError(
          'Announcement update lease expired. Send again to resume safely.',
          409,
          'ANNOUNCEMENT_BUSY',
          true,
        );
    };
    const perform = async (action: () => Promise<DiscordAnnouncementResult>) => {
      for (let attempt = 0; ; attempt++) {
        await refresh();
        const result = await action();
        if (result.retryAfterSeconds && result.retryAfterSeconds <= 30 && attempt < 2) {
          // A 429 is a confirmed rejection; retrying it cannot duplicate a message.
          await pause((result.retryAfterSeconds + 0.25) * 1000);
          continue;
        }
        confirmed(result);
        return result;
      }
    };
    let edited = false;
    for (let index = 0; index < payloads.length; index++) {
      const result = await perform(() => syncDiscordAnnouncement(partKey(key, index), channelId, payloads[index]));
      edited ||= result.edited === true || result.status === 'unchanged';
      if (result.status === 'sent' && index + 1 < payloads.length) await pause(1100);
    }
    for (let index = payloads.length; index < oldCount; index++) {
      await perform(() => removeDiscordAnnouncement(partKey(key, index), channelId));
    }
    await redis.set(manifestKey, payloads.length, { ex: KEEP_SECONDS });
    return { edited, parts: payloads.length };
  } finally {
    await redis.eval(RELEASE, [lockKey], [lease]).catch(() => undefined);
  }
}
