import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getGuildSession, queryValue, requireGuildMutationOrigin } from './common';
import { requireGuildLeader } from './leader';
import { guildApplicationInputSchema, guildApplicationReviewSchema, guildApplicationSchema } from '../applications';
import { guildRequirementSchema } from '../requirements';

const TTL_SECONDS = 90 * 24 * 60 * 60;
async function context(req, res) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const guildId = queryValue(req.query?.guildId);
  if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
    throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild application storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  const id = createHash('sha256').update(`${guildId}:${session.user.id}`).digest('hex');
  return {
    session,
    guildId,
    redis,
    id,
    records: `arrakis:guild-applications:${guildId}`,
    index: `arrakis:guild-applications-index:${guildId}`,
  };
}

function parseStored(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = guildApplicationSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(req, res) {
  const ctx = await context(req, res);
  const value = await ctx.redis.eval("return redis.call('HGET', KEYS[1], ARGV[1])", [ctx.records], [ctx.id]);
  return NextResponse.json({ ok: true, data: parseStored(value) });
}

export async function POST(req, res) {
  const ctx = await context(req, res);
  requireGuildMutationOrigin(req);
  const input = guildApplicationInputSchema.safeParse(req.body);
  if (!input.success)
    throw new AppError(
      'Complete every application field within its character limit.',
      400,
      'INVALID_GUILD_APPLICATION',
      true,
    );
  const listing = guildRequirementSchema.safeParse(await ctx.redis.get(`arrakis:guild-requirements:${ctx.guildId}`));
  if (!listing.success || !listing.data.published)
    throw new AppError('This guild is not accepting applications.', 409, 'GUILD_NOT_RECRUITING', true);
  const player = await getLinkedPlayer({
    guildId: ctx.session.guildId,
    channelId: 'dashboard',
    userId: ctx.session.user.id,
    username: ctx.session.user.username,
    roleIds: ctx.session.roleIds,
    interactionId: `guild-apply-${ctx.guildId}`,
    commandName: 'portal',
  }).catch(() => {
    throw new AppError(
      'Your linked character could not be verified right now. Try again shortly.',
      503,
      'PLAYER_VERIFICATION_UNAVAILABLE',
      true,
    );
  });
  if (!player.linked || (!player.pawnId && !player.controllerId) || !player.characterName?.trim())
    throw new AppError('Link your character before applying to a guild.', 403, 'LINKED_PLAYER_REQUIRED', true);
  const application = guildApplicationSchema.parse({
    ...input.data,
    id: ctx.id,
    discordId: ctx.session.user.id,
    discordName: ctx.session.user.global_name || ctx.session.user.username || ctx.session.user.id,
    characterName: player.characterName,
    submittedAt: Date.now(),
    status: 'pending',
  });
  // Dev note: one application per survivor; even a sandworm cannot cut this queue twice.
  const result = await ctx.redis.eval(
    `
    local listing = redis.call('GET', KEYS[3])
    if not listing or not cjson.decode(listing).published then return -1 end
    if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return -2 end
    if redis.call('HLEN', KEYS[1]) >= 200 then return -3 end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
    redis.call('EXPIRE', KEYS[1], ARGV[4])
    redis.call('EXPIRE', KEYS[2], ARGV[4])
    return 1
  `,
    [ctx.records, ctx.index, `arrakis:guild-requirements:${ctx.guildId}`],
    [ctx.id, JSON.stringify(application), -application.submittedAt, TTL_SECONDS],
  );
  if (Number(result) === -1)
    throw new AppError('This guild is not accepting applications.', 409, 'GUILD_NOT_RECRUITING', true);
  if (Number(result) === -2)
    throw new AppError('You have already applied to this guild.', 409, 'GUILD_APPLICATION_EXISTS', true);
  if (Number(result) !== 1)
    throw new AppError(
      'This guild’s application inbox is full. Contact the guild leader.',
      409,
      'GUILD_APPLICATION_INBOX_FULL',
      true,
    );
  return NextResponse.json({ ok: true, data: application }, { status: 201 });
}

export async function LIST(req, res) {
  const ctx = await context(req, res);
  await requireGuildLeader(req, res, ctx.guildId);
  const page = queryValue(req.query?.page) ?? '0';
  if (!/^\d{1,2}$/.test(page) || Number(page) > 9)
    throw new AppError('Invalid application page', 400, 'INVALID_GUILD_QUERY', true);
  const start = Number(page) * 20;
  const values = await ctx.redis.eval(
    `
    local ids = redis.call('ZRANGE', KEYS[2], ARGV[1], ARGV[2])
    local rows = {}
    for _, id in ipairs(ids) do
      local value = redis.call('HGET', KEYS[1], id)
      if value then table.insert(rows, value) end
    end
    return rows
  `,
    [ctx.records, ctx.index],
    [start, start + 20],
  );
  const rows = Array.isArray(values) ? values.map(parseStored).filter((value) => value !== null) : [];
  return NextResponse.json({ ok: true, data: { rows: rows.slice(0, 20), hasMore: rows.length > 20 } });
}

export async function REVIEW(req, res) {
  const ctx = await context(req, res);
  requireGuildMutationOrigin(req);
  await requireGuildLeader(req, res, ctx.guildId);
  const parsed = guildApplicationReviewSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid application review', 400, 'INVALID_GUILD_APPLICATION_REVIEW', true);
  const { applicationId, status } = parsed.data;
  const value = await ctx.redis.eval(
    `
    local value = redis.call('HGET', KEYS[1], ARGV[1])
    if not value then return false end
    if ARGV[2] == 'remove' then
      redis.call('HDEL', KEYS[1], ARGV[1])
      redis.call('ZREM', KEYS[2], ARGV[1])
      return 'removed'
    end
    local application = cjson.decode(value)
    application.status = ARGV[2]
    local updated = cjson.encode(application)
    redis.call('HSET', KEYS[1], ARGV[1], updated)
    return updated
  `,
    [ctx.records, ctx.index],
    [applicationId, status],
  );
  if (!value) throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  return NextResponse.json({ ok: true, data: value === 'removed' ? null : parseStored(value) });
}
