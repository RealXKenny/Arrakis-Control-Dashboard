import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  UPKEEP_LIMITS,
  emptyUpkeep,
  upkeepRecordSchema,
  type BlueprintRevision,
  type UpkeepAction,
  type UpkeepRecord,
} from '../model';

const RETENTION = 90 * 86400;
const READ = `-- base-upkeep-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const SAVE = `-- base-upkeep-save-v1
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
  new AppError('Base upkeep plans are unavailable. Reload before making changes.', 503, 'UPKEEP_UNAVAILABLE', true);
const conflict = () =>
  new AppError('Base upkeep plans changed in another tab. Reload before trying again.', 409, 'UPKEEP_CONFLICT', true);
const full = (what: string) => new AppError(`${what} Remove an older entry first.`, 409, 'UPKEEP_FULL', true);
const missing = (what: string) => new AppError(`${what} is no longer in your plans.`, 404, 'UPKEEP_NOT_FOUND', true);

export interface UpkeepOwner {
  userId: string;
  controller: string;
  player: string;
}

/** Plans belong to one account and one linked character; raw identifiers never appear in key names. */
export function upkeepKey(owner: UpkeepOwner): string {
  if (
    !owner.userId ||
    owner.userId.length > 128 ||
    !/^[1-9][0-9]{0,15}$/.test(owner.controller) ||
    !/^[1-9][0-9]{0,15}$/.test(owner.player)
  )
    throw unavailable();
  return `arrakis:base-upkeep:v1:${createHash('sha256').update(`${owner.userId}\0${owner.controller}\0${owner.player}`).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}

export async function readUpkeep(owner: UpkeepOwner): Promise<UpkeepRecord> {
  try {
    const value = await redis().eval(READ, [upkeepKey(owner)], [UPKEEP_LIMITS.recordBytes, RETENTION]);
    if (value === '') return emptyUpkeep();
    if (typeof value !== 'string' || Buffer.byteLength(value) > UPKEEP_LIMITS.recordBytes) throw unavailable();
    const record = upkeepRecordSchema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}

/** Pure application of one action. Timestamps are server-owned; callers verify base access beforehand. */
export function applyUpkeepAction(
  old: UpkeepRecord,
  action: UpkeepAction | { action: 'blueprint-add'; blueprint: BlueprintRevision },
  now: string,
): UpkeepRecord {
  const next: UpkeepRecord = structuredClone(old);
  switch (action.action) {
    case 'base': {
      const existing = next.bases.find((base) => base.baseId === action.base.baseId);
      if (!existing && next.bases.length >= UPKEEP_LIMITS.bases) throw full('You can plan upkeep for 20 bases.');
      const saved = { ...action.base, inspections: existing?.inspections ?? [], updatedAt: now };
      next.bases = existing
        ? next.bases.map((base) => (base.baseId === saved.baseId ? saved : base))
        : [...next.bases, saved];
      break;
    }
    case 'base-remove':
      if (!next.bases.some((base) => base.baseId === action.baseId)) throw missing('That base plan');
      next.bases = next.bases.filter((base) => base.baseId !== action.baseId);
      break;
    case 'inspect': {
      const base = next.bases.find((entry) => entry.baseId === action.baseId);
      const checklist = base?.checklist.length ? base.checklist : null;
      const allowed = new Set((checklist ?? []).map((item) => item.id));
      if (!base)
        throw new AppError('Save base upkeep settings before recording an inspection.', 409, 'UPKEEP_NO_BASE', true);
      if (
        !checklist ||
        action.results.some((result) => !allowed.has(result.itemId)) ||
        new Set(action.results.map((result) => result.itemId)).size !== action.results.length
      )
        throw new AppError(
          'The checklist changed. Reload before recording this inspection.',
          409,
          'UPKEEP_CONFLICT',
          true,
        );
      base.inspections = [...base.inspections, { at: now, results: action.results }].slice(-UPKEEP_LIMITS.inspections);
      base.updatedAt = now;
      break;
    }
    case 'container': {
      const key = `${action.label.baseId}:${action.label.containerId}`;
      const existing = next.containers.findIndex((entry) => `${entry.baseId}:${entry.containerId}` === key);
      if (existing < 0 && next.containers.length >= UPKEEP_LIMITS.containers)
        throw full('You can label 160 containers.');
      if (existing >= 0) next.containers[existing] = action.label;
      else next.containers.push(action.label);
      break;
    }
    case 'container-remove': {
      const before = next.containers.length;
      next.containers = next.containers.filter(
        (entry) => !(entry.baseId === action.baseId && entry.containerId === action.containerId),
      );
      if (next.containers.length === before) throw missing('That container label');
      break;
    }
    case 'reminder': {
      const existing = next.reminders.find((entry) => entry.id === action.reminder.id);
      if (!existing && next.reminders.length >= UPKEEP_LIMITS.reminders) throw full('You can keep 40 reminders.');
      const saved = {
        ...action.reminder,
        completions: existing?.completions ?? [],
        createdAt: existing?.createdAt ?? now,
      };
      next.reminders = existing
        ? next.reminders.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...next.reminders, saved];
      break;
    }
    case 'reminder-complete': {
      const reminder = next.reminders.find((entry) => entry.id === action.id);
      if (!reminder) throw missing('That reminder');
      reminder.completions = [...reminder.completions, now].slice(-UPKEEP_LIMITS.completions);
      break;
    }
    case 'reminder-remove':
      if (!next.reminders.some((entry) => entry.id === action.id)) throw missing('That reminder');
      next.reminders = next.reminders.filter((entry) => entry.id !== action.id);
      break;
    case 'blueprint-add':
      if (next.blueprints.some((entry) => entry.id === action.blueprint.id))
        throw new AppError('That revision already exists.', 409, 'UPKEEP_CONFLICT', true);
      if (next.blueprints.length >= UPKEEP_LIMITS.blueprints) throw full('You can keep 24 blueprint revisions.');
      next.blueprints.push(action.blueprint);
      break;
    case 'blueprint-meta': {
      const entry = next.blueprints.find((value) => value.id === action.blueprint.id);
      if (!entry) throw missing('That blueprint revision');
      Object.assign(entry, action.blueprint);
      break;
    }
    case 'blueprint-remove':
      if (!next.blueprints.some((entry) => entry.id === action.id)) throw missing('That blueprint revision');
      next.blueprints = next.blueprints.filter((entry) => entry.id !== action.id);
      break;
    case 'relocation': {
      const existing = next.relocations.find((entry) => entry.id === action.relocation.id);
      if (!existing && next.relocations.length >= UPKEEP_LIMITS.relocations)
        throw full('You can keep 5 relocation plans.');
      const saved = { ...action.relocation, updatedAt: now };
      next.relocations = existing
        ? next.relocations.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...next.relocations, saved];
      break;
    }
    case 'relocation-remove':
      if (!next.relocations.some((entry) => entry.id === action.id)) throw missing('That relocation plan');
      next.relocations = next.relocations.filter((entry) => entry.id !== action.id);
      break;
  }
  return next;
}

export type StoredUpkeepAction = Parameters<typeof applyUpkeepAction>[1];

export async function mutateUpkeep(
  owner: UpkeepOwner,
  expected: string | null,
  action: StoredUpkeepAction,
): Promise<UpkeepRecord> {
  const old = await readUpkeep(owner);
  if (old.revision !== expected) throw conflict();
  const applied = applyUpkeepAction(old, action, new Date().toISOString());
  const parsed = upkeepRecordSchema.safeParse({ ...applied, revision: randomUUID() });
  if (!parsed.success) throw new AppError('Check the upkeep details and limits.', 400, 'INVALID_UPKEEP', true);
  const serialized = JSON.stringify(parsed.data);
  if (Buffer.byteLength(serialized) > UPKEEP_LIMITS.recordBytes)
    throw new AppError(
      'Your upkeep plans exceed the storage limit. Remove older entries.',
      400,
      'UPKEEP_TOO_LARGE',
      true,
    );
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [upkeepKey(owner)],
      [expected ?? '', serialized, RETENTION, UPKEEP_LIMITS.recordBytes],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return parsed.data;
}
