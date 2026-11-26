import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  PROGRESSION_LIMITS,
  emptyPlanner,
  plannerInputSchema,
  plannerRecordSchema,
  saveActionCollection,
  type PlannerInput,
  type PlannerRecord,
} from '../model';
import { appendSnapshot, emptyJournal, journalRecordSchema, recordingDue, type JournalRecord } from '../journal';
import type { Snapshot } from '../reading';

const PLANNER_BYTES = 262144;
const JOURNAL_BYTES = 196608;
const RETENTION = 90 * 86400;
const READ = `-- progression-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value == '' then return false end
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const SAVE = `-- progression-save-v1
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
  new AppError(
    'Progression planner storage is unavailable. Reload before making changes.',
    503,
    'PROGRESSION_UNAVAILABLE',
    true,
  );
const conflict = () =>
  new AppError(
    'Your progression planner changed in another tab. Reload before trying again. Your draft is kept.',
    409,
    'PROGRESSION_CONFLICT',
    true,
  );
const full = (what: string) =>
  new AppError(`Your ${what} list is full. Remove an old entry before adding another.`, 409, 'PROGRESSION_FULL', true);

/** Keys bind the dashboard account to one exact linked character; a new character starts with an empty planner. */
export function progressionKey(kind: 'planner' | 'journal', owner: string, character: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner) || !/^[1-9][0-9]{0,19}$/.test(character)) throw unavailable();
  return `arrakis:progression-${kind}:v1:${createHash('sha256').update(`${owner}\0${character}`).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
async function readJson<T>(key: string, schema: z.ZodType<T>, empty: T, maxBytes: number): Promise<T> {
  try {
    const value = await redis().eval(READ, [key], [maxBytes, RETENTION]);
    if (value === '') return empty;
    if (typeof value !== 'string' || Buffer.byteLength(value) > maxBytes) throw unavailable();
    const parsed = schema.parse(JSON.parse(value));
    if (!(parsed as { revision: string | null }).revision) throw unavailable();
    return parsed;
  } catch {
    throw unavailable();
  }
}
async function writeJson(key: string, expected: string | null, next: unknown, maxBytes: number, what: string) {
  const serialized = JSON.stringify(next);
  if (Buffer.byteLength(serialized) > maxBytes)
    throw new AppError(
      `Your ${what} exceeds the storage limit. Shorten or remove older entries.`,
      400,
      'PROGRESSION_TOO_LARGE',
      true,
    );
  let reply: unknown;
  try {
    reply = await redis().eval(SAVE, [key], [expected ?? '', serialized, RETENTION, maxBytes]);
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
}

export function readPlanner(owner: string, character: string): Promise<PlannerRecord> {
  return readJson(progressionKey('planner', owner, character), plannerRecordSchema, emptyPlanner(), PLANNER_BYTES);
}
export function readJournal(owner: string, character: string): Promise<JournalRecord> {
  return readJson(progressionKey('journal', owner, character), journalRecordSchema, emptyJournal(), JOURNAL_BYTES);
}

const limits = {
  goals: [PROGRESSION_LIMITS.goals, 'goal'],
  research: [PROGRESSION_LIMITS.research, 'research'],
  builds: [PROGRESSION_LIMITS.builds, 'skill build'],
  recipes: [PROGRESSION_LIMITS.recipes, 'recipe'],
  journeyPins: [PROGRESSION_LIMITS.journeyPins, 'pinned objective'],
  checklist: [PROGRESSION_LIMITS.checklist, 'checklist'],
  notes: [PROGRESSION_LIMITS.notes, 'notebook'],
} as const;

/** Applies one validated change under UUID compare-and-set. Server-owned timestamps; no automatic retries. */
export async function mutatePlanner(owner: string, character: string, raw: PlannerInput): Promise<PlannerRecord> {
  const checked = plannerInputSchema.safeParse(raw);
  if (!checked.success) throw new AppError('Check the planner fields.', 400, 'INVALID_PROGRESSION', true);
  const input = checked.data;
  const old = await readPlanner(owner, character);
  if (old.revision !== input.revision) throw conflict();
  const now = new Date().toISOString();
  const next: PlannerRecord = structuredClone(old);
  if (input.action === 'set-tracking') {
    next.tracking = {
      enabled: input.enabled,
      startedAt: input.enabled ? (old.tracking.startedAt ?? now) : old.tracking.startedAt,
    };
  } else if (input.action === 'delete') {
    const list = next[input.collection] as { id: string }[];
    if (!list.some((entry) => entry.id === input.id))
      throw new AppError('That entry is no longer in your planner.', 404, 'PROGRESSION_NOT_FOUND', true);
    (next[input.collection] as { id: string }[]) = list.filter((entry) => entry.id !== input.id);
  } else {
    const collection = saveActionCollection[input.action];
    const list = next[collection] as { id: string; createdAt: string }[];
    const existing = list.find((entry) => entry.id === input.item.id);
    const [max, what] = limits[collection];
    if (!existing && list.length >= max) throw full(what);
    const saved = { ...input.item, createdAt: existing?.createdAt ?? now, updatedAt: now };
    (next[collection] as { id: string }[]) = existing
      ? list.map((entry) => (entry.id === saved.id ? saved : entry))
      : [...list, saved];
    if (collection === 'goals' && next.goals.filter((goal) => goal.pinned).length > PROGRESSION_LIMITS.pinnedGoals)
      throw new AppError(
        `Pin up to ${PROGRESSION_LIMITS.pinnedGoals} goals to the portal. Unpin another goal first.`,
        409,
        'PROGRESSION_PIN_LIMIT',
        true,
      );
  }
  next.revision = randomUUID();
  const parsed = plannerRecordSchema.safeParse(next);
  if (!parsed.success)
    throw new AppError(
      'That change would make your planner invalid. Each journey objective can be pinned once.',
      409,
      'INVALID_PROGRESSION',
      true,
    );
  await writeJson(progressionKey('planner', owner, character), input.revision, parsed.data, PLANNER_BYTES, 'planner');
  return parsed.data;
}

/**
 * Records one bounded observation when tracking is on and the interval has passed. Returns the journal and whether
 * an observation was added. A conflicting concurrent recorder wins; this call reports the stored state instead.
 */
export async function recordSnapshot(
  owner: string,
  character: string,
  expected: string | null,
  snapshot: Snapshot,
  manual: boolean,
): Promise<{ journal: JournalRecord; recorded: boolean }> {
  const current = await readJournal(owner, character);
  if (current.revision !== expected) throw conflict();
  if (!recordingDue(current, Date.parse(snapshot.at), manual)) return { journal: current, recorded: false };
  const appended = appendSnapshot(current, snapshot);
  if (appended === current) return { journal: current, recorded: false };
  const next = journalRecordSchema.parse({ ...appended, revision: randomUUID() });
  await writeJson(progressionKey('journal', owner, character), expected, next, JOURNAL_BYTES, 'progression journal');
  return { journal: next, recorded: true };
}
/** Clears observations but keeps a fresh revision fence against tabs that still hold the old journal. */
export async function clearJournal(owner: string, character: string, expected: string | null): Promise<JournalRecord> {
  const current = await readJournal(owner, character);
  if (current.revision !== expected) throw conflict();
  const next = { ...emptyJournal(), revision: randomUUID() };
  await writeJson(progressionKey('journal', owner, character), expected, next, JOURNAL_BYTES, 'progression journal');
  return next;
}
