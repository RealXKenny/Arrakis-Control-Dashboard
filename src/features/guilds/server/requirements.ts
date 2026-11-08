import '../../../lib/assert-server';
import { guildKeys } from '../../../lib/redis/keys';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { NextResponse } from '../../../server/pages-api';
import { getGuildSession, queryValue, requireGuildMutationOrigin } from './common';
import { requireGuildLeader } from './leader';
import { guildRequirementSchema } from '../requirements';

const indexKey = guildKeys.requirementsIndex;
const key = (id: string) => guildKeys.requirements(id);

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

/** The saved settings for a guild, or null when none were saved (or they no longer parse). */
export async function readGuildRequirement(redis: NonNullable<ReturnType<typeof getRedisClient>>, id: string) {
  const parsed = guildRequirementSchema.safeParse(await redis.get(key(id)));
  return parsed.success ? parsed.data : null;
}

export async function GET(req, res) {
  const id = guildId(req);
  await requireGuildLeader(req, res, id);
  const redis = await storage(req, res);
  return NextResponse.json({ ok: true, data: await readGuildRequirement(redis, id) });
}

export async function POST(req, res) {
  requireGuildMutationOrigin(req);
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

const PAGE_SIZE = 20;

/** Published listings, newest first. Shared by the legacy LIST route and the V2 directory page. */
export async function listRecruitingGuilds(redis: NonNullable<ReturnType<typeof getRedisClient>>, page: number) {
  const start = page * PAGE_SIZE;
  const ids = await redis.zrange<string[]>(indexKey, start, start + PAGE_SIZE, { byScore: false });
  const entries = await Promise.all(
    ids.slice(0, PAGE_SIZE).map(async (entry) => {
      const id = typeof entry === 'string' && entry.startsWith('guild:') ? entry.slice(6) : '';
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
      const parsed = guildRequirementSchema.safeParse(await redis.get(key(id)));
      return parsed.success && parsed.data.published ? { ...parsed.data, guildId: id } : null;
    }),
  );
  return { rows: entries.filter((entry) => entry !== null), hasMore: ids.length > PAGE_SIZE };
}

export async function LIST(req, res) {
  const redis = await storage(req, res);
  const rawPage = queryValue(req.query?.page) ?? '0';
  if (!/^\d{1,4}$/.test(rawPage)) throw new AppError('Invalid page', 400, 'INVALID_GUILD_QUERY', true);
  return NextResponse.json({ ok: true, data: await listRecruitingGuilds(redis, Number(rawPage)) });
}
