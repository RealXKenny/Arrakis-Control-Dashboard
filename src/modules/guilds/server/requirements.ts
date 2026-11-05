import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getGuildSession, queryValue } from './common';
import { requireGuildLeader } from './leader';
import { guildRequirementSchema } from '../requirements';

const indexKey = 'arrakis:guild-requirements';
const key = (id: string) => `${indexKey}:${id}`;

async function storage(req, res) {
  if (!(await getGuildSession(req, res))) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild settings storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

function guildId(req): string {
  const id = queryValue(req.query?.guildId);
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AppError('Invalid guild ID', 400, 'INVALID_GUILD_ID', true);
  return id;
}

export async function GET(req, res) {
  const id = guildId(req);
  await requireGuildLeader(req, res, id);
  const redis = await storage(req, res);
  const value = await redis.get(key(id));
  const parsed = guildRequirementSchema.safeParse(value);
  return NextResponse.json({ ok: true, data: parsed.success ? parsed.data : null });
}

export async function POST(req, res) {
  const id = guildId(req);
  await requireGuildLeader(req, res, id);
  const parsed = guildRequirementSchema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError(
      'Enter a guild name, requirements (up to 2,000 characters), and contact details (up to 200 characters).',
      400,
      'INVALID_GUILD_REQUIREMENTS',
      true,
    );
  const redis = await storage(req, res);
  // Dev note: one transaction keeps the recruitment board from recruiting ghosts.
  await redis.eval(
    `
    redis.call('SET', KEYS[1], ARGV[1])
    if ARGV[2] == '1' then
      redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
    else
      redis.call('ZREM', KEYS[2], ARGV[4])
    end
    return 1
  `,
    [key(id), indexKey],
    [JSON.stringify(parsed.data), parsed.data.published ? '1' : '0', -Date.now(), `guild:${id}`],
  );
  return NextResponse.json({ ok: true, data: parsed.data });
}

export async function LIST(req, res) {
  const redis = await storage(req, res);
  const rawPage = queryValue(req.query?.page) ?? '0';
  if (!/^\d{1,4}$/.test(rawPage)) throw new AppError('Invalid page', 400, 'INVALID_GUILD_QUERY', true);
  const start = Number(rawPage) * 20;
  const ids = await redis.zrange<string[]>(indexKey, start, start + 20, { byScore: false });
  const entries = await Promise.all(
    ids.slice(0, 20).map(async (entry) => {
      const id = typeof entry === 'string' && entry.startsWith('guild:') ? entry.slice(6) : '';
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
      const parsed = guildRequirementSchema.safeParse(await redis.get(key(id)));
      return parsed.success && parsed.data.published ? { ...parsed.data, guildId: id } : null;
    }),
  );
  return NextResponse.json({ ok: true, data: { rows: entries.filter(Boolean), hasMore: ids.length > 20 } });
}
