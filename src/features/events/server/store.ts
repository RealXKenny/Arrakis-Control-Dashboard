import '../../../lib/assert-server';
import { getRedisClient } from '../../../lib/redis/client';
import { communityEventKeys } from '../../../lib/redis/keys';
import { AppError } from '../../../lib/errors';
import {
  communityEventSchema,
  eventIdSchema,
  eventInputSchema,
  firstCommunityEvent,
  EVENT_LIMIT,
  type CommunityEvent,
  type EventInput,
} from '../contracts';

const INITIALIZE = `-- community-events:initialize
if redis.call('HEXISTS', KEYS[1], '__seeded') == 0 then
  local seed = cjson.decode(ARGV[1])
  redis.call('HSET', KEYS[1], '__seeded', '1', seed.id, ARGV[1])
end
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[2]) + 1 then return redis.error_reply('Event store exceeds limit') end
return redis.call('HGETALL', KEYS[1])
`;
const MUTATE = `-- community-events:mutate
local old = redis.call('HGET', KEYS[1], ARGV[1])
local expected = tonumber(ARGV[2])
if expected == 0 then
  if old then return 'conflict' end
  if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) + 1 then return 'full' end
else
  if not old then return 'missing' end
  local ok, value = pcall(cjson.decode, old)
  if not ok or value.revision ~= expected then return 'conflict' end
end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
return 'ok'
`;

function storage() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Community events are temporarily unavailable.', 503, 'EVENTS_UNAVAILABLE', true);
  return redis;
}

function parseRecord(value: unknown, id: string): CommunityEvent | null {
  if (typeof value !== 'string' || value.length > 32_768) return null;
  try {
    const parsed = communityEventSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.id === id ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Seed once atomically; the marker remains after deletion so an administrator's changes are never undone. */
export async function listCommunityEvents(includeDrafts = false): Promise<CommunityEvent[]> {
  const values = await storage().eval(
    INITIALIZE,
    [communityEventKeys.records],
    [JSON.stringify(firstCommunityEvent()), EVENT_LIMIT],
  );
  if (!Array.isArray(values) || values.length > (EVENT_LIMIT + 1) * 2)
    throw new Error('Invalid event storage response.');
  const events: CommunityEvent[] = [];
  for (let index = 0; index < values.length; index += 2) {
    if (typeof values[index] !== 'string' || values[index] === '__seeded') continue;
    const event = parseRecord(values[index + 1], values[index]);
    if (event && (includeDrafts || event.visibility === 'published')) events.push(event);
  }
  return events.sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999') ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

function checkResult(result: unknown): void {
  if (result === 'ok') return;
  if (result === 'conflict')
    throw new AppError(
      'This event changed or was already saved. Reload the event list before saving again.',
      409,
      'EVENT_CONFLICT',
      true,
    );
  if (result === 'missing') throw new AppError('This event no longer exists.', 404, 'EVENT_NOT_FOUND', true);
  if (result === 'full')
    throw new AppError(
      `You can keep up to ${EVENT_LIMIT} events. Delete an older event first.`,
      409,
      'EVENT_LIMIT',
      true,
    );
  throw new Error('Invalid event mutation response.');
}

export async function saveCommunityEvent(id: string, input: EventInput, revision: number): Promise<CommunityEvent> {
  eventIdSchema.parse(id);
  const data = eventInputSchema.parse(input);
  await listCommunityEvents(true);
  const redis = storage();
  const existing = revision > 0 ? parseRecord(await redis.command(['HGET', communityEventKeys.records, id]), id) : null;
  if (revision > 0 && !existing) throw new AppError('This event no longer exists.', 404, 'EVENT_NOT_FOUND', true);
  const now = new Date().toISOString();
  const event: CommunityEvent = {
    ...data,
    id,
    revision: revision + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  checkResult(
    await redis.eval(MUTATE, [communityEventKeys.records], [id, revision, JSON.stringify(event), 'put', EVENT_LIMIT]),
  );
  return event;
}

export async function deleteCommunityEvent(id: string, revision: number): Promise<void> {
  eventIdSchema.parse(id);
  await listCommunityEvents(true);
  checkResult(await storage().eval(MUTATE, [communityEventKeys.records], [id, revision, '', 'delete', EVENT_LIMIT]));
}
