import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { emptyTasks, taskInputSchema, taskRecordSchema, type TaskInput, type TaskRecord } from '../model';
const MAX_BYTES = 262144;
const RETENTION = 90 * 86400;
const READ = `-- personal-tasks-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value == '' then return false end
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const SAVE = `-- personal-tasks-save-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
 local ok, value = pcall(cjson.decode, old)
 if not ok or type(value) ~= 'table' then return 'invalid' end
 if value.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'`;
const unavailable = () =>
  new AppError('Personal tasks are unavailable. Reload before making changes.', 503, 'TASKS_UNAVAILABLE', true);
const conflict = () =>
  new AppError(
    'Personal tasks changed in another tab. Reload before trying again. Your draft is kept.',
    409,
    'TASKS_CONFLICT',
    true,
  );
export function personalTasksKey(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  return `arrakis:personal-tasks:v1:${createHash('sha256').update(owner).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
export async function readPersonalTasks(owner: string): Promise<TaskRecord> {
  try {
    const value = await redis().eval(READ, [personalTasksKey(owner)], [MAX_BYTES, RETENTION]);
    if (value === '') return emptyTasks();
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
    const record = taskRecordSchema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}
export async function mutatePersonalTasks(owner: string, raw: TaskInput): Promise<TaskRecord> {
  const checked = taskInputSchema.safeParse(raw);
  if (!checked.success) throw new AppError('Check the task fields and target.', 400, 'INVALID_TASK', true);
  const input = checked.data;
  const old = await readPersonalTasks(owner);
  if (old.revision !== input.revision) throw conflict();
  const now = new Date().toISOString();
  let tasks = [...old.tasks];
  if (input.action === 'save') {
    const existing = tasks.find((t) => t.id === input.task.id);
    if (!existing && tasks.length >= 100)
      throw new AppError('Your task list is full. Delete an old entry before adding another.', 409, 'TASKS_FULL', true);
    const saved = {
      ...input.task,
      status: existing?.status ?? ('open' as const),
      createdAt: existing?.createdAt ?? now,
      completedAt: existing?.completedAt ?? null,
      updatedAt: now,
    };
    tasks = existing ? tasks.map((t) => (t.id === saved.id ? saved : t)) : [...tasks, saved];
  } else {
    if (!tasks.some((t) => t.id === input.id))
      throw new AppError('That task is no longer in your list.', 404, 'TASK_NOT_FOUND', true);
    if (input.action === 'delete') {
      if (
        tasks.some((t) => ['project', 'goal'].includes(t.target.type) && 'ref' in t.target && t.target.ref === input.id)
      )
        throw new AppError(
          'Other tasks link to this planning entry. Edit their links before deleting it.',
          409,
          'TASK_LINKED',
          true,
        );
      tasks = tasks.filter((t) => t.id !== input.id);
    } else
      tasks = tasks.map((t) =>
        t.id === input.id
          ? {
              ...t,
              status: input.status,
              completedAt: input.status === 'completed' ? (t.completedAt ?? now) : null,
              updatedAt: now,
            }
          : t,
      );
  }
  const next = taskRecordSchema.safeParse({ ...old, revision: randomUUID(), tasks });
  if (!next.success)
    throw new AppError(
      'Choose a project or goal from your own list. Linked planning entries cannot change kind until their links are removed.',
      409,
      'INVALID_TASK_LINK',
      true,
    );
  const serialized = JSON.stringify(next.data);
  if (Buffer.byteLength(serialized) > MAX_BYTES)
    throw new AppError(
      'Your task notes exceed the storage limit. Shorten or remove older notes.',
      400,
      'TASKS_TOO_LARGE',
      true,
    );
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [personalTasksKey(owner)],
      [input.revision ?? '', serialized, RETENTION, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return next.data;
}
