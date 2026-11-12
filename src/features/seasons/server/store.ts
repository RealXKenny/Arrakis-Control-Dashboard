import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  identifier,
  type Season,
  type Progress,
  type Totals,
  type Submission,
  emptyProgress,
  emptyTotals,
  seasonRecordSchema,
  progressRecordSchema,
  totalsRecordSchema,
} from '../contracts';

const root = 'arrakis:{seasons}:v1';
export const seasonKeys = {
  index: `${root}:index`,
  published: `${root}:published`,
  unique: (value: string) => `${root}:unique:${value}`,
  equipment: (owner: string) => `${root}:equipment:${identifier.parse(owner)}`,
  deliveries: (id: string) => `${root}:deliveries:${identifier.parse(id)}`,
  schedules: `${root}:schedules`,
  scheduleRevision: `${root}:schedule-revision`,
  season: (id: string) => `${root}:season:${identifier.parse(id)}`,
  progress: (id: string, owner: string) => `${root}:progress:${identifier.parse(id)}:${identifier.parse(owner)}`,
  totals: (id: string) => `${root}:totals:${identifier.parse(id)}`,
  inbox: (id: string) => `${root}:inbox:${identifier.parse(id)}`,
  inboxIndex: (id: string) => `${root}:inbox-index:${identifier.parse(id)}`,
  audit: (id: string) => `${root}:audit:${identifier.parse(id)}`,
  artwork: (hash: string) => `${root}:artwork:${hash}`,
  artworkIndex: (id: string) => `${root}:artwork-index:${identifier.parse(id)}`,
  presentationSnapshot: (id: string, revision: string) =>
    `${root}:presentation:${identifier.parse(id)}:${identifier.parse(revision)}`,
};
/** All validation happens before the first write. CAS is never automatically retried. */
export const COMMIT = `-- community-seasons:commit-v1
local input = cjson.decode(ARGV[1])
for i = 1, #KEYS do
  local kind = redis.call('TYPE', KEYS[i]).ok
  local wanted = 'string'
  if i == #input.expected + 1 or i >= #input.expected + 4 then wanted = 'zset' end
  if i == #input.expected + 2 then wanted = 'hash' end
  if i == #input.expected + 3 then wanted = 'list' end
  if kind ~= 'none' and kind ~= wanted then return 'corrupt' end
end
if input.requireEmptyInbox and redis.call('HLEN', KEYS[#input.expected + 2]) > 0 then return 'pending' end
for i, expected in ipairs(input.expected) do
  local actual = redis.call('GET', KEYS[i])
  if (actual or '') ~= expected then return 'conflict' end
end
if input.active or input.beforeDeadline then
  local now = redis.call('TIME')
  local ms = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
  if input.active and (ms < input.active[1] or ms >= input.active[2]) then return 'closed' end
  if input.beforeDeadline and ms >= input.beforeDeadline then return 'closed' end
end
for i, value in ipairs(input.values) do
  if value ~= false then redis.call('SET', KEYS[i], value) end
end
if input.index then redis.call('ZADD', KEYS[#input.expected + 1], input.index.score, input.index.id) end
if input.schedule then redis.call('ZADD', KEYS[#input.expected + 4], input.schedule.score, input.schedule.id) end
if input.publish then redis.call('ZADD', KEYS[#input.expected + 6], input.publish.score, input.publish.id) end
if input.inbox then
  if input.inbox.remove then
    redis.call('HDEL', KEYS[#input.expected + 2], input.inbox.id)
    redis.call('ZREM', KEYS[#input.expected + 5], input.inbox.id)
  else
    redis.call('HSET', KEYS[#input.expected + 2], input.inbox.id, input.inbox.value)
    redis.call('ZADD', KEYS[#input.expected + 5], input.inbox.score, input.inbox.id)
  end
end
redis.call('RPUSH', KEYS[#input.expected + 3], ARGV[2])
return 'ok'
`;
export function storage() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Seasons are temporarily unavailable.', 503, 'SEASONS_UNAVAILABLE', true);
  return redis;
}
export function fail(message: string, status = 409): never {
  throw new AppError(message, status, 'SEASON_CONFLICT', true);
}
export async function readRecord<T>(key: string): Promise<{ raw: string; value: T | null }> {
  const raw = await storage().command(['GET', key]);
  if (raw === null) return { raw: '', value: null };
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1024 * 1024)
    throw new Error('Invalid season storage record.');
  return { raw, value: JSON.parse(raw) as T };
}
export async function loadSeason(id: string) {
  const record = await readRecord<Season>(seasonKeys.season(id));
  if (!record.value) fail('Season not found.', 404);
  if (!seasonRecordSchema.safeParse(record.value).success || record.value.id !== id)
    throw new Error('Invalid season record.');
  return { ...record, value: record.value };
}
export async function listSeasons(offset = 0, includeDrafts = false): Promise<Season[]> {
  const ids = await storage().command([
    'ZREVRANGE',
    includeDrafts ? seasonKeys.index : seasonKeys.published,
    offset,
    offset + 24,
  ]);
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string')) throw new Error('Invalid season index.');
  return (await Promise.all(ids.map((id) => readRecord<Season>(seasonKeys.season(id))))).flatMap((v) =>
    v.value ? [v.value] : [],
  );
}
export async function loadMember(id: string, owner: string) {
  const [season, progress, totals] = await Promise.all([
    loadSeason(id),
    readRecord<Progress>(seasonKeys.progress(id, owner)),
    readRecord<Totals>(seasonKeys.totals(id)),
  ]);
  if (
    (progress.value && !progressRecordSchema.safeParse(progress.value).success) ||
    (totals.value && !totalsRecordSchema.safeParse(totals.value).success)
  )
    throw new Error('Invalid progression record.');
  return {
    season,
    progress: { ...progress, value: progress.value ?? emptyProgress() },
    totals: { ...totals, value: totals.value ?? emptyTotals() },
  };
}
type Write = { key: string; before: string; after?: unknown };
export async function commit(options: {
  id: string;
  actor: string;
  action: string;
  writes: Write[];
  active?: [number, number];
  beforeDeadline?: number;
  index?: { id: string; score: number };
  inbox?: { id: string; value?: string; remove?: boolean; score?: number };
  schedule?: { id: string; score: number };
  publish?: { id: string; score: number };
  requireEmptyInbox?: boolean;
  detail?: Record<string, string | number>;
}) {
  for (const write of options.writes)
    if (write.after !== undefined && Buffer.byteLength(JSON.stringify(write.after)) > 1024 * 1024)
      fail('This season record has reached its safe storage limit.');
  const audit = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: options.actor,
    action: options.action,
    ...options.detail,
  };
  const result = await storage().eval(
    COMMIT,
    [
      ...options.writes.map((v) => v.key),
      seasonKeys.index,
      seasonKeys.inbox(options.id),
      seasonKeys.audit(options.id),
      seasonKeys.schedules,
      seasonKeys.inboxIndex(options.id),
      seasonKeys.published,
    ],
    [
      JSON.stringify({
        expected: options.writes.map((v) => v.before),
        values: options.writes.map((v) => (v.after === undefined ? false : JSON.stringify(v.after))),
        active: options.active,
        beforeDeadline: options.beforeDeadline,
        index: options.index,
        inbox: options.inbox,
        schedule: options.schedule,
        publish: options.publish,
        requireEmptyInbox: options.requireEmptyInbox,
      }),
      JSON.stringify(audit),
    ],
  );
  if (result === 'closed') fail('This season is no longer accepting submissions.');
  if (result === 'pending') fail('Review all pending evidence before archiving.');
  if (result !== 'ok') fail('Progress changed. Refresh before trying again.');
}
export async function adminRecords(id: string, offset = 0) {
  const [ids, audit] = await Promise.all([
    storage().command(['ZRANGE', seasonKeys.inboxIndex(id), offset, offset + 49]),
    storage().command(['LRANGE', seasonKeys.audit(id), -100, -1]),
  ]);
  if (!Array.isArray(ids) || !Array.isArray(audit)) throw new Error('Invalid season review records.');
  const values = ids.length ? await storage().command(['HMGET', seasonKeys.inbox(id), ...ids.map(String)]) : [];
  if (!Array.isArray(values)) throw new Error('Invalid season inbox.');
  const submissions = values.filter((v) => typeof v === 'string').map((v) => JSON.parse(v) as Submission);
  return {
    submissions,
    cursor: String(offset + 50),
    audit: audit.map((v) => JSON.parse(String(v)) as Record<string, unknown>),
  };
}
