import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import {
  GUILD_BASE_LIMIT,
  directoryGuildIdSchema,
  baseDirectoryInputSchema,
  guildBaseEntrySchema,
  type BaseDirectoryInput,
  type GuildBaseEntry,
} from '../base-directory';

const MAX_BYTES = 32_768;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-base-directory-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `
-- guild-base-directory-save
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local ok, entry = pcall(cjson.decode, old)
  if not ok or type(entry) ~= 'table' then return 'invalid' end
  if entry.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict'
elseif redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1])
else redis.call('EXPIRE', KEYS[1], ARGV[6]) end
return 'ok'
`;
const unavailable = () =>
  new AppError(
    'The guild base directory is unavailable. Refresh before trying again.',
    503,
    'BASE_DIRECTORY_UNAVAILABLE',
    true,
  );
const conflict = () =>
  new AppError(
    'This listing changed. Refresh before saving again. Your draft is kept.',
    409,
    'BASE_DIRECTORY_CONFLICT',
    true,
  );
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
export async function readBaseDirectory(guildId: string): Promise<GuildBaseEntry[]> {
  directoryGuildIdSchema.parse(guildId);
  try {
    const values = await storage().eval(READ, [guildKeys.baseDirectory(guildId)], [GUILD_BASE_LIMIT, MAX_BYTES]);
    if (!Array.isArray(values) || values.length % 2 || values.length > GUILD_BASE_LIMIT * 2) throw unavailable();
    const entries: GuildBaseEntry[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index + 1] !== 'string' || values[index + 1].length > MAX_BYTES) throw unavailable();
      const entry = guildBaseEntrySchema.parse(JSON.parse(values[index + 1]));
      if (entry.id !== values[index]) throw unavailable();
      entries.push(entry);
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  } catch {
    throw unavailable();
  }
}
export async function mutateBaseDirectory(
  guildId: string,
  input: BaseDirectoryInput,
  actor: { canEdit: boolean; authorName: string },
) {
  if (!actor.canEdit)
    throw new AppError('Only the guild leader can manage the base directory.', 403, 'GUILD_LEADER_REQUIRED', true);
  const change = baseDirectoryInputSchema.parse(input);
  const entries = await readBaseDirectory(guildId);
  const id = change.action === 'save' ? change.entry.id : change.id;
  const current = entries.find((entry) => entry.id === id);
  if ((current?.revision ?? null) !== change.revision) throw conflict();
  const now = new Date().toISOString();
  let entry: GuildBaseEntry;
  if (change.action === 'save')
    entry = {
      ...change.entry,
      revision: randomUUID(),
      status: current?.status ?? 'active',
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      updatedByName: actor.authorName,
    };
  else {
    if (!current) throw conflict();
    entry = {
      ...current,
      revision: randomUUID(),
      updatedAt: now,
      updatedByName: actor.authorName,
      ...(change.action === 'status' ? { status: change.status } : {}),
    };
  }
  const encoded = JSON.stringify(guildBaseEntrySchema.parse(entry));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('This directory entry is too large.', 413, 'BASE_DIRECTORY_ENTRY_TOO_LARGE', true);
  // Dev note: updating a map note should not accidentally bulldoze another leader's directions.
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [guildKeys.baseDirectory(guildId)],
      [id, change.revision ?? '', encoded, change.action, GUILD_BASE_LIMIT, RETENTION],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'full')
    throw new AppError(
      'Keep at most 50 directory listings. Remove an older listing first.',
      409,
      'BASE_DIRECTORY_FULL',
      true,
    );
  if (result !== 'ok') throw unavailable();
  return change.action === 'delete' ? null : entry;
}
