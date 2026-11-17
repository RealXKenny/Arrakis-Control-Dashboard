import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { readPersonalTasks } from '../../tasks/server/store';
import {
  activityInputSchema,
  activityRecordSchema,
  emptyActivities,
  type ActivityInput,
  type ActivityRecord,
} from '../model';
const MAX_BYTES = 32768;
const RETENTION = 90 * 86400;
const READ = `-- activity-views-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value == '' then return false end
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const SAVE = `-- activity-views-save-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
 local ok, record = pcall(cjson.decode, old)
 if not ok or type(record) ~= 'table' then return 'invalid' end
 if record.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'`;
const unavailable = () =>
  new AppError(
    'Saved activity views are unavailable. Reload before making changes.',
    503,
    'ACTIVITY_VIEWS_UNAVAILABLE',
    true,
  );
const conflict = () =>
  new AppError(
    'Saved views changed in another tab. Reload before trying again. Your draft is kept.',
    409,
    'ACTIVITY_VIEWS_CONFLICT',
    true,
  );
export function activityViewsKey(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  return `arrakis:activity-views:v1:${createHash('sha256').update(owner).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
export async function readActivityViews(owner: string): Promise<ActivityRecord> {
  try {
    const raw = await redis().eval(READ, [activityViewsKey(owner)], [MAX_BYTES, RETENTION]);
    if (raw === '') return emptyActivities();
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) throw unavailable();
    const record = activityRecordSchema.parse(JSON.parse(raw));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}
async function write(owner: string, expected: string | null, record: ActivityRecord) {
  const serialized = JSON.stringify(activityRecordSchema.parse(record));
  if (Buffer.byteLength(serialized) > MAX_BYTES)
    throw new AppError('Saved views exceed the storage limit.', 413, 'ACTIVITY_VIEWS_TOO_LARGE', true);
  let result: unknown;
  try {
    result = await redis().eval(SAVE, [activityViewsKey(owner)], [expected ?? '', serialized, RETENTION, MAX_BYTES]);
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result !== 'ok') throw unavailable();
  return record;
}
export async function mutateActivityViews(owner: string, raw: ActivityInput) {
  const input = activityInputSchema.safeParse(raw);
  if (!input.success) throw new AppError('Check the saved view settings.', 400, 'INVALID_ACTIVITY_VIEW', true);
  const change = input.data;
  const current = await readActivityViews(owner);
  if (current.revision !== change.revision) throw conflict();
  let views = [...current.views];
  if (change.action === 'save') {
    if (change.view.planning) {
      const plan = change.view.planning;
      if (!(await readPersonalTasks(owner)).tasks.some((t) => t.id === plan.id && t.kind === plan.kind))
        throw new AppError(
          'That project or goal is no longer in your task list. Review the planning context.',
          409,
          'ACTIVITY_PLAN_MISSING',
          true,
        );
    }
    const exists = views.some((v) => v.id === change.view.id);
    views = exists ? views.map((v) => (v.id === change.view.id ? change.view : v)) : [...views, change.view];
  } else {
    if (!views.some((v) => v.id === change.id))
      throw new AppError('That saved view is no longer available.', 404, 'ACTIVITY_VIEW_MISSING', true);
    views = views.filter((v) => v.id !== change.id);
  }
  const next = activityRecordSchema.safeParse({ schemaVersion: 1, revision: randomUUID(), views });
  if (!next.success)
    throw new AppError('Keep at most twelve views with unique names.', 400, 'INVALID_ACTIVITY_VIEW', true);
  return write(owner, current.revision, next.data);
}
export async function eraseActivityViews(owner: string, expected: string | null) {
  const current = await readActivityViews(owner);
  if (current.revision !== expected) throw conflict();
  return write(owner, expected, { ...emptyActivities(), revision: randomUUID() });
}
