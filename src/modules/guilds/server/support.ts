import '../../../lib/assert-server';
import { z } from 'zod';
import { SUPPORT_UNREAD_INDEX, supportReceiptFunctions } from './support-receipts';
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
  return { session, redis, guildId, party: admin ? 'admin' : 'leader', key: `arrakis:guild-support:${guildId}` };
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
    `${supportReceiptFunctions}
    for _, encoded in ipairs(redis.call('LRANGE', KEYS[1], -100, -1)) do
      local existing = cjson.decode(encoded)
      if existing.id == ARGV[1] and existing.senderId == ARGV[2] then return encoded end
    end
    redis.call('RPUSH', KEYS[1], ARGV[3])
    for _, encoded in ipairs(redis.call('LRANGE', KEYS[1], 0, -101)) do
      local message = decode(encoded)
      local key = message_key(message)
      if key and message.role == 'applicant' then redis.call('ZREM', KEYS[2], ARGV[4] .. ':' .. key) end
    end
    redis.call('LTRIM', KEYS[1], -100, -1)
    redis.call('EXPIRE', KEYS[1], 7776000)
    redis.call('EXPIRE', KEYS[1] .. ':seen', 7776000)
    sync_admin_index(KEYS[1], ARGV[4], KEYS[2], tonumber(ARGV[5]))
    return ARGV[3]
  `,
    [ctx.key, SUPPORT_UNREAD_INDEX],
    [message.id, message.senderId, JSON.stringify(message), ctx.guildId, Date.now()],
  );
  const parsed = guildChatMessageSchema.safeParse(typeof value === 'string' ? JSON.parse(value) : null);
  if (!parsed.success) throw new AppError('Unable to confirm the message.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({ ok: true, data: parsed.data });
}
export const GET = (req, res) => read(req, res, false);
export const POST = (req, res) => send(req, res, false);
export const ADMIN_GET = (req, res) => read(req, res, true);
export const ADMIN_POST = (req, res) => send(req, res, true);

const receiptSchema = z.object({
  messages: z.array(z.object({ id: z.uuid(), senderId: z.string().min(1).max(128) })).max(100),
});
async function acknowledge(req, res, admin: boolean) {
  requireGuildMutationOrigin(req);
  const input = receiptSchema.safeParse(req.body);
  if (!input.success) throw new AppError('Invalid read receipt', 400, 'INVALID_GUILD_CHAT_RECEIPT', true);
  const ctx = await context(req, res, admin);
  const result = await ctx.redis.eval(
    `${supportReceiptFunctions}
    local ttl = redis.call('TTL', KEYS[1])
    if ttl <= 0 then return 0 end
    local seen = support_seen(KEYS[1], ARGV[1])
    for _, key in ipairs(cjson.decode(ARGV[2])) do seen[key] = true end
    local role = ARGV[1] == 'admin' and 'applicant' or 'reviewer'
    local retained = {}
    for _, encoded in ipairs(redis.call('LRANGE', KEYS[1], -100, -1)) do
      local message = decode(encoded)
      local key = message_key(message)
      if key and message.role == role and seen[key] then
        table.insert(retained, key)
        if ARGV[1] == 'admin' then redis.call('ZREM', KEYS[2], ARGV[3] .. ':' .. key) end
      end
    end
    redis.call('HSET', KEYS[1] .. ':seen', ARGV[1], cjson.encode(retained))
    redis.call('EXPIRE', KEYS[1] .. ':seen', ttl)
    return support_unread(KEYS[1], ARGV[1])
  `,
    [ctx.key, SUPPORT_UNREAD_INDEX],
    [ctx.party, JSON.stringify(input.data.messages.map((message) => message.senderId + ':' + message.id)), ctx.guildId],
  );
  if (typeof result !== 'number' || result < 0 || result > 100)
    throw new AppError('Unable to save read receipt.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({ ok: true, data: { unreadCount: result } });
}
export async function STATUS(req, res) {
  const ctx = await context(req, res, false);
  const result = await ctx.redis.eval(
    `${supportReceiptFunctions} return support_unread(KEYS[1], 'leader')`,
    [ctx.key],
    [],
  );
  if (typeof result !== 'number' || result < 0 || result > 100)
    throw new AppError('Unable to load unread count.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({ ok: true, data: { unreadCount: result } });
}
export const READ = (req, res) => acknowledge(req, res, false);
export const ADMIN_READ = (req, res) => acknowledge(req, res, true);
export async function ADMIN_STATUS(req, res) {
  await requireDashboardAdmin(req, res);
  const raw = queryValue(req.query?.guildIds) ?? '';
  const ids = raw ? raw.split(',') : [];
  if (
    raw.length > 1800 ||
    ids.length > 20 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
  )
    throw new AppError('Invalid guild IDs', 400, 'INVALID_GUILD_QUERY', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Chat storage unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const now = Date.now();
  const values = await redis.eval(
    `${supportReceiptFunctions}
    local counts = {}
    for i = 2, #KEYS do
      sync_admin_index(KEYS[i], ARGV[i], KEYS[1], tonumber(ARGV[1]))
      table.insert(counts, support_unread(KEYS[i], 'admin'))
    end
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
    local total = redis.call('ZCOUNT', KEYS[1], '(' .. ARGV[1], '+inf')
    return {total, counts}
  `,
    [SUPPORT_UNREAD_INDEX, ...ids.map((id) => `arrakis:guild-support:${id}`)],
    [now, ...ids],
  );
  if (
    !Array.isArray(values) ||
    typeof values[0] !== 'number' ||
    !Number.isSafeInteger(values[0]) ||
    values[0] < 0 ||
    !Array.isArray(values[1]) ||
    values[1].length !== ids.length ||
    values[1].some((count) => typeof count !== 'number' || count < 0 || count > 100)
  )
    throw new AppError('Unable to load unread counts.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({
    ok: true,
    data: { total: values[0], guilds: Object.fromEntries(ids.map((id, index) => [id, values[1][index]])) },
  });
}
