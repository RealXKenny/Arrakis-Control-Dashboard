import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import {
  applyProjectChange,
  emptyProjectsBook,
  guildProjectsBookSchema,
  projectGuildIdSchema,
  ProjectRuleError,
  type GuildProjectsBook,
  type InternalProjectChange,
  type ProjectActor,
  type ProjectContext,
  type ProjectInput,
} from '../projects';

const MAX_BYTES = 524_288;
const RETENTION = 90 * 86_400;
const ATTEMPTS = 3;
const READ = `
-- guild-projects-read
if redis.call('HSTRLEN', KEYS[1], 'book') > tonumber(ARGV[1]) then return false end
local values = redis.call('HMGET', KEYS[1], 'revision', 'book')
return { values[1] or '', values[2] or '' }
`;
const SAVE = `
-- guild-projects-save
local current = redis.call('HGET', KEYS[1], 'revision') or ''
if current ~= ARGV[1] then return 'conflict' end
redis.call('HSET', KEYS[1], 'revision', ARGV[2], 'book', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 'ok'
`;
const unavailable = () =>
  new AppError('Guild projects are unavailable. Refresh before trying again.', 503, 'PROJECTS_UNAVAILABLE', true);
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}

type Snapshot = { storeRevision: string; book: GuildProjectsBook };

export async function readProjectsSnapshot(guildId: string): Promise<Snapshot> {
  projectGuildIdSchema.parse(guildId);
  try {
    const raw = await storage().eval(READ, [guildKeys.projects(guildId)], [MAX_BYTES]);
    if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== 'string' || typeof raw[1] !== 'string')
      throw unavailable();
    const [storeRevision, encoded] = raw as [string, string];
    if (!encoded) {
      if (storeRevision) throw unavailable();
      return { storeRevision: '', book: emptyProjectsBook(guildId) };
    }
    if (Buffer.byteLength(encoded) > MAX_BYTES) throw unavailable();
    const book = guildProjectsBookSchema.parse(JSON.parse(encoded));
    if (book.guildId !== guildId) throw unavailable();
    return { storeRevision, book };
  } catch {
    throw unavailable();
  }
}

export async function readProjects(guildId: string) {
  return (await readProjectsSnapshot(guildId)).book;
}

function apply(
  book: GuildProjectsBook,
  change: ProjectInput | InternalProjectChange,
  actor: ProjectActor,
  context: Omit<ProjectContext, 'now' | 'newId'>,
) {
  try {
    return applyProjectChange(book, change, actor, { ...context, now: new Date().toISOString(), newId: randomUUID });
  } catch (error) {
    if (error instanceof ProjectRuleError) throw new AppError(error.message, error.status, error.code, true);
    throw unavailable();
  }
}

/** Runs the permission and revision rules against current state without writing anything. */
export async function checkProjectChange(guildId: string, change: ProjectInput, actor: ProjectActor) {
  const book = await readProjects(guildId);
  apply(book, change, actor, {});
  return book;
}

/**
 * Entity revisions are checked inside `applyProjectChange`, so a storage-level miss caused by an unrelated
 * edit (another project, someone's stockpile entry) is re-applied against the fresh book a bounded number
 * of times. A real conflict on the same record still fails with PROJECT_CONFLICT.
 */
export async function mutateProjects(
  guildId: string,
  change: ProjectInput | InternalProjectChange,
  actor: ProjectActor,
  context: Omit<ProjectContext, 'now' | 'newId'> = {},
) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const snapshot = await readProjectsSnapshot(guildId);
    const result = apply(snapshot.book, change, actor, context);
    const checked = guildProjectsBookSchema.safeParse(result.book);
    if (!checked.success)
      throw new AppError(
        'That change would leave the project plan inconsistent. Refresh and try again.',
        409,
        'PROJECT_INVALID_STATE',
        true,
      );
    const encoded = JSON.stringify(checked.data);
    if (Buffer.byteLength(encoded) > MAX_BYTES)
      throw new AppError(
        'Guild projects have reached their storage limit. Remove finished records first.',
        409,
        'PROJECTS_STORAGE_FULL',
        true,
      );
    let saved: unknown;
    try {
      saved = await storage().eval(
        SAVE,
        [guildKeys.projects(guildId)],
        [snapshot.storeRevision, randomUUID(), encoded, RETENTION],
      );
    } catch {
      // Uncertain outcome: never re-send. The client refreshes and sees whatever was stored.
      throw unavailable();
    }
    if (saved === 'ok') return { book: checked.data, changedId: result.changedId };
    if (saved !== 'conflict') throw unavailable();
  }
  throw new AppError(
    'Guild projects are busy. Refresh before trying again. Your draft is kept.',
    409,
    'PROJECT_CONFLICT',
    true,
  );
}
