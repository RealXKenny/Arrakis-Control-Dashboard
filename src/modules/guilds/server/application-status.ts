import '../../../lib/assert-server';
import { guildKeys } from '../../../lib/redis/keys';
import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getGuildSession, queryValue } from './common';
import { chatReceiptFunctions } from './chat-receipts';
import { guildApplicationSummarySchema } from '../applications';

/** One application summary per guild for this Discord user (null when they have not applied). */
export async function readApplicationSummaries(
  redis: NonNullable<ReturnType<typeof getRedisClient>>,
  userId: string,
  guildIds: string[],
) {
  const entries = await Promise.all(
    guildIds.map(async (guildId) => {
      const id = createHash('sha256').update(`${guildId}:${userId}`).digest('hex');
      const value = await redis.eval(
        `${chatReceiptFunctions}
      local raw = redis.call('HGET', KEYS[1], ARGV[1])
      if not raw then return false end
      local ok, application = pcall(cjson.decode, raw)
      if not ok or type(application) ~= 'table' or application.id ~= ARGV[1] or application.discordId ~= ARGV[2] then return false end
      local chatKey = ARGV[3] .. (application.conversationId or tostring(application.submittedAt))
      return {application.id, application.status, unread_count(chatKey)}
    `,
        [guildKeys.applications(guildId)],
        [id, userId, `${guildKeys.chatPrefix(guildId)}${id}:`],
      );
      const parsed = guildApplicationSummarySchema.safeParse(
        Array.isArray(value) ? { id: value[0], status: value[1], unreadCount: value[2] } : null,
      );
      return [guildId, parsed.success ? parsed.data : null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function GET(req, res) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const raw = queryValue(req.query?.guildIds) ?? '';
  const guildIds = raw.split(',');
  if (
    !raw ||
    raw.length > 1800 ||
    guildIds.length > 20 ||
    new Set(guildIds).size !== guildIds.length ||
    guildIds.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
  )
    throw new AppError('Invalid guild IDs', 400, 'INVALID_GUILD_QUERY', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Application status is temporarily unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const applications = await readApplicationSummaries(redis, session.user.id, guildIds);
  return NextResponse.json({ ok: true, data: { applications } });
}
