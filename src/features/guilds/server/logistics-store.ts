import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import { operationGuildIdSchema } from '../operations';

export type LogisticsSection = 'templates' | 'availability' | 'fleet' | 'landsraad';
export const LOGISTICS_MAX_BYTES: Record<LogisticsSection, number> = {
  templates: 262_144,
  availability: 262_144,
  fleet: 131_072,
  landsraad: 65_536,
};
const RETENTION = 90 * 86_400;
const READ = `
-- guild-logistics-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
return redis.call('GET', KEYS[1])
`;
const SAVE = `
-- guild-logistics-save
local old = redis.call('GET', KEYS[1])
local revision = ''
if old then
  local ok, document = pcall(cjson.decode, old)
  if not ok or type(document) ~= 'table' or type(document.revision) ~= 'string' then return 'invalid' end
  revision = document.revision
end
if revision ~= ARGV[1] then return 'conflict' end
if ARGV[2] == '' then redis.call('DEL', KEYS[1])
else redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3])) end
return 'ok'
`;

export const logisticsUnavailable = () =>
  new AppError(
    'Guild logistics storage is unavailable. Refresh before trying again.',
    503,
    'LOGISTICS_UNAVAILABLE',
    true,
  );
export const logisticsConflict = () =>
  new AppError('This plan changed. Refresh before trying again. Your draft is kept.', 409, 'LOGISTICS_CONFLICT', true);

function storage() {
  const redis = getRedisClient();
  if (!redis) throw logisticsUnavailable();
  return redis;
}

/** One bounded JSON document per guild section; corrupt or oversized data fails closed instead of resetting. */
export async function readLogistics<T extends { revision: string }>(
  guildId: string,
  section: LogisticsSection,
  schema: z.ZodType<T>,
): Promise<T | null> {
  operationGuildIdSchema.parse(guildId);
  let raw: unknown;
  try {
    raw = await storage().eval(READ, [guildKeys.logistics(guildId, section)], [LOGISTICS_MAX_BYTES[section]]);
  } catch {
    throw logisticsUnavailable();
  }
  if (raw === null) return null;
  if (typeof raw !== 'string') throw logisticsUnavailable();
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw logisticsUnavailable();
  }
}

/** Compare-and-set write. `next === null` deletes the document. Returns the new revision. */
export async function writeLogistics<T extends { revision: string }>(
  guildId: string,
  section: LogisticsSection,
  schema: z.ZodType<T>,
  expected: string | null,
  next: Omit<T, 'revision'> | null,
): Promise<string | null> {
  operationGuildIdSchema.parse(guildId);
  const revision = next ? randomUUID() : null;
  const encoded = next ? JSON.stringify(schema.parse({ ...next, revision })) : '';
  if (Buffer.byteLength(encoded) > LOGISTICS_MAX_BYTES[section])
    throw new AppError('This plan has reached its storage limit.', 409, 'LOGISTICS_FULL', true);
  let result: unknown;
  try {
    result = await storage().eval(SAVE, [guildKeys.logistics(guildId, section)], [expected ?? '', encoded, RETENTION]);
  } catch {
    throw logisticsUnavailable();
  }
  if (result === 'conflict') throw logisticsConflict();
  if (result !== 'ok') throw logisticsUnavailable();
  return revision;
}

/**
 * Read-modify-write for changes scoped to the caller's own entry (availability, self-claims). Retrying
 * on a revision conflict is safe because the mutator is re-run against the fresh document and only
 * touches the caller's own record; it never repeats a game action.
 */
export async function updateOwnLogistics<T extends { revision: string }>(
  guildId: string,
  section: LogisticsSection,
  schema: z.ZodType<T>,
  mutate: (current: T | null) => Omit<T, 'revision'> | null,
  attempts = 3,
): Promise<{ revision: string | null; value: Omit<T, 'revision'> | null }> {
  for (let attempt = 1; ; attempt += 1) {
    const current = await readLogistics(guildId, section, schema);
    const value = mutate(current);
    try {
      return { revision: await writeLogistics(guildId, section, schema, current?.revision ?? null, value), value };
    } catch (error) {
      if (attempt >= attempts || !(error instanceof AppError) || error.code !== 'LOGISTICS_CONFLICT') throw error;
    }
  }
}
