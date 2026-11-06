import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getGuildSession, queryValue, requireGuildMutationOrigin } from './common';
import { requireGuildLeader } from './leader';
import { requireDashboardAdmin } from '../../admin/server/access';
import { guildChatInputSchema, guildChatMessageSchema } from '../applications';

async function context(req, res, admin: boolean) {
  const session = admin ? await requireDashboardAdmin(req, res) : await getGuildSession(req, res);
  if (!session) throw new AppError('Sign in to continue.', 401, 'UNAUTHORIZED', true);
  const guildId = queryValue(req.query?.guildId);
  if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
    throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  if (!admin) await requireGuildLeader(req, res, guildId);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Chat storage unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return { session, redis, key: `arrakis:guild-support:${guildId}` };
}

async function read(req, res, admin: boolean) {
  const ctx = await context(req, res, admin);
  const values = await ctx.redis.eval("return redis.call('LRANGE', KEYS[1], -100, -1)", [ctx.key], []);
  const messages = Array.isArray(values)
    ? values.flatMap((value) => {
        try {
          const parsed = guildChatMessageSchema.safeParse(JSON.parse(value));
          return parsed.success ? [parsed.data] : [];
        } catch {
          return [];
        }
      })
    : [];
  return NextResponse.json({ ok: true, data: { messages } });
}

async function send(req, res, admin: boolean) {
  requireGuildMutationOrigin(req);
  const input = guildChatInputSchema.safeParse(req.body);
  if (!input.success)
    throw new AppError('Enter a message of up to 1,000 characters.', 400, 'INVALID_GUILD_CHAT_MESSAGE', true);
  const ctx = await context(req, res, admin);
  const message = guildChatMessageSchema.parse({
    id: input.data.clientMessageId,
    text: input.data.text,
    senderId: ctx.session.user.id,
    senderName: ctx.session.user.global_name || ctx.session.user.username || ctx.session.user.id,
    role: admin ? 'reviewer' : 'applicant',
    sentAt: Date.now(),
  });
  const value = await ctx.redis.eval(
    `
    for _, encoded in ipairs(redis.call('LRANGE', KEYS[1], -100, -1)) do
      local existing = cjson.decode(encoded)
      if existing.id == ARGV[1] and existing.senderId == ARGV[2] then return encoded end
    end
    redis.call('RPUSH', KEYS[1], ARGV[3])
    redis.call('LTRIM', KEYS[1], -100, -1)
    redis.call('EXPIRE', KEYS[1], 7776000)
    return ARGV[3]
  `,
    [ctx.key],
    [message.id, message.senderId, JSON.stringify(message)],
  );
  const parsed = guildChatMessageSchema.safeParse(typeof value === 'string' ? JSON.parse(value) : null);
  if (!parsed.success) throw new AppError('Unable to confirm the message.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({ ok: true, data: parsed.data });
}
export const GET = (req, res) => read(req, res, false);
export const POST = (req, res) => send(req, res, false);
export const ADMIN_GET = (req, res) => read(req, res, true);
export const ADMIN_POST = (req, res) => send(req, res, true);
