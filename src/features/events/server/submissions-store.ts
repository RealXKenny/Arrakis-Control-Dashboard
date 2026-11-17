import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { communityEventKeys } from '../../../lib/redis/keys';
import type { CommunityEvent } from '../contracts';
import {
  EVENT_SUBMISSION_LIMIT,
  EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES,
  eventSubmissionSchema,
  submissionReviewSchema,
  submissionSaveSchema,
  type EventSubmission,
} from '../submissions';

const MAX_RECORD_BYTES = 16_384;
const RETENTION_SECONDS = 90 * 86_400;
const READ = `-- event-submissions-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const MUTATE = `-- event-submission-mutate
local id = ARGV[1]
local action = ARGV[3]
local oldRaw = redis.call('HGET', KEYS[1], id)
local old = nil
if oldRaw then
  local ok, value = pcall(cjson.decode, oldRaw)
  if not ok or type(value) ~= 'table' then return 'invalid' end
  old = value
  if old.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict' end
local rawEvent = redis.call('HGET', KEYS[2], ARGV[6])
if not rawEvent then return 'closed' end
local ok, event = pcall(cjson.decode, rawEvent)
if not ok or type(event) ~= 'table' or event.endsAt ~= ARGV[7] then return 'closed' end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local open = event.visibility == 'published' and event.status == 'open' and now < tonumber(ARGV[8])
if action == 'save' or action == 'withdraw' then
  if not open then return 'closed' end
  if old and (old.owner ~= ARGV[5] or old.result ~= cjson.null) then return 'forbidden' end
  if action == 'save' and old and not (old.status == 'pending' or old.status == 'rejected' or old.status == 'withdrawn') then
    return 'forbidden'
  end
  if not old then
    if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[9]) then return 'full' end
    for _, field in ipairs(redis.call('HKEYS', KEYS[1])) do
      local raw = redis.call('HGET', KEYS[1], field)
      local valid, entry = pcall(cjson.decode, raw)
      if not valid or type(entry) ~= 'table' then return 'invalid' end
      if entry.owner == ARGV[5] then return 'duplicate' end
    end
  end
elseif action == 'review' then
  if not old or old.status ~= 'pending' or not (event.status == 'open' or event.status == 'judging') then return 'closed' end
elseif action == 'judge' then
  if not old or old.status ~= 'approved' or not (event.status == 'judging' or event.status == 'completed') then return 'closed' end
  local next = cjson.decode(ARGV[4])
  if next.result == 'winner' then
    for _, field in ipairs(redis.call('HKEYS', KEYS[1])) do
      if field ~= id then
        local raw = redis.call('HGET', KEYS[1], field)
        local valid, entry = pcall(cjson.decode, raw)
        if not valid or type(entry) ~= 'table' then return 'invalid' end
        if entry.result == 'winner' then return 'winner-conflict' end
      end
    end
  end
else return 'invalid' end
redis.call('HSET', KEYS[1], id, ARGV[4])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[11]))
if ARGV[10] ~= '' then
  redis.call('SET', KEYS[3], ARGV[10], 'EX', tonumber(ARGV[11]))
