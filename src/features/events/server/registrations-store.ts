import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { communityEventKeys } from '../../../lib/redis/keys';
import type { CommunityEvent } from '../contracts';
import {
  EVENT_ATTENDEE_LIMIT,
  EVENT_WAITLIST_LIMIT,
  eventRegistrationEntrySchema,
  eventRegistrationInputSchema,
  eventRegistrationSummary,
  type EventRegistrationInput,
  type EventRegistrationRecord,
} from '../registrations';

const RETENTION_SECONDS = 90 * 86_400;
const MAX_FIELDS = EVENT_ATTENDEE_LIMIT + EVENT_WAITLIST_LIMIT + 1;
const MAX_FIELD_BYTES = 512;
const ownerSchema = eventRegistrationInputSchema.shape.revision;
const READ = `-- event-registration-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, field in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], field) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const MUTATE = `-- event-registration-mutate
local owner = ARGV[1]
local expected = ARGV[2]
local action = ARGV[3]
local eventId = ARGV[9]
local current = redis.call('HGET', KEYS[1], '__revision') or ''
if current ~= expected then return 'conflict' end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local eventOpen = false
local rawEvent = redis.call('HGET', KEYS[2], eventId)
if rawEvent then
  local ok, event = pcall(cjson.decode, rawEvent)
  if ok and type(event) == 'table' and event.startsAt == ARGV[10] then
    eventOpen = event.visibility == 'published' and (event.status == 'upcoming' or event.status == 'open')
      and now < tonumber(ARGV[11]) and now < tonumber(ARGV[12])
  end
end
if action == 'register' and not eventOpen then return 'closed' end
local existingRaw = redis.call('HGET', KEYS[1], owner)
local existing = nil
if existingRaw then
  local ok, value = pcall(cjson.decode, existingRaw)
  if not ok or type(value) ~= 'table' then return 'invalid' end
  existing = value
end
local fields = redis.call('HKEYS', KEYS[1])
if #fields > tonumber(ARGV[13]) then return 'invalid' end
if action == 'register' and existing then return redis.call('HGETALL', KEYS[1]) end
if action == 'cancel' and not existing then return redis.call('HGETALL', KEYS[1]) end
if action == 'register' then
  local registered = 0
  local waiting = 0
  for _, field in ipairs(fields) do
    if field ~= '__revision' then
      local raw = redis.call('HGET', KEYS[1], field)
      local ok, entry = pcall(cjson.decode, raw)
      if not ok or type(entry) ~= 'table' then return 'invalid' end
      if entry.status == 'registered' then registered = registered + 1
      elseif entry.status == 'waiting' then waiting = waiting + 1
      else return 'invalid' end
    end
  end
  local status = 'registered'
  if registered >= tonumber(ARGV[7]) then
    if waiting >= tonumber(ARGV[8]) then return 'full' end
    status = 'waiting'
  end
  redis.call('HSET', KEYS[1], owner, cjson.encode({ status = status, joinedAt = ARGV[6] }))
else
  redis.call('HDEL', KEYS[1], owner)
  if existing.status == 'registered' and eventOpen then
    local candidateOwner = nil
    local candidate = nil
    for _, field in ipairs(fields) do
      if field ~= '__revision' and field ~= owner then
        local raw = redis.call('HGET', KEYS[1], field)
        local ok, entry = pcall(cjson.decode, raw)
        if not ok or type(entry) ~= 'table' then return 'invalid' end
        if entry.status == 'waiting' and (not candidate or entry.joinedAt < candidate.joinedAt
          or (entry.joinedAt == candidate.joinedAt and field < candidateOwner)) then
          candidateOwner = field
          candidate = entry
        end
      end
    end
    if candidateOwner then
      redis.call('HSET', KEYS[1], candidateOwner, cjson.encode({ status = 'registered', joinedAt = candidate.joinedAt }))
    end
  end
end
redis.call('HSET', KEYS[1], '__revision', ARGV[5])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[14]))
return redis.call('HGETALL', KEYS[1])
`;

function unavailable() {
  return new AppError('Event registration is temporarily unavailable.', 503, 'REGISTRATION_UNAVAILABLE', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
function parseRecord(value: unknown): EventRegistrationRecord {
  if (!Array.isArray(value) || value.length % 2 || value.length > MAX_FIELDS * 2) throw unavailable();
  let revision: string | null = null;
  const entries: EventRegistrationRecord['entries'] = [];
  for (let index = 0; index < value.length; index += 2) {
    const field = value[index];
    const raw = value[index + 1];
    if (typeof field !== 'string' || typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_FIELD_BYTES)
      throw unavailable();
    if (field === '__revision') {
      const parsed = ownerSchema.safeParse(raw);
      if (!parsed.success) throw unavailable();
      revision = parsed.data;
      continue;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(field)) throw unavailable();
    try {
      const entry = eventRegistrationEntrySchema.parse(JSON.parse(raw));
      entries.push({ owner: field, ...entry });
    } catch {
      throw unavailable();
    }
  }
  entries.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.owner.localeCompare(b.owner));
  return { revision, entries };
}

export async function readEventRegistration(eventId: string): Promise<EventRegistrationRecord> {
  try {
    const raw = await storage().eval(
      READ,
      [communityEventKeys.registration(eventId)],
      [MAX_FIELDS, MAX_FIELD_BYTES, RETENTION_SECONDS],
    );
    if (raw === false) throw unavailable();
    return parseRecord(raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}

export async function getEventRegistration(event: CommunityEvent, owner: string, now = Date.now()) {
  return eventRegistrationSummary(event, await readEventRegistration(event.id), owner, now);
}

export async function mutateEventRegistration(event: CommunityEvent, input: EventRegistrationInput, owner: string) {
  const change = eventRegistrationInputSchema.parse(input);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  const joinedAt = new Date().toISOString();
  let raw: unknown;
  try {
    raw = await storage().eval(
      MUTATE,
      [communityEventKeys.registration(event.id), communityEventKeys.records],
      [
        owner,
        change.revision ?? '',
        change.action,
        change.action,
        randomUUID(),
        joinedAt,
        EVENT_ATTENDEE_LIMIT,
        EVENT_WAITLIST_LIMIT,
        event.id,
        event.startsAt ?? '',
        event.startsAt ? Date.parse(event.startsAt) : 0,
        event.endsAt ? Date.parse(event.endsAt) : 8_640_000_000_000_000,
        MAX_FIELDS,
        RETENTION_SECONDS,
      ],
    );
  } catch {
    throw unavailable();
  }
  if (raw === 'conflict')
    throw new AppError('Registration changed. Refresh before trying again.', 409, 'REGISTRATION_CONFLICT', true);
  if (raw === 'closed') throw new AppError('Registration is closed for this event.', 409, 'REGISTRATION_CLOSED', true);
  if (raw === 'full') throw new AppError('The attendee and waiting lists are full.', 409, 'REGISTRATION_FULL', true);
  if (raw === 'invalid') throw unavailable();
  return eventRegistrationSummary(event, parseRecord(raw), owner);
}
