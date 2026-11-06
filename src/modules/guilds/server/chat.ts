import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { NextResponse } from '../../../infrastructure/pages-api';
import { applicationContext, parseStoredApplication } from './applications';
import { requireGuildLeader } from './leader';
import { queryValue, requireGuildMutationOrigin } from './common';
import { guildChatInputSchema, guildChatMessageSchema } from '../applications';

async function conversation(req, res) {
  const ctx = await applicationContext(req, res);
  const applicationId = queryValue(req.query?.applicationId);
  if (!applicationId || !/^[a-f0-9]{64}$/.test(applicationId))
    throw new AppError('Invalid application ID', 400, 'INVALID_GUILD_APPLICATION', true);
  const own = applicationId === ctx.id;
  if (!own) await requireGuildLeader(req, res, ctx.guildId);
  const application = parseStoredApplication(
    await ctx.redis.eval("return redis.call('HGET', KEYS[1], ARGV[1])", [ctx.records], [applicationId]),
  );
  if (!application || application.id !== applicationId || (own && application.discordId !== ctx.session.user.id))
    throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  const generation = application.conversationId ?? String(application.submittedAt);
  return {
    ...ctx,
    own,
    applicationId,
    generation,
    chatKey: `arrakis:guild-chat:${ctx.guildId}:${applicationId}:${generation}`,
  };
}

const checkApplication = `
  local value = redis.call('HGET', KEYS[1], ARGV[1])
  if not value then return false end
  local application = cjson.decode(value)
  if (application.conversationId or tostring(application.submittedAt)) ~= ARGV[2] then return false end
`;

export async function GET(req, res) {
  const ctx = await conversation(req, res);
  const values = await ctx.redis.eval(
    `${checkApplication}
    return redis.call('LRANGE', KEYS[2], -100, -1)
  `,
    [ctx.records, ctx.chatKey],
    [ctx.applicationId, ctx.generation],
  );
  if (!Array.isArray(values)) throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  const messages = values.flatMap((value: unknown) => {
    try {
      const parsed = guildChatMessageSchema.safeParse(typeof value === 'string' ? JSON.parse(value) : null);
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  return NextResponse.json({ ok: true, data: { messages } });
}

export async function POST(req, res) {
  requireGuildMutationOrigin(req);
  const input = guildChatInputSchema.safeParse(req.body);
  if (!input.success)
    throw new AppError('Enter a message of up to 1,000 characters.', 400, 'INVALID_GUILD_CHAT_MESSAGE', true);
  const ctx = await conversation(req, res);
  const message = guildChatMessageSchema.parse({
    id: input.data.clientMessageId,
    text: input.data.text,
    senderId: ctx.session.user.id,
    senderName: ctx.session.user.global_name || ctx.session.user.username || ctx.session.user.id,
    role: ctx.own ? 'applicant' : 'reviewer',
    sentAt: Date.now(),
  });
  // Dev note: duplicate comms are for sandworm echoes, not a retried send button.
  const value = await ctx.redis.eval(
    `${checkApplication}
    local ttl = redis.call('TTL', KEYS[1])
    if ttl <= 0 then return false end
    local messages = redis.call('LRANGE', KEYS[2], -100, -1)
    for _, encoded in ipairs(messages) do
      local existing = cjson.decode(encoded)
      if existing.id == ARGV[3] and existing.senderId == ARGV[4] then return encoded end
    end
    redis.call('RPUSH', KEYS[2], ARGV[5])
    redis.call('LTRIM', KEYS[2], -100, -1)
    redis.call('EXPIRE', KEYS[2], ttl)
    return ARGV[5]
  `,
    [ctx.records, ctx.chatKey],
    [ctx.applicationId, ctx.generation, message.id, message.senderId, JSON.stringify(message)],
  );
  if (typeof value !== 'string') throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  const parsed = guildChatMessageSchema.safeParse(JSON.parse(value));
  if (!parsed.success) throw new AppError('Unable to read the chat message.', 503, 'GUILD_CHAT_UNAVAILABLE', true);
  return NextResponse.json({ ok: true, data: parsed.data });
}
