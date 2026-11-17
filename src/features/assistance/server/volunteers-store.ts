import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { assistanceKeys } from '../../../lib/redis/keys';
import { helpVolunteerSchema, volunteerInputSchema, type HelpVolunteer } from '../model';

const VOLUNTEER_LIMIT = 500;
const RETENTION_SECONDS = 90 * 86_400;
const READ = `-- assistance-volunteers-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, owner in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], owner) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `-- assistance-volunteer-save
local current = redis.call('HGET', KEYS[1], ARGV[1])
if current then
  local ok, old = pcall(cjson.decode, current)
  if not ok or type(old) ~= 'table' then return 'invalid' end
  if (old.revision or '') ~= ARGV[2] then return 'conflict' end
  if old.activeRequestId and old.activeRequestId ~= cjson.null and ARGV[4] == 'true' then return 'active' end
elseif ARGV[2] ~= '' then return 'conflict'
elseif redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return 'ok'
`;

function unavailable() {
  return new AppError('Volunteer availability is temporarily unavailable.', 503, 'VOLUNTEERS_UNAVAILABLE', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
function parseVolunteer(owner: string, value: unknown): HelpVolunteer {
  if (typeof value !== 'string') throw unavailable();
  try {
    const parsed = helpVolunteerSchema.parse(JSON.parse(value));
    if (parsed.owner !== owner) throw new Error('Owner mismatch');
    return parsed;
  } catch {
    throw unavailable();
  }
}

function emptyVolunteer(owner: string): HelpVolunteer {
  return {
    owner,
    displayName: 'Community member',
    available: false,
    categories: [],
    note: '',
    activeRequestId: null,
    revision: null,
    updatedAt: null,
  };
}

export async function readVolunteer(owner: string): Promise<HelpVolunteer> {
  try {
    const values = await storage().eval(READ, [assistanceKeys.volunteers], [VOLUNTEER_LIMIT, 4096, RETENTION_SECONDS]);
    if (!Array.isArray(values) || values.length % 2 || values.length > VOLUNTEER_LIMIT * 2) throw unavailable();
    for (let index = 0; index < values.length; index += 2)
      if (values[index] === owner) return parseVolunteer(owner, values[index + 1]);
    return emptyVolunteer(owner);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}

export async function saveVolunteer(input: unknown, owner: string, displayName: string): Promise<HelpVolunteer> {
  const parsed = volunteerInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('Choose valid availability and help categories.', 400, 'INVALID_VOLUNTEER', true);
  const existing = await readVolunteer(owner);
  if ((existing.revision ?? null) !== parsed.data.revision)
    throw new AppError('Availability changed. Refresh before saving.', 409, 'VOLUNTEER_CONFLICT', true);
  const next = helpVolunteerSchema.parse({
    owner,
    displayName,
    available: parsed.data.available,
    categories: [...new Set(parsed.data.categories)],
    note: parsed.data.note,
    activeRequestId: existing.activeRequestId,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  });
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [assistanceKeys.volunteers],
      [
        owner,
        parsed.data.revision ?? '',
        JSON.stringify(next),
        String(!parsed.data.available),
        VOLUNTEER_LIMIT,
        RETENTION_SECONDS,
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict')
    throw new AppError('Availability changed. Refresh before saving.', 409, 'VOLUNTEER_CONFLICT', true);
  if (result === 'active')
    throw new AppError(
      'Finish or leave your active assignment before becoming unavailable.',
      409,
      'VOLUNTEER_ACTIVE',
      true,
    );
  if (result === 'full') throw new AppError('The volunteer directory is full.', 409, 'VOLUNTEERS_FULL', true);
  if (result !== 'ok') throw unavailable();
  return next;
}