end
return 'ok'
`;

function unavailable() {
  return new AppError('Event submissions are temporarily unavailable.', 503, 'SUBMISSIONS_UNAVAILABLE', true);
}
function conflict() {
  return new AppError('This submission changed. Refresh before trying again.', 409, 'SUBMISSION_CONFLICT', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
export function eventSubmissionOpen(event: CommunityEvent, now = Date.now()) {
  return event.visibility === 'published' && event.status === 'open' && event.endsAt && Date.parse(event.endsAt) > now;
}

export async function readEventSubmissions(eventId: string): Promise<EventSubmission[]> {
  try {
    const raw = await storage().eval(
      READ,
      [communityEventKeys.submissions(eventId)],
      [EVENT_SUBMISSION_LIMIT, MAX_RECORD_BYTES, RETENTION_SECONDS],
    );
    if (!Array.isArray(raw) || raw.length % 2 || raw.length > EVENT_SUBMISSION_LIMIT * 2) throw unavailable();
    const records: EventSubmission[] = [];
    for (let index = 0; index < raw.length; index += 2) {
      if (typeof raw[index] !== 'string' || typeof raw[index + 1] !== 'string') throw unavailable();
      const parsed = eventSubmissionSchema.safeParse(JSON.parse(raw[index + 1]));
      if (!parsed.success || parsed.data.id !== raw[index]) throw unavailable();
      records.push(parsed.data);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  } catch {
    throw unavailable();
  }
}

type MutationResult = 'ok' | 'conflict' | 'closed' | 'full' | 'duplicate' | 'forbidden' | 'winner-conflict';
async function mutate(
  event: CommunityEvent,
  action: 'save' | 'withdraw' | 'review' | 'judge',
  next: EventSubmission,
  expected: string | null,
  owner: string,
  image?: Buffer,
) {
  if (image && image.length > EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES)
    throw new AppError('The processed evidence image is too large.', 413, 'SUBMISSION_IMAGE_TOO_LARGE', true);
  let result: MutationResult;
  try {
    result = (await storage().eval(
      MUTATE,
      [
        communityEventKeys.submissions(event.id),
        communityEventKeys.records,
        communityEventKeys.submissionImage(event.id, next.id),
      ],
      [
        next.id,
        expected ?? '',
        action,
        JSON.stringify(next),
        owner,
        event.id,
        event.endsAt ?? '',
        event.endsAt ? Date.parse(event.endsAt) : 0,
        EVENT_SUBMISSION_LIMIT,
        image?.toString('base64') ?? '',
        RETENTION_SECONDS,
      ],
    )) as MutationResult;
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'duplicate')
    throw new AppError('You already have a submission for this event.', 409, 'SUBMISSION_DUPLICATE', true);
  if (result === 'full')
    throw new AppError('This event has reached its submission limit.', 409, 'SUBMISSIONS_FULL', true);
  if (result === 'forbidden')
    throw new AppError('You cannot change this submission.', 403, 'SUBMISSION_FORBIDDEN', true);
  if (result === 'winner-conflict')
    throw new AppError('Another submission is already confirmed as the winner.', 409, 'WINNER_CONFLICT', true);
  if (result === 'closed')
    throw new AppError('This action is closed for the event or submission.', 409, 'SUBMISSION_CLOSED', true);
  if (result !== 'ok') throw unavailable();
  return next;
}

export async function saveEventSubmission(
  event: CommunityEvent,
  input: unknown,
  owner: string,
  authorName: string,
  image?: { bytes: Buffer; version: string },
) {
  const parsed = submissionSaveSchema.parse(input);
  if (!eventSubmissionOpen(event, Date.now()))
    throw new AppError('Submissions are closed for this event.', 409, 'SUBMISSION_CLOSED', true);
  const records = await readEventSubmissions(event.id);
  const existing = parsed.id ? records.find((record) => record.id === parsed.id) : undefined;
  if (parsed.id && (!existing || existing.revision !== parsed.revision)) throw conflict();
  if (!existing && !image) throw new AppError('Add an evidence image.', 400, 'SUBMISSION_IMAGE_REQUIRED', true);
  if (existing && (existing.owner !== owner || existing.result)) throw conflict();
  const now = new Date().toISOString();
  const next = eventSubmissionSchema.parse({
    id: existing?.id ?? randomUUID(),
    owner,
    authorName: existing?.authorName ?? authorName,
    title: parsed.title,
    note: parsed.note,
    status: 'pending',
    reviewNote: null,
    result: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    reviewedAt: null,
    judgedAt: null,
    revision: randomUUID(),
    imageVersion: image?.version ?? existing?.imageVersion,
  });
  return mutate(event, 'save', next, existing?.revision ?? null, owner, image?.bytes);
}

export async function withdrawEventSubmission(event: CommunityEvent, id: string, revision: string, owner: string) {
  if (!eventSubmissionOpen(event, Date.now()))
    throw new AppError('Submission changes are closed for this event.', 409, 'SUBMISSION_CLOSED', true);
  const existing = (await readEventSubmissions(event.id)).find((record) => record.id === id);
  if (!existing || existing.revision !== revision) throw conflict();
  const next = eventSubmissionSchema.parse({
    ...existing,
    status: 'withdrawn',
    result: null,
    reviewNote: null,
    updatedAt: new Date().toISOString(),
    revision: randomUUID(),
  });
  return mutate(event, 'withdraw', next, revision, owner);
}

export async function reviewEventSubmission(event: CommunityEvent, id: string, input: unknown) {
  const parsed = submissionReviewSchema.parse(input);
  const existing = (await readEventSubmissions(event.id)).find((record) => record.id === id);
  if (!existing || existing.revision !== parsed.revision) throw conflict();
  const now = new Date().toISOString();
  const next = eventSubmissionSchema.parse(
    parsed.action === 'review'
      ? {
          ...existing,
          status: parsed.status,
          reviewNote: parsed.note || null,
          reviewedAt: now,
          updatedAt: now,
          revision: randomUUID(),
        }
      : {
          ...existing,
          result: parsed.result,
          judgedAt: now,
          updatedAt: now,
          revision: randomUUID(),
        },
  );
  return mutate(event, parsed.action, next, parsed.revision, existing.owner);
}

export async function readSubmissionImage(eventId: string, submissionId: string): Promise<Buffer | null> {
  const raw = await storage().get<string>(communityEventKeys.submissionImage(eventId, submissionId));
  if (typeof raw !== 'string' || raw.length > EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES * 2) return null;
  const bytes = Buffer.from(raw, 'base64');
  if (
    !bytes.length ||
    bytes.length > EVENT_SUBMISSION_STORED_IMAGE_MAX_BYTES ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  )
    return null;
  return bytes;
}
