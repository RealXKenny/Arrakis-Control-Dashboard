import '../../../lib/assert-server';
import { guildKeys } from '../../../lib/redis/keys';
import { requireDashboardAdmin } from './access';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { queryValue } from '../../guilds/server/common';
import { parseStoredApplication } from '../../guilds/server/applications';
import { guildRequirementSchema } from '../../guilds/requirements';
import { guildChatMessageSchema } from '../../guilds/applications';
import { createLogger } from '../../../lib/logger';

async function context(req, res) {
  const session = await requireDashboardAdmin(req, res);
  const guildId = queryValue(req.query?.guildId);
  if (!guildId || !/^[a-zA-Z0-9_-]{1,128}$/.test(guildId))
    throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild storage unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return { session, guildId, redis, records: guildKeys.applications(guildId) };
}
export async function GET(req, res) {
  const ctx = await context(req, res);
  const page = queryValue(req.query?.page) ?? '0';
  if (!/^\d{1,2}$/.test(page) || Number(page) > 9) throw new AppError('Invalid page', 400, 'INVALID_GUILD_QUERY', true);
  const start = Number(page) * 20;
  const values = await ctx.redis.eval(
    `
    local rows = {}
    for _, id in ipairs(redis.call('ZRANGE', KEYS[2], ARGV[1], ARGV[2])) do
      local value = redis.call('HGET', KEYS[1], id)
      if value then table.insert(rows, value) end
    end
    return rows
  `,
    [ctx.records, guildKeys.applicationsIndex(ctx.guildId)],
    [start, start + 20],
  );
  const rows = Array.isArray(values) ? values.map(parseStoredApplication).filter((value) => value !== null) : [];
  const listing = guildRequirementSchema.safeParse(await ctx.redis.get(guildKeys.requirements(ctx.guildId)));
  createLogger('ADMIN').info('Administrator inspected guild applications', {
    actorId: ctx.session.user.id,
    guildId: ctx.guildId,
    page: Number(page),
  });
  return NextResponse.json({
    ok: true,
    data: { rows: rows.slice(0, 20), hasMore: rows.length > 20, listing: listing.success ? listing.data : null },
  });
}
export async function MESSAGES(req, res) {
  const ctx = await context(req, res);
  const id = queryValue(req.query?.applicationId);
  if (!id || !/^[a-f0-9]{64}$/.test(id))
    throw new AppError('Invalid application ID', 400, 'INVALID_GUILD_APPLICATION', true);
  const application = parseStoredApplication(
    await ctx.redis.eval("return redis.call('HGET', KEYS[1], ARGV[1])", [ctx.records], [id]),
  );
  if (!application || application.id !== id)
    throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  const generation = application.conversationId ?? String(application.submittedAt);
  const values = await ctx.redis.eval(
    `
    local raw = redis.call('HGET', KEYS[1], ARGV[1])
    if not raw then return false end
    local app = cjson.decode(raw)
    if (app.conversationId or tostring(app.submittedAt)) ~= ARGV[2] then return false end
    return redis.call('LRANGE', KEYS[2], -100, -1)
  `,
    [ctx.records, guildKeys.chat(ctx.guildId, id, generation)],
    [id, generation],
  );
  if (!Array.isArray(values)) throw new AppError('Application not found', 404, 'GUILD_APPLICATION_NOT_FOUND', true);
  const messages = values.flatMap((value) => {
    try {
      const parsed = guildChatMessageSchema.safeParse(JSON.parse(value));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  createLogger('ADMIN').info('Administrator inspected application conversation', {
    actorId: ctx.session.user.id,
    guildId: ctx.guildId,
    applicationId: id,
  });
  return NextResponse.json({ ok: true, data: { messages } });
}
